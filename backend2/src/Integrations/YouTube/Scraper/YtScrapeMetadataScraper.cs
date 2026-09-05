using System.Globalization;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using System.Xml;
using Integrations.YouTube.Config;
using Integrations.YouTube.Contracts;
using Integrations.YouTube.Exceptions;
using Integrations.YouTube.Innertube;
using Kernel.Platform.Process;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Research.Infrastructure.Ingestors;

namespace Integrations.YouTube.Scraper;

public sealed partial class YtScrapeMetadataScraper : IYouTubeMetadataScraper
{
    private readonly IProcessSupervisor _processSupervisor;
    private readonly HttpClient _httpClient;
    private readonly IInnerTubeClient? _innerTubeClient;
    private readonly YouTubeOptions _options;
    private readonly ILogger<YtScrapeMetadataScraper> _logger;

    [ActivatorUtilitiesConstructor]
    public YtScrapeMetadataScraper(
        IProcessSupervisor processSupervisor,
        HttpClient httpClient,
        IOptions<YouTubeOptions> options,
        ILogger<YtScrapeMetadataScraper> logger,
        IInnerTubeClient? innerTubeClient = null)
    {
        _processSupervisor = processSupervisor;
        _httpClient = httpClient;
        _options = options.Value;
        _logger = logger;
        _innerTubeClient = innerTubeClient;
    }

    public async Task<YouTubeVideoMetadata> ScrapeVideoMetadataAsync(
        string videoUrlOrId,
        CancellationToken cancellationToken = default)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(videoUrlOrId);
        var pythonExe = _options.ResolvePythonExecutable();
        var scriptPath = _options.ResolveMetadataScript();

        if (File.Exists(scriptPath))
        {
            var arguments = $"\"{scriptPath}\" \"{videoUrlOrId.Trim()}\"";
            using var timeoutCts = new CancellationTokenSource(TimeSpan.FromSeconds(_options.ScrapeTimeoutSeconds));
            using var linkedCts = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken, timeoutCts.Token);

