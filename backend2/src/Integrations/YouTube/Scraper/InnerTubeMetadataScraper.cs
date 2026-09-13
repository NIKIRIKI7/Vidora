using System.Globalization;
using System.Text.Json;
using System.Text.RegularExpressions;
using System.Xml;
using Integrations.YouTube.Config;
using Integrations.YouTube.Contracts;
using Integrations.YouTube.Exceptions;
using Integrations.YouTube.Innertube;
using Integrations.YouTube.Innertube.Contracts;
using Integrations.YouTube.Innertube.Resolving;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace Integrations.YouTube.Scraper;

public sealed class InnerTubeMetadataScraper : IYouTubeMetadataScraper
{
    private readonly IInnerTubeClient _innerTubeClient;
    private readonly IYouTubeQueryResolver _queryResolver;
    private readonly HttpClient _httpClient;
    private readonly YouTubeOptions _options;
    private readonly ILogger<InnerTubeMetadataScraper> _logger;

    public InnerTubeMetadataScraper(
        IInnerTubeClient innerTubeClient,
        IYouTubeQueryResolver queryResolver,
        HttpClient httpClient,
        IOptions<YouTubeOptions> options,
        ILogger<InnerTubeMetadataScraper> logger)
    {
        _innerTubeClient = innerTubeClient;
        _queryResolver = queryResolver;
        _httpClient = httpClient;
        _options = options.Value;
        _logger = logger;
    }

    public async Task<YouTubeVideoMetadata> ScrapeVideoMetadataAsync(
        string videoUrlOrId,
        CancellationToken cancellationToken = default)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(videoUrlOrId);
        var videoId = ResolveVideoId(videoUrlOrId);

        try
        {
            var item = await _innerTubeClient.GetVideoDetailsAsync(videoId, cancellationToken);
            if (item != null)
            {
                long? subscribers = null;
                if (!string.IsNullOrWhiteSpace(item.ChannelId))
                {
                    try
                    {
                        var subs = await _innerTubeClient.GetChannelSubscribersAsync(item.ChannelId, cancellationToken);
                        if (subs > 0) subscribers = subs;
                    }
                    catch
                    {
                    }
                }

                IReadOnlyList<string> comments = [];
                try
                {
                    comments = await _innerTubeClient.GetCommentsAsync(videoId, 10, cancellationToken);
                }
                catch
                {
                }

                string? uploadDate = null;
                DateTimeOffset? publishedAt = null;
                try
                {
                    var dateText = await _innerTubeClient.GetVideoUploadDateAsync(videoId, cancellationToken);
                    if (!string.IsNullOrWhiteSpace(dateText))
                    {
                        uploadDate = dateText;
                        if (DateTimeOffset.TryParse(
                                dateText, CultureInfo.InvariantCulture,
                                DateTimeStyles.AssumeUniversal | DateTimeStyles.AdjustToUniversal,
                                out var parsed))
                        {
                            publishedAt = parsed;
                        }
                    }
                }
                catch
                {
                }

                return new YouTubeVideoMetadata
                {
                    VideoId = item.VideoId,
                    Title = item.Title,
                    Description = item.Description,
                    ChannelTitle = item.ChannelTitle,
                    ChannelId = item.ChannelId,
                    SubscriberCount = subscribers,
                    ViewCount = item.ViewCount,
                    Duration = TimeSpan.FromSeconds(item.DurationSeconds),
                    UploadDate = uploadDate,
                    PublishedAt = publishedAt,
                    ThumbnailUrl = item.ThumbnailUrl,
                    Comments = comments
                };
            }
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
            throw;
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            _logger.LogWarning(ex, "[InnerTube] Сбой получения метаданных для {VideoId}", videoId);
        }

        if (!string.IsNullOrWhiteSpace(_options.ApiKey))
        {
            try
            {
                var apiMetadata = await FetchSingleVideoApiAsync(videoId, _options.ApiKey, cancellationToken);
                if (apiMetadata != null) return apiMetadata;
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                _logger.LogWarning(ex, "[YouTube API] Сбой Data API для {VideoId}", videoId);
            }
        }