            try
            {
                var result = await _processSupervisor.RunAsync(
                    pythonExe,
                    arguments,
                    workingDirectory: Path.GetDirectoryName(scriptPath),
                    cancellationToken: linkedCts.Token);

                if (result.ExitCode == 0 && !string.IsNullOrWhiteSpace(result.StandardOutput))
                {
                    return ParseJsonOutput(result.StandardOutput, videoUrlOrId);
                }
            }
            catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
            {
                throw;
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "[yt-scrapper] Python-скрипт не вернул результат. Переход на yt-dlp.");
            }
        }

        try
        {
            return await FetchVideoYtDlpAsync(videoUrlOrId, cancellationToken);
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
            throw;
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "[yt-dlp] Не удалось получить метаданные через yt-dlp.");
        }

        if (!string.IsNullOrWhiteSpace(_options.ApiKey))
        {
            try
            {
                var apiMetadata = await FetchSingleVideoApiAsync(videoUrlOrId, _options.ApiKey, cancellationToken);
                if (apiMetadata != null) return apiMetadata;
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                _logger.LogWarning(ex, "[YouTube API] Сбой API для видео {Id}.", videoUrlOrId);
            }
        }

        throw new YouTubeScrapeException("Не удалось получить метаданные видео ни через yt-scrapper, ни через yt-dlp.", videoUrlOrId);
    }

    public async Task<IReadOnlyList<YouTubeVideoMetadata>> SearchVideosAsync(
        string query,
        int maxResults = 25,
        int daysBack = 0,
        string lang = "ru",
        CancellationToken cancellationToken = default)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(query);
        maxResults = Math.Clamp(maxResults, 1, 50);

        try
        {
            _logger.LogInformation("[yt-scrapper] Поиск видео через yt-dlp: '{Query}' (за {Days} дн., язык: {Lang})", query, daysBack, lang);
            var ytdlpResults = await ExecuteYtDlpSearchAsync(query, maxResults, daysBack, lang, cancellationToken);
            if (ytdlpResults.Count > 0)
            {
                _logger.LogInformation("[yt-scrapper] Найдено {Count} свежих видео", ytdlpResults.Count);
                return ytdlpResults;
            }
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
            throw;
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "[yt-scrapper] Сбой поиска yt-dlp. Переход к fallback (InnerTube).");
        }

        if (_innerTubeClient != null)
        {
            try
            {
                _logger.LogInformation("[InnerTube] Fallback поиск видео: '{Query}' (язык: {Lang})", query, lang);
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
                            ChannelTitle = item.ChannelTitle,
                            ChannelId = item.ChannelId,
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
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "[InnerTube] Поиск через InnerTube также не вернул результатов.");
            }
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
                _logger.LogWarning(ex, "[YouTube API] Сбой Data API поиска.");
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
        var videoId = ExtractVideoId(videoUrlOrId);

        if (_innerTubeClient != null)
        {
            try
            {
                var related = await _innerTubeClient.GetRelatedVideosAsync(videoId, maxResults, lang, cancellationToken);
                if (related.Count > 0)
                {
                    return related.Select(item => new YouTubeVideoMetadata
                    {
                        VideoId = item.VideoId,
                        Title = item.Title,
                        ChannelTitle = item.ChannelTitle,
                        ChannelId = item.ChannelId,
                        ViewCount = item.ViewCount,
                        Duration = TimeSpan.FromSeconds(item.DurationSeconds),
                        PublishedAt = ParseRelativePublishedTime(item.PublishedText) ?? DateTimeOffset.MinValue,
                        ThumbnailUrl = item.ThumbnailUrl
                    }).ToList();
                }
            }
            catch (Exception ex)
            {
                _logger.LogDebug(ex, "[YtScraper] Не удалось получить рекомендации через InnerTube для {Id}", videoId);
            }
        }

        return [];
    }

    public async Task<IReadOnlyList<YouTubeVideoMetadata>> GetTrendingVideosAsync(
        string lang = "ru",
        CancellationToken cancellationToken = default)
    {
        if (_innerTubeClient != null)
        {
            try
            {
                var trending = await _innerTubeClient.GetTrendingVideosAsync(lang, cancellationToken);
                if (trending.Count > 0)
                {
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
            }
            catch (Exception ex)
            {
                _logger.LogDebug(ex, "[YtScraper] Не удалось загрузить YouTube Trending Feed");
            }
        }

        return [];
    }

    /// <summary>
    /// Извлечение роликов с главной страницы YouTube (FEwhat_to_watch)
    /// </summary>
    public async Task<IReadOnlyList<YouTubeVideoMetadata>> GetHomeFeedVideosAsync(
        string lang = "ru",
        CancellationToken cancellationToken = default)
    {
        if (_innerTubeClient != null)
        {
            try
            {
                var homeVideos = await _innerTubeClient.GetHomeFeedVideosAsync(lang, cancellationToken);
                if (homeVideos.Count > 0)
                {
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
            }
            catch (Exception ex)
            {
                _logger.LogDebug(ex, "[YtScraper] Не удалось загрузить Home Feed через InnerTube");
            }
        }

        return [];
    }

    public async Task<IReadOnlyList<string>> ScrapeCommentsAsync(
        string videoUrlOrId,
        int maxComments = 20,
        CancellationToken cancellationToken = default)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(videoUrlOrId);
        maxComments = Math.Clamp(maxComments, 1, 100);
        var videoId = ExtractVideoId(videoUrlOrId);

        try
        {
            var comments = await FetchCommentsYtDlpAsync(videoId, maxComments, cancellationToken);
            if (comments.Count > 0) return comments;
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            _logger.LogDebug(ex, "[yt-dlp] Не удалось выгрузить комментарии для {VideoId}.", videoId);
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
                _logger.LogWarning(ex, "[YouTube API] Сбой API комментариев для {VideoId}.", videoId);
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
        var videoId = ExtractVideoId(videoUrlOrId);
        preferredLangs ??= ["ru", "en"];

        try
        {
            var transcript = await FetchTranscriptYtDlpAsync(videoId, preferredLangs, cancellationToken);
            if (!string.IsNullOrWhiteSpace(transcript)) return transcript;
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            _logger.LogDebug(ex, "[yt-dlp] Субтитры через yt-dlp недоступны для {VideoId}", videoId);
        }

        if (_innerTubeClient != null)
        {
            try
            {
                var transcript = await _innerTubeClient.ExtractFastSubtitlesAsync(videoId, preferredLangs, cancellationToken);
                if (!string.IsNullOrWhiteSpace(transcript)) return transcript;
            }
            catch { }
        }

        return null;
    }

    #region yt-dlp Core Implementation
    private async Task<IReadOnlyList<YouTubeVideoMetadata>> ExecuteYtDlpSearchAsync(
        string query, int maxResults, int daysBack, string lang, CancellationToken ct)
    {
        var ytDlpExe = _options.ResolveYtDlpExecutable();

        var sanitizedQuery = Regex.Replace(query.Replace("\"", ""), @"[,;]+", " ").Trim();
        sanitizedQuery = Regex.Replace(sanitizedQuery, @"\s+", " ");

        if (lang.StartsWith("en", StringComparison.OrdinalIgnoreCase) && Regex.IsMatch(sanitizedQuery, @"[\u0400-\u04FF]"))
        {
            sanitizedQuery = SignalIngestor.ToEnglishTechQuery(sanitizedQuery);
        }

        var args = new List<string>
        {
            "--no-playlist",
            "--flat-playlist",
            "--extractor-args", "youtubetab:approximate_date",
            "--socket-timeout", "12",
            "--retries", "2"
        };

        if (lang.StartsWith("en", StringComparison.OrdinalIgnoreCase))
        {
            args.Add("--extractor-args");
            args.Add("youtube:lang=en");
        }
        else if (lang.StartsWith("ru", StringComparison.OrdinalIgnoreCase))
        {
            args.Add("--extractor-args");
            args.Add("youtube:lang=ru");
        }

        if (daysBack > 0 && daysBack <= 30)
        {
            string spParam = daysBack switch
            {
                <= 1 => "EgIIAg%253D%253D",
                <= 7 => "EgIIAw%253D%253D",
                _ => "EgIIBA%253D%253D"
            };

            var searchUrl = $"https://www.youtube.com/results?search_query={Uri.EscapeDataString(sanitizedQuery)}&sp={spParam}";
            args.AddRange(["--playlist-end", maxResults.ToString(), "--dump-json", "--no-warnings", $"\"{searchUrl}\""]);
        }
        else
        {
            string searchPrefix = $"ytsearch{maxResults}";
            args.AddRange(["--dump-json", "--no-warnings", $"\"{searchPrefix}:{sanitizedQuery}\""]);
        }

        var arguments = string.Join(" ", args);

        using var timeoutCts = new CancellationTokenSource(TimeSpan.FromSeconds(_options.SearchTimeoutSeconds));
        using var linkedCts = CancellationTokenSource.CreateLinkedTokenSource(ct, timeoutCts.Token);

        var lines = new List<string>();
        try
        {
            await _processSupervisor.RunAsync(
                ytDlpExe,
                arguments,
                onStdOut: line =>
                {
                    if (!string.IsNullOrWhiteSpace(line)) lines.Add(line);
                },
                cancellationToken: linkedCts.Token);
        }
        catch (OperationCanceledException) when (ct.IsCancellationRequested)
        {
            throw;
        }
        catch (OperationCanceledException)
        {
            _logger.LogWarning("[yt-dlp] Таймаут поиска yt-dlp по '{Query}'.", query);
            return [];
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "[yt-dlp] Сбой поиска yt-dlp по '{Query}'.", query);
            return [];
        }

        var results = new List<YouTubeVideoMetadata>();
        var cutoffDate = daysBack > 0 ? DateTimeOffset.UtcNow.AddDays(-daysBack) : DateTimeOffset.MinValue;

        foreach (var line in lines)
        {
            try
            {
                using var doc = JsonDocument.Parse(line);
                var root = doc.RootElement;
                var id = root.TryGetProperty("id", out var ip) ? ip.GetString() : null;
                if (string.IsNullOrWhiteSpace(id)) continue;

                var title = root.TryGetProperty("title", out var tp) ? tp.GetString() ?? string.Empty : string.Empty;
                var uploader = root.TryGetProperty("uploader", out var up) ? up.GetString() : (root.TryGetProperty("channel", out var cp) ? cp.GetString() : "");
                var channelId = root.TryGetProperty("channel_id", out var cip) ? cip.GetString() ?? "" : "";
                var views = root.TryGetProperty("view_count", out var vp) && vp.ValueKind == JsonValueKind.Number ? vp.GetInt64() : 0L;
                var durationSec = root.TryGetProperty("duration", out var dp) && dp.ValueKind == JsonValueKind.Number ? dp.GetDouble() : 0.0;

                DateTimeOffset? publishedAt = null;
                if (root.TryGetProperty("timestamp", out var ts) && ts.ValueKind == JsonValueKind.Number && ts.GetInt64() > 0)
                {
                    publishedAt = DateTimeOffset.FromUnixTimeSeconds(ts.GetInt64());
                }
                else if (root.TryGetProperty("release_timestamp", out var rts) && rts.ValueKind == JsonValueKind.Number && rts.GetInt64() > 0)
                {
                    publishedAt = DateTimeOffset.FromUnixTimeSeconds(rts.GetInt64());
                }
                else
                {
                    var uploadDateStr = root.TryGetProperty("upload_date", out var udp) ? udp.GetString() : null;
                    publishedAt = ParseYtDlpDate(uploadDateStr);
                }

                if (daysBack > 0 && publishedAt.HasValue && publishedAt.Value < cutoffDate)
                {
                    continue;
                }

                if (lang.StartsWith("en", StringComparison.OrdinalIgnoreCase) && Regex.IsMatch(title, @"[\u0400-\u04FF]"))
                {
                    continue;
                }

                string? thumbUrl = null;
                if (root.TryGetProperty("thumbnails", out var thArr) && thArr.ValueKind == JsonValueKind.Array && thArr.GetArrayLength() > 0)
                {
                    thumbUrl = thArr[thArr.GetArrayLength() - 1].GetProperty("url").GetString();
                }
                thumbUrl ??= $"https://i.ytimg.com/vi/{id}/hqdefault.jpg";

                results.Add(new YouTubeVideoMetadata
                {
                    VideoId = id,
                    Title = title,
                    Description = root.TryGetProperty("description", out var dsp) ? dsp.GetString() ?? "" : "",
                    ChannelTitle = uploader ?? string.Empty,
                    ChannelId = channelId,
                    ViewCount = views,
                    Duration = TimeSpan.FromSeconds(durationSec),
                    UploadDate = publishedAt?.ToString("yyyyMMdd"),
                    PublishedAt = publishedAt,
                    ThumbnailUrl = thumbUrl
                });

                if (results.Count >= maxResults) break;
            }
            catch { }
        }

        return results;
    }

    private async Task<YouTubeVideoMetadata> FetchVideoYtDlpAsync(string videoUrlOrId, CancellationToken ct)
    {
        var ytDlpExe = _options.ResolveYtDlpExecutable();
        var targetUrl = videoUrlOrId.StartsWith("http") ? videoUrlOrId : $"https://www.youtube.com/watch?v={videoUrlOrId}";
        var arguments = $"--dump-json --no-warnings --no-playlist \"{targetUrl}\"";

        var result = await _processSupervisor.RunAsync(ytDlpExe, arguments, cancellationToken: ct);
        if (result.ExitCode != 0)
        {
            throw new YouTubeScrapeException($"yt-dlp video extract failed: {result.StandardError}", videoUrlOrId);
        }

        using var doc = JsonDocument.Parse(result.StandardOutput);
        var root = doc.RootElement;
        var id = root.GetProperty("id").GetString() ?? ExtractVideoId(videoUrlOrId);
        var views = root.TryGetProperty("view_count", out var v) && v.ValueKind == JsonValueKind.Number ? v.GetInt64() : 0L;
        var durationSec = root.TryGetProperty("duration", out var d) && d.ValueKind == JsonValueKind.Number ? d.GetDouble() : 0.0;
        var uploadDate = root.TryGetProperty("upload_date", out var ud) ? ud.GetString() : null;

        return new YouTubeVideoMetadata
        {
            VideoId = id,
            Title = root.TryGetProperty("title", out var t) ? t.GetString() ?? "" : "",
            Description = root.TryGetProperty("description", out var ds) ? ds.GetString() ?? "" : "",
            ChannelTitle = root.TryGetProperty("uploader", out var u) ? u.GetString() ?? "" : "",
            ChannelId = root.TryGetProperty("channel_id", out var ci) ? ci.GetString() ?? "" : "",
            ViewCount = views,
            Duration = TimeSpan.FromSeconds(durationSec),
            UploadDate = uploadDate,
            PublishedAt = ParseYtDlpDate(uploadDate),
            ThumbnailUrl = root.TryGetProperty("thumbnail", out var th) ? th.GetString() : $"https://i.ytimg.com/vi/{id}/hqdefault.jpg"
        };
    }

    private async Task<IReadOnlyList<string>> FetchCommentsYtDlpAsync(string videoId, int maxComments, CancellationToken ct)
    {
        var ytDlpExe = _options.ResolveYtDlpExecutable();
        var arguments = $"--dump-json --write-comments --skip-download --no-warnings --extractor-args \"youtube:max_comments={maxComments}\" \"https://www.youtube.com/watch?v={videoId}\"";
        var result = await _processSupervisor.RunAsync(ytDlpExe, arguments, cancellationToken: ct);
        if (result.ExitCode != 0 || string.IsNullOrWhiteSpace(result.StandardOutput)) return [];

        using var doc = JsonDocument.Parse(result.StandardOutput);
        var root = doc.RootElement;
        var comments = new List<string>();
        if (root.TryGetProperty("comments", out var commArr) && commArr.ValueKind == JsonValueKind.Array)
        {
            foreach (var c in commArr.EnumerateArray())
            {
                if (c.TryGetProperty("text", out var textProp))
                {
                    var t = textProp.GetString();
                    if (!string.IsNullOrWhiteSpace(t)) comments.Add(t.Trim());
                }
            }
        }
        return comments;
    }

    private async Task<string?> FetchTranscriptYtDlpAsync(string videoId, string[] preferredLangs, CancellationToken ct)
    {
        var ytDlpExe = _options.ResolveYtDlpExecutable();
        var arguments = $"--dump-json --skip-download --no-warnings \"https://www.youtube.com/watch?v={videoId}\"";
        var result = await _processSupervisor.RunAsync(ytDlpExe, arguments, cancellationToken: ct);
        if (result.ExitCode != 0 || string.IsNullOrWhiteSpace(result.StandardOutput)) return null;

        using var doc = JsonDocument.Parse(result.StandardOutput);
        var root = doc.RootElement;
        JsonElement captionsObj = default;
        bool hasCaptions = root.TryGetProperty("subtitles", out captionsObj) || root.TryGetProperty("automatic_captions", out captionsObj);
        if (!hasCaptions || captionsObj.ValueKind != JsonValueKind.Object) return null;

        string? targetSubUrl = null;
        foreach (var lang in preferredLangs)
        {
            foreach (var prop in captionsObj.EnumerateObject())
            {
                if (prop.Name.StartsWith(lang, StringComparison.OrdinalIgnoreCase))
                {
                    if (prop.Value.ValueKind == JsonValueKind.Array)
                    {
                        foreach (var fmt in prop.Value.EnumerateArray())
                        {
                            var ext = fmt.TryGetProperty("ext", out var ep) ? ep.GetString() : "";
                            if (ext is "json3" or "vtt" or "srv1")
                            {
                                targetSubUrl = fmt.GetProperty("url").GetString();
                                break;
                            }
                        }
                    }
                }
                if (targetSubUrl != null) break;
            }
            if (targetSubUrl != null) break;
        }

        if (string.IsNullOrEmpty(targetSubUrl)) return null;
        var subText = await _httpClient.GetStringAsync(targetSubUrl, ct);
        if (string.IsNullOrWhiteSpace(subText)) return null;

        if (subText.TrimStart().StartsWith("{"))
        {
            using var subDoc = JsonDocument.Parse(subText);
            if (subDoc.RootElement.TryGetProperty("events", out var events))
            {
                var sb = new StringBuilder();
                foreach (var ev in events.EnumerateArray())
                {
                    if (!ev.TryGetProperty("segs", out var segs)) continue;
                    foreach (var s in segs.EnumerateArray())
                    {
                        if (s.TryGetProperty("utf8", out var t)) sb.Append(t.GetString()).Append(' ');
                    }
                }
                var clean = CleanSpacesRegex().Replace(sb.ToString(), " ").Trim();
                return clean.Length > 40 ? clean : null;
            }
        }

        var lines = subText.Split('\n')
            .Select(l => l.Trim())
            .Where(l => !string.IsNullOrEmpty(l) && !l.Contains("-->") && !l.StartsWith("WEBVTT") && !l.StartsWith("NOTE"));
        var vttClean = CleanSpacesRegex().Replace(string.Join(" ", lines), " ").Trim();
        return vttClean.Length > 40 ? vttClean : null;
    }
    #endregion

    #region YouTube Data API v3 Fallback
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

    private async Task<YouTubeVideoMetadata?> FetchSingleVideoApiAsync(string videoIdOrUrl, string apiKey, CancellationToken ct)
    {
        var videoId = ExtractVideoId(videoIdOrUrl);
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
    #endregion

    #region Helpers
    private static string ExtractVideoId(string urlOrId)
    {
        if (urlOrId.Length == 11 && !urlOrId.Contains('/') && !urlOrId.Contains('?'))
        {
            return urlOrId;
        }

        if (Uri.TryCreate(urlOrId, UriKind.Absolute, out var uri))
        {
            var query = System.Web.HttpUtility.ParseQueryString(uri.Query);
            var v = query["v"];
            if (!string.IsNullOrWhiteSpace(v)) return v;

            var segments = uri.AbsolutePath.Trim('/').Split('/');
            if (segments.Length > 0 && segments[^1].Length == 11)
            {
                return segments[^1];
            }
        }

        return urlOrId.Trim();
    }

    private static TimeSpan ParseIsoDuration(string iso)
    {
        try { return XmlConvert.ToTimeSpan(iso); } catch { return TimeSpan.Zero; }
    }

    private static DateTimeOffset? ParseYtDlpDate(string? raw)
    {
        if (string.IsNullOrWhiteSpace(raw)) return null;
        if (raw.Length == 8 && DateTime.TryParseExact(raw, "yyyyMMdd", CultureInfo.InvariantCulture, DateTimeStyles.AssumeUniversal, out var dt))
        {
            return new DateTimeOffset(dt, TimeSpan.Zero);
        }
        if (DateTimeOffset.TryParse(raw, CultureInfo.InvariantCulture, DateTimeStyles.AssumeUniversal, out var dto))
        {
            return dto;
        }
        return null;
    }

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

    private static YouTubeVideoMetadata ParseJsonOutput(string jsonOutput, string target)
    {
        using var doc = JsonDocument.Parse(jsonOutput);
        var root = doc.RootElement;
        var videoId = root.GetProperty("video_id").GetString() ?? target;
        var title = root.TryGetProperty("title", out var t) ? t.GetString() ?? string.Empty : string.Empty;
        var desc = root.TryGetProperty("description", out var d) ? d.GetString() ?? string.Empty : string.Empty;
        var channel = root.TryGetProperty("channel_title", out var c) ? c.GetString() ?? string.Empty : string.Empty;
        var channelId = root.TryGetProperty("channel_id", out var ci) ? ci.GetString() ?? string.Empty : string.Empty;
        var views = root.TryGetProperty("view_count", out var v) && v.TryGetInt64(out var vi) ? vi : 0L;
        var seconds = root.TryGetProperty("length_seconds", out var sec) && sec.TryGetInt32(out var si) ? si : 0;
        var uploadDate = root.TryGetProperty("upload_date", out var ud) ? ud.GetString() : null;
        var thumb = root.TryGetProperty("thumbnail_url", out var th) ? th.GetString() : $"https://i.ytimg.com/vi/{videoId}/hqdefault.jpg";

        return new YouTubeVideoMetadata
        {
            VideoId = videoId,
            Title = title,
            Description = desc,
            ChannelTitle = channel,
            ChannelId = channelId,
            ViewCount = views,
            Duration = TimeSpan.FromSeconds(seconds),
            UploadDate = uploadDate,
            PublishedAt = ParseYtDlpDate(uploadDate),
            ThumbnailUrl = thumb
        };
    }

    [GeneratedRegex(@"\s+")]
    private static partial Regex CleanSpacesRegex();
    #endregion
}