        throw new YouTubeScrapeException($"Не удалось получить метаданные видео '{videoId}' через InnerTube.", videoUrlOrId);
    }

    public async Task<IReadOnlyList<YouTubeVideoMetadata>> SearchVideosAsync(
        string query,
        int maxResults = 20,
        int daysBack = 0,
        string lang = "ru",
        CancellationToken cancellationToken = default)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(query);
        maxResults = Math.Clamp(maxResults, 1, 50);

        try
        {
            _logger.LogInformation("[InnerTube] Поиск видео: '{Query}' (за {Days} дн., язык: {Lang})", query, daysBack, lang);
            var innerTubeResults = await _innerTubeClient.SearchVideosAsync(query, maxResults, daysBack, lang, cancellationToken);
            if (innerTubeResults.Count > 0)
            {
                var cutoffDate = daysBack > 0 ? DateTimeOffset.UtcNow.AddDays(-daysBack) : DateTimeOffset.MinValue;
                var parsedList = new List<YouTubeVideoMetadata>();

                foreach (var item in innerTubeResults)
                {
                    var pubDate = ParseRelativePublishedTime(item.PublishedText)
                        ?? (daysBack > 0 ? DateTimeOffset.UtcNow.AddDays(-Math.Max(1, daysBack / 2.0)) : DateTimeOffset.UtcNow.AddDays(-10));

                    if (daysBack > 0 && pubDate < cutoffDate) continue;

                    parsedList.Add(new YouTubeVideoMetadata
                    {
                        VideoId = item.VideoId,
                        Title = item.Title,
                        Description = item.Description,
                        ChannelTitle = item.ChannelTitle,
                        ChannelId = item.ChannelId,
                        SubscriberCount = item.SubscriberCount > 0 ? item.SubscriberCount : null,
                        ViewCount = item.ViewCount,
                        Duration = TimeSpan.FromSeconds(item.DurationSeconds),
                        PublishedAt = pubDate,
                        ThumbnailUrl = item.ThumbnailUrl
                    });
                }

                if (parsedList.Count > 0) return parsedList;
            }
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
            throw;
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            _logger.LogWarning(ex, "[InnerTube] Ошибка поиска по запросу '{Query}'", query);
        }

        if (!string.IsNullOrWhiteSpace(_options.ApiKey))
        {
            try
            {
                var apiResults = await ExecuteYouTubeApiSearchAsync(query, maxResults, _options.ApiKey, cancellationToken);
                if (apiResults.Count > 0) return apiResults;
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                _logger.LogWarning(ex, "[YouTube API] Сбой Data API при поиске.");
            }
        }

        return [];
    }

    public async Task<IReadOnlyList<YouTubeVideoMetadata>> GetRelatedVideosAsync(
        string videoUrlOrId,
        int maxResults = 25,
        string lang = "ru",
        CancellationToken cancellationToken = default)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(videoUrlOrId);
        var videoId = ResolveVideoId(videoUrlOrId);

        try
        {
            var related = await _innerTubeClient.GetRelatedVideosAsync(videoId, maxResults, lang, cancellationToken);
            return related.Select(item => new YouTubeVideoMetadata
            {
                VideoId = item.VideoId,
                Title = item.Title,
                Description = item.Description,
                ChannelTitle = item.ChannelTitle,
                ChannelId = item.ChannelId,
                SubscriberCount = item.SubscriberCount > 0 ? item.SubscriberCount : null,
                ViewCount = item.ViewCount,
                Duration = TimeSpan.FromSeconds(item.DurationSeconds),
                PublishedAt = ParseRelativePublishedTime(item.PublishedText) ?? DateTimeOffset.MinValue,
                ThumbnailUrl = item.ThumbnailUrl
            }).ToList();
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            _logger.LogDebug(ex, "[InnerTube] Не удалось получить рекомендации для {VideoId}", videoId);
            return [];
        }
    }

    public async Task<IReadOnlyList<YouTubeVideoMetadata>> GetTrendingVideosAsync(
        string lang = "ru",
        CancellationToken cancellationToken = default)
    {
        try
        {
            var trending = await _innerTubeClient.GetTrendingVideosAsync(lang, cancellationToken);
            return trending.Select(item => new YouTubeVideoMetadata
            {
                VideoId = item.VideoId,
                Title = item.Title,
                ChannelTitle = item.ChannelTitle,
                ChannelId = item.ChannelId,
                ViewCount = item.ViewCount,
                Duration = TimeSpan.FromSeconds(item.DurationSeconds),
                PublishedAt = ParseRelativePublishedTime(item.PublishedText) ?? DateTimeOffset.UtcNow.AddDays(-2),
                ThumbnailUrl = item.ThumbnailUrl
            }).ToList();
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            _logger.LogDebug(ex, "[InnerTube] Не удалось загрузить Trending Feed");
            return [];
        }
    }

    public async Task<IReadOnlyList<YouTubeVideoMetadata>> GetHomeFeedVideosAsync(
        string lang = "ru",
        CancellationToken cancellationToken = default)
    {
        try
        {
            var homeVideos = await _innerTubeClient.GetHomeFeedVideosAsync(lang, cancellationToken);
            return homeVideos.Select(item => new YouTubeVideoMetadata
            {
                VideoId = item.VideoId,
                Title = item.Title,
                ChannelTitle = item.ChannelTitle,
                ChannelId = item.ChannelId,
                ViewCount = item.ViewCount,
                Duration = TimeSpan.FromSeconds(item.DurationSeconds),
                PublishedAt = ParseRelativePublishedTime(item.PublishedText) ?? DateTimeOffset.UtcNow.AddDays(-2),
                ThumbnailUrl = item.ThumbnailUrl
            }).ToList();
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            _logger.LogDebug(ex, "[InnerTube] Не удалось загрузить Home Feed");
            return [];
        }
    }

    public async Task<IReadOnlyList<string>> ScrapeCommentsAsync(
        string videoUrlOrId,
        int maxComments = 20,
        CancellationToken cancellationToken = default)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(videoUrlOrId);
        var videoId = ResolveVideoId(videoUrlOrId);

        try
        {
            var comments = await _innerTubeClient.GetCommentsAsync(videoId, maxComments, cancellationToken);
            if (comments.Count > 0) return comments;
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            _logger.LogDebug(ex, "[InnerTube] Сбой выгрузки комментариев для {VideoId}", videoId);
        }

        if (!string.IsNullOrWhiteSpace(_options.ApiKey))
        {
            try
            {
                var comments = await FetchCommentsApiAsync(videoId, maxComments, _options.ApiKey, cancellationToken);
                if (comments.Count > 0) return comments;
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                _logger.LogWarning(ex, "[YouTube API] Сбой API комментариев для {VideoId}", videoId);
            }
        }

        return [];
    }

    public async Task<string?> ScrapeTranscriptAsync(
        string videoUrlOrId,
        string[]? preferredLangs = null,
        CancellationToken cancellationToken = default)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(videoUrlOrId);
        var videoId = ResolveVideoId(videoUrlOrId);

        try
        {
            return await _innerTubeClient.ExtractFastSubtitlesAsync(videoId, preferredLangs, cancellationToken);
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            _logger.LogDebug(ex, "[InnerTube] Субтитры недоступны для {VideoId}", videoId);
            return null;
        }
    }

    public async Task<IReadOnlyList<YouTubeVideoMetadata>> SearchVideosFilteredAsync(
        string query,
        YouTubeSearchFilter? filter = null,
        int maxResults = 20,
        string lang = "ru",
        CancellationToken cancellationToken = default)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(query);
        maxResults = Math.Clamp(maxResults, 1, 50);

        try
        {
            var itFilter = filter != null ? MapToInnerTubeFilter(filter) : null;
            var results = await _innerTubeClient.SearchVideosFilteredAsync(query, itFilter, maxResults, lang, cancellationToken);
            return results.Select(MapToMetadata).ToList();
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            _logger.LogWarning(ex, "[InnerTube] Ошибка фильтрованного поиска по запросу '{Query}'", query);
            return [];
        }
    }

    public async Task<IReadOnlyList<YouTubeCommentItem>> ScrapeCommentsDetailedAsync(
        string videoUrlOrId,
        int maxComments = 50,
        CancellationToken cancellationToken = default)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(videoUrlOrId);
        var videoId = ResolveVideoId(videoUrlOrId);

        try
        {
            var comments = await _innerTubeClient.GetCommentsDetailedAsync(videoId, maxComments, cancellationToken);
            return comments.Select(c => new YouTubeCommentItem(
                c.AuthorName,
                c.AuthorChannelId,
                c.Text,
                c.LikeCount,
                c.PublishedTime,
                c.CommentId,
                c.Category)).ToList();
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            _logger.LogDebug(ex, "[InnerTube] Сбой детальных комментариев для {VideoId}", videoId);
            return [];
        }
    }

    public async Task<IReadOnlyList<YouTubeVideoChapter>> GetVideoChaptersAsync(
        string videoUrlOrId,
        CancellationToken cancellationToken = default)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(videoUrlOrId);
        var videoId = ResolveVideoId(videoUrlOrId);

        try
        {
            var chapters = await _innerTubeClient.GetVideoChaptersAsync(videoId, cancellationToken);
            return chapters.Select(c => new YouTubeVideoChapter(
                c.StartSeconds, c.EndSeconds, c.Title, c.ThumbnailUrl)).ToList();
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            _logger.LogDebug(ex, "[InnerTube] Сбой получения глав для {VideoId}", videoId);
            return [];
        }
    }

    public async Task<IReadOnlyList<YouTubeHeatmapPoint>> GetVideoHeatmapAsync(
        string videoUrlOrId,
        CancellationToken cancellationToken = default)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(videoUrlOrId);
        var videoId = ResolveVideoId(videoUrlOrId);

        try
        {
            var heatmap = await _innerTubeClient.GetVideoHeatmapAsync(videoId, cancellationToken);
            return heatmap.Select(h => new YouTubeHeatmapPoint(
                h.StartSeconds, h.EndSeconds, h.Intensity)).ToList();
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            _logger.LogDebug(ex, "[InnerTube] Сбой получения heatmap для {VideoId}", videoId);
            return [];
        }
    }

    public async Task<IReadOnlyList<YouTubeWordTimestamp>> GetWordTimestampsAsync(
        string videoUrlOrId,
        CancellationToken cancellationToken = default)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(videoUrlOrId);
        var videoId = ResolveVideoId(videoUrlOrId);

        try
        {
            var words = await _innerTubeClient.GetWordTimestampsAsync(videoId, cancellationToken);
            return words.Select(w => new YouTubeWordTimestamp(
                w.StartMs, w.EndMs, w.Word)).ToList();
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            _logger.LogDebug(ex, "[InnerTube] Сбой получения word timestamps для {VideoId}", videoId);
            return [];
        }
    }

    public async Task<YouTubeChannelStats> GetChannelStatsAsync(
        string channelId,
        CancellationToken cancellationToken = default)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(channelId);

        try
        {
            var stats = await _innerTubeClient.GetChannelStatsAsync(channelId, cancellationToken);
            return new YouTubeChannelStats(
                stats.SubscriberCount, stats.TotalViewCount, stats.VideoCount, stats.Description);
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            _logger.LogDebug(ex, "[InnerTube] Сбой статистики канала {ChannelId}", channelId);
            return new YouTubeChannelStats(0, 0, 0, "");
        }
    }

    public async Task<IReadOnlyList<YouTubeChannelUpload>> GetChannelRecentUploadsAsync(
        string channelId,
        int maxUploads = 15,
        string lang = "ru",
        CancellationToken cancellationToken = default)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(channelId);

        try
        {
            var uploads = await _innerTubeClient.GetChannelRecentUploadsAsync(channelId, maxUploads, lang, cancellationToken);
            return uploads.Select(u => new YouTubeChannelUpload(
                u.VideoId, u.Title, u.ThumbnailUrl, u.ViewCount, u.PublishedText, u.DurationSeconds)).ToList();
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            _logger.LogDebug(ex, "[InnerTube] Сбой загрузок канала {ChannelId}", channelId);
            return [];
        }
    }

    private static InnerTubeSearchFilter MapToInnerTubeFilter(YouTubeSearchFilter filter)
    {
        return new InnerTubeSearchFilter
        {
            UploadDate = filter.UploadDate,
            Type = filter.Type,
            Duration = filter.Duration,
            SortBy = filter.SortBy,
            Features = filter.Features
        };
    }

    private static YouTubeVideoMetadata MapToMetadata(InnerTubeVideoItem item)
    {
        return new YouTubeVideoMetadata
        {
            VideoId = item.VideoId,
            Title = item.Title,
            Description = item.Description,
            ChannelTitle = item.ChannelTitle,
            ChannelId = item.ChannelId,
            SubscriberCount = item.SubscriberCount > 0 ? item.SubscriberCount : null,
            ViewCount = item.ViewCount,
            Duration = TimeSpan.FromSeconds(item.DurationSeconds),
            ThumbnailUrl = item.ThumbnailUrl
        };
    }

    private string ResolveVideoId(string videoUrlOrId)
    {
        var resolved = _queryResolver.Resolve(videoUrlOrId);
        return !string.IsNullOrWhiteSpace(resolved.ExtractedId)
            ? resolved.ExtractedId
            : videoUrlOrId.Trim();
    }

    #region Helpers & Data API Fallback

    public static DateTimeOffset? ParseRelativePublishedTime(string? text)
    {
        if (string.IsNullOrWhiteSpace(text)) return null;
        var clean = text.ToLowerInvariant().Trim();

        var match = Regex.Match(clean, @"(\d+)\s*([а-яa-z]+)");
        if (!match.Success) return null;

        if (!int.TryParse(match.Groups[1].Value, out int count)) return null;
        var unit = match.Groups[2].Value.TrimEnd('.');

        var now = DateTimeOffset.UtcNow;
        if (unit.StartsWith("мин") || unit.StartsWith("min") || unit == "m")
            return now.AddMinutes(-count);
        if (unit.StartsWith("час") || unit.StartsWith("ч") || unit.StartsWith("hour") || unit.StartsWith("hr") || unit == "h")
            return now.AddHours(-count);
        if (unit.StartsWith("дн") || unit.StartsWith("ден") || unit.StartsWith("дня") || unit.StartsWith("дне") || unit.StartsWith("day") || unit == "d")
            return now.AddDays(-count);
        if (unit.StartsWith("нед") || unit.StartsWith("week") || unit.StartsWith("wk") || unit == "w")
            return now.AddDays(-count * 7);
        if (unit.StartsWith("мес") || unit.StartsWith("month") || unit.StartsWith("mo"))
            return now.AddDays(-count * 30.5);
        if (unit.StartsWith("год") || unit.StartsWith("лет") || unit.StartsWith("г") || unit.StartsWith("year") || unit.StartsWith("yr") || unit == "y")
            return now.AddDays(-count * 365.25);

        return null;
    }

    private async Task<YouTubeVideoMetadata?> FetchSingleVideoApiAsync(string videoId, string apiKey, CancellationToken ct)
    {
        var url = $"https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails,statistics&id={videoId}&key={apiKey}";
        using var res = await _httpClient.GetAsync(url, ct);
        if (!res.IsSuccessStatusCode) return null;

        await using var stream = await res.Content.ReadAsStreamAsync(ct);
        using var doc = await JsonDocument.ParseAsync(stream, cancellationToken: ct);
        if (!doc.RootElement.TryGetProperty("items", out var items) || items.GetArrayLength() == 0) return null;

        var item = items[0];
        var snippet = item.GetProperty("snippet");
        var stats = item.GetProperty("statistics");
        var content = item.GetProperty("contentDetails");

        var channelId = snippet.GetProperty("channelId").GetString() ?? string.Empty;
        var duration = ParseIsoDuration(content.GetProperty("duration").GetString() ?? "PT0S");
        long views = stats.TryGetProperty("viewCount", out var vc) && vc.TryGetInt64(out var vci) ? vci : 0;
        var publishedStr = snippet.GetProperty("publishedAt").GetString();

        return new YouTubeVideoMetadata
        {
            VideoId = videoId,
            Title = snippet.GetProperty("title").GetString() ?? string.Empty,
            Description = snippet.GetProperty("description").GetString() ?? string.Empty,
            ChannelTitle = snippet.GetProperty("channelTitle").GetString() ?? string.Empty,
            ChannelId = channelId,
            ViewCount = views,
            Duration = duration,
            UploadDate = publishedStr,
            PublishedAt = DateTimeOffset.TryParse(publishedStr, out var dto) ? dto : null,
            ThumbnailUrl = $"https://i.ytimg.com/vi/{videoId}/hqdefault.jpg"
        };
    }

    private async Task<IReadOnlyList<YouTubeVideoMetadata>> ExecuteYouTubeApiSearchAsync(
        string query, int maxResults, string apiKey, CancellationToken ct)
    {
        var searchUrl = $"https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults={maxResults}&q={Uri.EscapeDataString(query)}&key={apiKey}";
        using var searchResponse = await _httpClient.GetAsync(searchUrl, ct);
        if (!searchResponse.IsSuccessStatusCode) return [];

        await using var searchStream = await searchResponse.Content.ReadAsStreamAsync(ct);
        using var searchDoc = await JsonDocument.ParseAsync(searchStream, cancellationToken: ct);

        var videoIds = new List<string>();
        if (searchDoc.RootElement.TryGetProperty("items", out var items) && items.ValueKind == JsonValueKind.Array)
        {
            foreach (var item in items.EnumerateArray())
            {
                if (item.TryGetProperty("id", out var idObj) && idObj.TryGetProperty("videoId", out var vid))
                {
                    var idStr = vid.GetString();
                    if (!string.IsNullOrWhiteSpace(idStr)) videoIds.Add(idStr);
                }
            }
        }

        if (videoIds.Count == 0) return [];

        var videosUrl = $"https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails,statistics&id={string.Join(',', videoIds)}&key={apiKey}";
        using var videosResponse = await _httpClient.GetAsync(videosUrl, ct);
        if (!videosResponse.IsSuccessStatusCode) return [];

        await using var videosStream = await videosResponse.Content.ReadAsStreamAsync(ct);
        using var videosDoc = await JsonDocument.ParseAsync(videosStream, cancellationToken: ct);

        var results = new List<YouTubeVideoMetadata>();
        if (videosDoc.RootElement.TryGetProperty("items", out var videoItems) && videoItems.ValueKind == JsonValueKind.Array)
        {
            foreach (var item in videoItems.EnumerateArray())
            {
                var vId = item.GetProperty("id").GetString()!;
                var snippet = item.GetProperty("snippet");
                var stats = item.GetProperty("statistics");
                var content = item.GetProperty("contentDetails");

                long views = stats.TryGetProperty("viewCount", out var vc) && vc.TryGetInt64(out var vci) ? vci : 0;
                var duration = ParseIsoDuration(content.GetProperty("duration").GetString() ?? "PT0S");
                var publishedStr = snippet.GetProperty("publishedAt").GetString();

                results.Add(new YouTubeVideoMetadata
                {
                    VideoId = vId,
                    Title = snippet.GetProperty("title").GetString() ?? string.Empty,
                    Description = snippet.GetProperty("description").GetString() ?? string.Empty,
                    ChannelTitle = snippet.GetProperty("channelTitle").GetString() ?? string.Empty,
                    ChannelId = snippet.GetProperty("channelId").GetString() ?? string.Empty,
                    ViewCount = views,
                    Duration = duration,
                    UploadDate = publishedStr,
                    PublishedAt = DateTimeOffset.TryParse(publishedStr, out var dto) ? dto : null,
                    ThumbnailUrl = $"https://i.ytimg.com/vi/{vId}/hqdefault.jpg"
                });
            }
        }

        return results;
    }

    private async Task<IReadOnlyList<string>> FetchCommentsApiAsync(string videoId, int maxComments, string apiKey, CancellationToken ct)
    {
        var url = $"https://www.googleapis.com/youtube/v3/commentThreads?part=snippet&videoId={videoId}&maxResults={maxComments}&order=relevance&key={apiKey}";
        using var res = await _httpClient.GetAsync(url, ct);
        if (!res.IsSuccessStatusCode) return [];

        await using var stream = await res.Content.ReadAsStreamAsync(ct);
        using var doc = await JsonDocument.ParseAsync(stream, cancellationToken: ct);
        var comments = new List<string>();

        if (doc.RootElement.TryGetProperty("items", out var items) && items.ValueKind == JsonValueKind.Array)
        {
            foreach (var item in items.EnumerateArray())
            {
                if (item.TryGetProperty("snippet", out var sn) &&
                    sn.TryGetProperty("topLevelComment", out var tlc) &&
                    tlc.TryGetProperty("snippet", out var commentSnippet) &&
                    commentSnippet.TryGetProperty("textDisplay", out var text))
                {
                    var textStr = text.GetString();
                    if (!string.IsNullOrWhiteSpace(textStr)) comments.Add(textStr.Trim());
                }
            }
        }

        return comments;
    }

    private static TimeSpan ParseIsoDuration(string iso)
    {
        try { return XmlConvert.ToTimeSpan(iso); } catch { return TimeSpan.Zero; }
    }

    #endregion
}
