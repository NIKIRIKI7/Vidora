using System.Text;
using System.Text.Json;
using Integrations.YouTube.Innertube.Config;
using Integrations.YouTube.Innertube.Contracts;
using Integrations.YouTube.Innertube.Diagnostics;
using Integrations.YouTube.Innertube.Extractors;
using Integrations.YouTube.Innertube.Resolving;
using Integrations.YouTube.Innertube.Transport;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace Integrations.YouTube.Innertube;

public interface IInnerTubeClient
{
    Task<IReadOnlyList<InnerTubeVideoItem>> SearchVideosAsync(string query, int maxResults = 30, int daysBack = 0, string lang = "en", CancellationToken ct = default);
    Task<IReadOnlyList<InnerTubeVideoItem>> SearchVideosFilteredAsync(string query, InnerTubeSearchFilter? filter = null, int maxResults = 30, string lang = "en", CancellationToken ct = default);
    Task<string?> ExtractFastSubtitlesAsync(string videoId, string[]? preferredLangs = null, CancellationToken ct = default);
    Task<IReadOnlyList<InnerTubeVideoItem>> GetRelatedVideosAsync(string videoId, int maxResults = 25, string lang = "en", CancellationToken ct = default);
    Task<IReadOnlyList<InnerTubeVideoItem>> GetTrendingVideosAsync(string lang = "en", CancellationToken ct = default);
    Task<IReadOnlyList<InnerTubeVideoItem>> GetHomeFeedVideosAsync(string lang = "en", CancellationToken ct = default);
    Task<long> GetChannelSubscribersAsync(string channelId, CancellationToken ct = default);
    Task<InnerTubeChannelStats> GetChannelStatsAsync(string channelId, CancellationToken ct = default);
    Task<IReadOnlyList<InnerTubeChannelUpload>> GetChannelRecentUploadsAsync(string channelId, int maxUploads = 15, string lang = "en", CancellationToken ct = default);
    Task<IReadOnlyList<InnerTubeSubtitleTrack>> GetSubtitleTracksAsync(string videoId, CancellationToken ct = default);
    Task<InnerTubeVideoItem?> GetVideoDetailsAsync(string videoId, CancellationToken ct = default);
    Task<string?> GetVideoUploadDateAsync(string videoId, CancellationToken ct = default);
    Task<IReadOnlyList<InnerTubeHeatmapPoint>> GetVideoHeatmapAsync(string videoId, CancellationToken ct = default);
    Task<IReadOnlyList<InnerTubeVideoChapter>> GetVideoChaptersAsync(string videoId, CancellationToken ct = default);
    Task<IReadOnlyList<InnerTubeWordTimestamp>> GetWordTimestampsAsync(string videoId, CancellationToken ct = default);
    Task<IReadOnlyList<InnerTubeComment>> GetCommentsDetailedAsync(string videoId, int maxComments = 50, CancellationToken ct = default);
    Task<IReadOnlyList<string>> GetCommentsAsync(string videoId, int maxComments = 20, CancellationToken ct = default);
}

public sealed partial class InnerTubeClient : IInnerTubeClient
{
    private readonly IInnerTubeHttpTransport _transport;
    private readonly ISearchResponseExtractor _searchExtractor;
    private readonly IWatchNextResponseExtractor _watchNextExtractor;
    private readonly IPlayerResponseExtractor _playerExtractor;
    private readonly IInnerTubeDiagnostics _diagnostics;
    private readonly InnerTubeOptions _options;
    private readonly ILogger<InnerTubeClient> _logger;

    public InnerTubeClient(
        IInnerTubeHttpTransport transport,
        ISearchResponseExtractor searchExtractor,
        IWatchNextResponseExtractor watchNextExtractor,
        IPlayerResponseExtractor playerExtractor,
        IInnerTubeDiagnostics diagnostics,
        IOptions<InnerTubeOptions> options,
        ILogger<InnerTubeClient> logger)
    {
        _transport = transport;
        _searchExtractor = searchExtractor;
        _watchNextExtractor = watchNextExtractor;
        _playerExtractor = playerExtractor;
        _diagnostics = diagnostics;
        _options = options.Value;
        _logger = logger;
    }

    public async Task<IReadOnlyList<InnerTubeVideoItem>> SearchVideosAsync(
        string query, int maxResults = 30, int daysBack = 0, string lang = "en", CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(query)) return [];

        var region = lang.StartsWith("ru", StringComparison.OrdinalIgnoreCase) ? "RU" : "US";
        string? searchParams = daysBack switch
        {
            > 0 and <= 1 => "EgQIAhAB",
            > 0 and <= 7 => "EgQIAxAB",
            > 0 and <= 30 => "EgQIBBAB",
            > 0 and <= 365 => "EgQIBRAB",
            _ => null
        };

        try
        {
            var root = await _transport.SendSearchAsync(query, lang, region, searchParams, ct);

            if (_options.Diagnostics.EnableSchemaDriftDetection)
            {
                var drift = _diagnostics.DetectSchemaDrift(root, _options.Schema);
                if (drift.HasDrift)
                {
                    _logger.LogWarning(
                        "[InnerTube] Schema drift in search: {Count} issues detected",
                        drift.Drifts.Count);
                }
            }

            return _searchExtractor.Extract(root, maxResults);
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            _logger.LogWarning(ex, "[InnerTube] Search failed: {Query}", query);
            return [];
        }
    }

    public async Task<IReadOnlyList<InnerTubeVideoItem>> GetRelatedVideosAsync(
        string videoId, int maxResults = 25, string lang = "en", CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(videoId)) return [];

        var region = lang.StartsWith("ru", StringComparison.OrdinalIgnoreCase) ? "RU" : "US";

        try
        {
            var root = await _transport.SendNextAsync(videoId, lang, region, ct);
            return _watchNextExtractor.ExtractRelatedVideos(root, maxResults);
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            _logger.LogDebug(ex, "[InnerTube] Related videos fetch failed for {VideoId}", videoId);
            return [];
        }
    }

    public async Task<IReadOnlyList<InnerTubeVideoItem>> GetTrendingVideosAsync(string lang = "en", CancellationToken ct = default)
    {
        var region = lang.StartsWith("ru", StringComparison.OrdinalIgnoreCase) ? "RU" : "US";

        try
        {
            var root = await _transport.SendBrowseAsync(_options.BrowseIds.Trending, lang, region, ct);
            var videos = ExtractBrowseVideos(root);
            if (videos.Count > 0) return videos;

            _logger.LogDebug("[InnerTube] Trending feed empty, falling back to home feed");
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            _logger.LogDebug(ex, "[InnerTube] Trending feed fetch failed, falling back to home feed");
        }

        try
        {
            var homeRoot = await _transport.SendBrowseAsync(_options.BrowseIds.HomeFeed, lang, region, ct);
            return ExtractHomeFeedVideos(homeRoot);
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            _logger.LogDebug(ex, "[InnerTube] Home feed fallback fetch failed");
            return [];
        }
    }

    public async Task<IReadOnlyList<InnerTubeVideoItem>> GetHomeFeedVideosAsync(string lang = "en", CancellationToken ct = default)
    {
        var region = lang.StartsWith("ru", StringComparison.OrdinalIgnoreCase) ? "RU" : "US";

        try
        {
            var root = await _transport.SendBrowseAsync(_options.BrowseIds.HomeFeed, lang, region, ct);
            return ExtractHomeFeedVideos(root);
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            _logger.LogDebug(ex, "[InnerTube] Home feed fetch failed");
            return [];
        }
    }

    public async Task<long> GetChannelSubscribersAsync(string channelId, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(channelId) || !channelId.StartsWith(_options.Metadata.ChannelIdPrefix))
            return 0;

        try
        {
            var root = await _transport.SendBrowseAsync(channelId, "en", "US", ct);

            if (!root.TryGetProperty(_options.Schema.HeaderKey, out var header))
                return 0;

            if (header.TryGetProperty(_options.Schema.C4TabbedHeaderRendererKey, out var c4))
            {
                var text = c4.ExtractRunsText(_options.Schema.SubscriberCountTextKey);
                return InnerTubeParsers.ParseCount(text);
            }

            var headerStr = header.ToString();
            var match = System.Text.RegularExpressions.Regex.Match(
                headerStr,
                @"""subscriberCountText"":\s*\{""simpleText""\s*:\s*""([\d\.,]+[KkMmБбМм]?)\s*(?:subscribers|подписчик)""");
            if (match.Success) return InnerTubeParsers.ParseCount(match.Groups[1].Value);

            var match2 = System.Text.RegularExpressions.Regex.Match(
                headerStr,
                @"([\d\.,]+[KkMmБбМм]?)\s*(?:subscribers|подписчик)");
            if (match2.Success) return InnerTubeParsers.ParseCount(match2.Groups[1].Value);

            return 0;
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            _logger.LogDebug(ex, "[InnerTube] Channel subscribers fetch failed for {ChannelId}", channelId);
            return 0;
        }
    }

    public async Task<IReadOnlyList<InnerTubeSubtitleTrack>> GetSubtitleTracksAsync(string videoId, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(videoId)) return [];

        try
        {
            var root = await _transport.SendPlayerAsync(videoId, InnerTubeClientType.Ios, ct);
            return _playerExtractor.ExtractSubtitleTracks(root);
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            _logger.LogDebug(ex, "[InnerTube] Subtitle tracks fetch failed for {VideoId}", videoId);
            return [];
        }
    }

    public async Task<InnerTubeVideoItem?> GetVideoDetailsAsync(string videoId, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(videoId)) return null;

        try
        {
            var root = await _transport.SendPlayerAsync(videoId, InnerTubeClientType.Ios, ct);
            var items = _playerExtractor.ExtractVideoItems(root, 1);
            return items.FirstOrDefault();
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            _logger.LogDebug(ex, "[InnerTube] Video details fetch failed for {VideoId}", videoId);
            return null;
        }
    }

    public async Task<string?> GetVideoUploadDateAsync(string videoId, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(videoId)) return null;

        try
        {
            var root = await _transport.SendNextAsync(videoId, _options.Defaults.DefaultLanguage, _options.Defaults.DefaultRegion, ct);
            return _watchNextExtractor.ExtractUploadDate(root);
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            _logger.LogDebug(ex, "[InnerTube] Upload date fetch failed for {VideoId}", videoId);
            return null;
        }
    }

    public async Task<IReadOnlyList<string>> GetCommentsAsync(string videoId, int maxComments = 20, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(videoId)) return [];

        try
        {
            var root = await _transport.SendNextAsync(videoId, _options.Defaults.DefaultLanguage, _options.Defaults.DefaultRegion, ct);
            var comments = _watchNextExtractor.ExtractComments(root, maxComments);
            return comments.Select(c => c.Text).Where(t => !string.IsNullOrWhiteSpace(t)).ToList();
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            _logger.LogDebug(ex, "[InnerTube] Comments fetch failed for {VideoId}", videoId);
            return [];
        }
    }

    public async Task<IReadOnlyList<InnerTubeComment>> GetCommentsDetailedAsync(string videoId, int maxComments = 50, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(videoId)) return [];

        try
        {
            var root = await _transport.SendNextAsync(videoId, _options.Defaults.DefaultLanguage, _options.Defaults.DefaultRegion, ct);
            var comments = _watchNextExtractor.ExtractComments(root, maxComments);
            if (comments.Count >= maxComments) return comments;

            var continuationToken = _watchNextExtractor.ExtractCommentsContinuationToken(root);
            if (string.IsNullOrEmpty(continuationToken)) return comments;

            var contRoot = await _transport.SendNextAsync(null, continuationToken, _options.Defaults.DefaultLanguage, _options.Defaults.DefaultRegion, ct);
            var moreComments = _watchNextExtractor.ExtractCommentsFromContinuation(contRoot, maxComments - comments.Count);

            return comments.Concat(moreComments).ToList();
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            _logger.LogDebug(ex, "[InnerTube] Detailed comments fetch failed for {VideoId}", videoId);
            return [];
        }
    }

    public async Task<IReadOnlyList<InnerTubeHeatmapPoint>> GetVideoHeatmapAsync(string videoId, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(videoId)) return [];

        try
        {
            var root = await _transport.SendNextAsync(videoId, _options.Defaults.DefaultLanguage, _options.Defaults.DefaultRegion, ct);
            return _playerExtractor.ExtractHeatmap(root);
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            _logger.LogDebug(ex, "[InnerTube] Heatmap fetch failed for {VideoId}", videoId);
            return [];
        }
    }

    public async Task<IReadOnlyList<InnerTubeVideoChapter>> GetVideoChaptersAsync(string videoId, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(videoId)) return [];

        try
        {
            var root = await _transport.SendNextAsync(videoId, _options.Defaults.DefaultLanguage, _options.Defaults.DefaultRegion, ct);
            return _watchNextExtractor.ExtractChapters(root);
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            _logger.LogDebug(ex, "[InnerTube] Chapters fetch failed for {VideoId}", videoId);
            return [];
        }
    }

    public async Task<IReadOnlyList<InnerTubeWordTimestamp>> GetWordTimestampsAsync(string videoId, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(videoId)) return [];

        try
        {
            var root = await _transport.SendPlayerAsync(videoId, InnerTubeClientType.Ios, ct);
            return _playerExtractor.ExtractWordTimestamps(root);
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            _logger.LogDebug(ex, "[InnerTube] Word timestamps fetch failed for {VideoId}", videoId);
            return [];
        }
    }

    public async Task<IReadOnlyList<InnerTubeVideoItem>> SearchVideosFilteredAsync(
        string query, InnerTubeSearchFilter? filter = null, int maxResults = 30, string lang = "en", CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(query)) return [];

        var region = lang.StartsWith("ru", StringComparison.OrdinalIgnoreCase) ? "RU" : "US";
        var searchParams = InnerTubeSearchParamsBuilder.Build(filter);

        try
        {
            var root = await _transport.SendSearchAsync(query, lang, region, searchParams, ct);
            return _searchExtractor.Extract(root, maxResults);
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            _logger.LogWarning(ex, "[InnerTube] Filtered search failed: {Query}", query);
            return [];
        }
    }

    public async Task<InnerTubeChannelStats> GetChannelStatsAsync(string channelId, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(channelId) || !channelId.StartsWith(_options.Metadata.ChannelIdPrefix))
            return new InnerTubeChannelStats(0, 0, 0, "");

        try
        {
            var root = await _transport.SendBrowseAsync(channelId, "en", "US", ct);

            long subscriberCount = 0;
            long totalViewCount = 0;
            int videoCount = 0;
            string description = "";

            if (root.TryGetProperty(_options.Schema.HeaderKey, out var header))
            {
                if (header.TryGetProperty(_options.Schema.C4TabbedHeaderRendererKey, out var c4))
                {
                    var subText = c4.ExtractRunsText(_options.Schema.SubscriberCountTextKey);
                    subscriberCount = InnerTubeParsers.ParseCount(subText);
                    var viewText = c4.ExtractRunsText("videosCountText");
                    videoCount = (int)InnerTubeParsers.ParseCount(viewText);
                }
            }

            if (root.TryGetProperty("metadata", out var metadata) &&
                metadata.TryGetProperty("channelMetadataRenderer", out var cmr))
            {
                description = cmr.TryGetProperty("description", out var descEl) ? descEl.GetString() ?? "" : "";
                var viewStr = cmr.TryGetProperty("viewCount", out var vcEl) ? vcEl.GetString() : null;
                if (long.TryParse(viewStr, out var vc)) totalViewCount = vc;
            }

            return new InnerTubeChannelStats(subscriberCount, totalViewCount, videoCount, description);
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            _logger.LogDebug(ex, "[InnerTube] Channel stats fetch failed for {ChannelId}", channelId);
            return new InnerTubeChannelStats(0, 0, 0, "");
        }
    }

    public async Task<IReadOnlyList<InnerTubeChannelUpload>> GetChannelRecentUploadsAsync(
        string channelId, int maxUploads = 15, string lang = "en", CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(channelId) || !channelId.StartsWith(_options.Metadata.ChannelIdPrefix))
            return [];

        var region = lang.StartsWith("ru", StringComparison.OrdinalIgnoreCase) ? "RU" : "US";

        try
        {
            // Параметры вкладки "Видео" канала.
            var root = await _transport.SendBrowseAsync(channelId, lang, region, ct, "EgZ2aWRlb3PyBgQKAjoA");
            var uploads = new List<InnerTubeChannelUpload>();
            CollectChannelUploads(root, uploads, maxUploads);
            return uploads.Take(maxUploads).ToList();
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            _logger.LogDebug(ex, "[InnerTube] Channel uploads fetch failed for {ChannelId}", channelId);
            return [];
        }
    }

    private void CollectChannelUploads(JsonElement element, List<InnerTubeChannelUpload> uploads, int maxUploads)
    {
        if (uploads.Count >= maxUploads) return;

        if (element.ValueKind == JsonValueKind.Object)
        {
            if (element.TryGetProperty("lockupViewModel", out var lockup))
            {
                var upload = ParseLockupVideo(lockup);
                if (upload != null) uploads.Add(upload);
                return;
            }

            if (element.TryGetProperty("gridVideoRenderer", out var gvr))
            {
                var upload = ParseGridVideoRenderer(gvr);
                if (upload != null) uploads.Add(upload);
                return;
            }

            if (element.TryGetProperty("richItemRenderer", out var rir) &&
                rir.TryGetProperty("content", out var content))
            {
                CollectChannelUploads(content, uploads, maxUploads);
                return;
            }

            if (element.TryGetProperty("videoRenderer", out var vr))
            {
                var upload = ParseVideoRendererToUpload(vr);
                if (upload != null) uploads.Add(upload);
                return;
            }

            foreach (var prop in element.EnumerateObject())
            {
                if (uploads.Count >= maxUploads) return;
                if (prop.Value.ValueKind is JsonValueKind.Object or JsonValueKind.Array)
                    CollectChannelUploads(prop.Value, uploads, maxUploads);
            }
        }
        else if (element.ValueKind == JsonValueKind.Array)
        {
            foreach (var item in element.EnumerateArray())
            {
                if (uploads.Count >= maxUploads) return;
                CollectChannelUploads(item, uploads, maxUploads);
            }
        }
    }

    private InnerTubeChannelUpload? ParseLockupVideo(JsonElement lockup)
    {
        if (!lockup.TryGetProperty("contentId", out var idEl)) return null;
        var videoId = idEl.GetString();
        if (string.IsNullOrEmpty(videoId)) return null;

        var title = "";
        var viewCount = 0;
        var publishedText = "";

        if (lockup.TryGetProperty("metadata", out var metadata) &&
            metadata.TryGetProperty("lockupMetadataViewModel", out var lockupMeta))
        {
            if (lockupMeta.TryGetProperty("title", out var titleEl) &&
                titleEl.TryGetProperty("content", out var titleContent))
            {
                title = titleContent.GetString() ?? "";
            }

            if (lockupMeta.TryGetProperty("metadata", out var metaInner) &&
                metaInner.TryGetProperty("contentMetadataViewModel", out var contentMeta) &&
                contentMeta.TryGetProperty("metadataRows", out var rows) &&
                rows.ValueKind == JsonValueKind.Array)
            {
                foreach (var row in rows.EnumerateArray())
                {
                    if (!row.TryGetProperty("metadataParts", out var parts) || parts.ValueKind != JsonValueKind.Array)
                        continue;

                    var texts = new List<string>();
                    foreach (var part in parts.EnumerateArray())
                    {
                        if (part.TryGetProperty("text", out var textEl) &&
                            textEl.TryGetProperty("content", out var contentEl))
                        {
                            texts.Add(contentEl.GetString() ?? "");
                        }
                    }

                    // Строка с просмотрами/датой содержит 2 части: [views, published].
                    // У автора обычно одна часть — её пропускаем.
                    if (viewCount == 0 && texts.Count >= 2)
                    {
                        viewCount = (int)InnerTubeParsers.ParseCount(texts[0]);
                        if (string.IsNullOrEmpty(publishedText)) publishedText = texts[1];
                    }
                }
            }
        }

        var thumbnail = $"https://i.ytimg.com/vi/{videoId}/hqdefault.jpg";
        var duration = 0;

        if (lockup.TryGetProperty("contentImage", out var contentImage) &&
            contentImage.TryGetProperty("thumbnailViewModel", out var thumbVm))
        {
            if (thumbVm.TryGetProperty("image", out var image) &&
                image.TryGetProperty("sources", out var sources) &&
                sources.ValueKind == JsonValueKind.Array && sources.GetArrayLength() > 0 &&
                sources[0].TryGetProperty("url", out var urlEl))
            {
                thumbnail = urlEl.GetString() ?? thumbnail;
            }

            if (thumbVm.TryGetProperty("overlays", out var overlays) && overlays.ValueKind == JsonValueKind.Array)
            {
                foreach (var overlay in overlays.EnumerateArray())
                {
                    if (overlay.TryGetProperty("thumbnailBottomOverlayViewModel", out var bottom) &&
                        bottom.TryGetProperty("badges", out var badges) && badges.ValueKind == JsonValueKind.Array)
                    {
                        foreach (var badge in badges.EnumerateArray())
                        {
                            if (badge.TryGetProperty("thumbnailBadgeViewModel", out var badgeVm) &&
                                badgeVm.TryGetProperty("text", out var badgeText))
                            {
                                var parsed = InnerTubeParsers.ParseDurationToSeconds(badgeText.GetString() ?? "");
                                if (parsed > 0) duration = parsed;
                            }
                        }
                    }
                }
            }
        }

        return new InnerTubeChannelUpload(videoId, title, thumbnail, viewCount, publishedText, duration);
    }

    private InnerTubeChannelUpload? ParseGridVideoRenderer(JsonElement gvr)
    {
        if (!gvr.TryGetProperty("videoId", out var vidEl)) return null;
        var videoId = vidEl.GetString();
        if (string.IsNullOrEmpty(videoId)) return null;

        var title = gvr.ExtractRunsText("title");
        var pubText = gvr.ExtractRunsText("publishedTimeText");
        var lengthText = gvr.ExtractRunsText("lengthText");
        int duration = InnerTubeParsers.ParseDurationToSeconds(lengthText);

        var thumbnail = $"https://i.ytimg.com/vi/{videoId}/hqdefault.jpg";
        if (gvr.TryGetProperty("thumbnail", out var thumbEl) &&
            thumbEl.TryGetProperty("thumbnails", out var thumbArr) &&
            thumbArr.GetArrayLength() > 0)
        {
            thumbnail = thumbArr[0].TryGetProperty("url", out var urlEl) ? urlEl.GetString() ?? thumbnail : thumbnail;
        }

        int viewCount = 0;
        var viewsText = gvr.ExtractRunsText("viewCountText");
        viewCount = (int)InnerTubeParsers.ParseCount(viewsText);

        return new InnerTubeChannelUpload(videoId, title, thumbnail, viewCount, pubText, duration);
    }

    private InnerTubeChannelUpload? ParseVideoRendererToUpload(JsonElement vr)
    {
        if (!vr.TryGetProperty("videoId", out var vidEl)) return null;
        var videoId = vidEl.GetString();
        if (string.IsNullOrEmpty(videoId)) return null;

        var title = vr.ExtractRunsText("title");
        var pubText = vr.ExtractRunsText("publishedTimeText");
        var lengthText = vr.ExtractRunsText("lengthText");
        int duration = InnerTubeParsers.ParseDurationToSeconds(lengthText);

        var thumbnail = $"https://i.ytimg.com/vi/{videoId}/hqdefault.jpg";
        var viewsText = vr.ExtractRunsText("viewCountText");
        int viewCount = (int)InnerTubeParsers.ParseCount(viewsText);

        return new InnerTubeChannelUpload(videoId, title, thumbnail, viewCount, pubText, duration);
    }

    public async Task<string?> ExtractFastSubtitlesAsync(string videoId, string[]? preferredLangs = null, CancellationToken ct = default)
    {
        var langs = preferredLangs ?? _options.Subtitles.PreferredLanguages;

        try
        {
            var tracks = await GetSubtitleTracksAsync(videoId, ct);
            if (tracks.Count == 0) return null;

            InnerTubeSubtitleTrack? targetTrack = null;
            foreach (var lang in langs)
            {
                targetTrack = tracks.FirstOrDefault(t => t.LanguageCode.StartsWith(lang, StringComparison.OrdinalIgnoreCase));
                if (targetTrack != null) break;
            }
            targetTrack ??= tracks[0];

            using var cts = CancellationTokenSource.CreateLinkedTokenSource(ct);
            cts.CancelAfter(TimeSpan.FromSeconds(_options.Timeouts.SubtitleFetchSeconds));

            var subUrl = $"{targetTrack.BaseUrl}&fmt={_options.Subtitles.SubtitleFormat}";
            var subRes = await _transport.FetchStringAsync(subUrl, cts.Token);
            using var subDoc = JsonDocument.Parse(subRes);

            if (!subDoc.RootElement.TryGetProperty("events", out var events))
                return null;

            var sb = new StringBuilder();
            foreach (var ev in events.EnumerateArray())
            {
                if (!ev.TryGetProperty("segs", out var segs)) continue;
                foreach (var s in segs.EnumerateArray())
                {
                    if (s.TryGetProperty("utf8", out var text))
                        sb.Append(text.GetString()).Append(' ');
                }
            }

            var clean = CleanSpacesRegex().Replace(sb.ToString(), " ").Trim();
            return clean.Length > _options.Subtitles.MinLength ? clean : null;
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            _logger.LogDebug(ex, "[InnerTube] Subtitles unavailable for {VideoId}", videoId);
            return null;
        }
    }

    private IReadOnlyList<InnerTubeVideoItem> ExtractBrowseVideos(JsonElement root)
    {
        var results = new List<InnerTubeVideoItem>();

        if (!root.TryGetProperty(_options.Schema.ContentsKey, out var contents)) return results;
        if (!contents.TryGetProperty(_options.Schema.TwoColumnBrowseResultsKey, out var twoCol)) return results;
        if (!twoCol.TryGetProperty(_options.Schema.TabsKey, out var tabs) || tabs.GetArrayLength() == 0) return results;
        if (!tabs[0].TryGetProperty(_options.Schema.TabRendererKey, out var tr)) return results;
        if (!tr.TryGetProperty("content", out var tabContent)) return results;
        if (!tabContent.TryGetProperty(_options.Schema.SectionListRendererKey, out var slr)) return results;
        if (!slr.TryGetProperty(_options.Schema.ContentsKey, out var secArr)) return results;

        foreach (var sec in secArr.EnumerateArray())
        {
            if (!sec.TryGetProperty(_options.Schema.ItemSectionRendererKey, out var isr)) continue;
            if (!isr.TryGetProperty(_options.Schema.ContentsKey, out var isrContents)) continue;
            foreach (var item in isrContents.EnumerateArray())
            {
                if (item.TryGetProperty(_options.Schema.VideoRendererKey, out var vr))
                {
                    var parsed = ParseVideoRendererFromBrowse(vr);
                    if (parsed != null) results.Add(parsed);
                }
            }
        }

        return results;
    }

    private IReadOnlyList<InnerTubeVideoItem> ExtractHomeFeedVideos(JsonElement root)
    {
        var results = new List<InnerTubeVideoItem>();

        if (!root.TryGetProperty(_options.Schema.ContentsKey, out var contents)) return results;
        if (!contents.TryGetProperty(_options.Schema.TwoColumnBrowseResultsKey, out var twoCol)) return results;
        if (!twoCol.TryGetProperty(_options.Schema.TabsKey, out var tabs) || tabs.GetArrayLength() == 0) return results;
        if (!tabs[0].TryGetProperty(_options.Schema.TabRendererKey, out var tr)) return results;
        if (!tr.TryGetProperty("content", out var tabContent)) return results;
        if (!tabContent.TryGetProperty(_options.Schema.RichGridRendererKey, out var rgr)) return results;
        if (!rgr.TryGetProperty(_options.Schema.ContentsKey, out var contentsArr)) return results;

        foreach (var item in contentsArr.EnumerateArray())
        {
            if (item.TryGetProperty(_options.Schema.RichItemRendererKey, out var rir) &&
                rir.TryGetProperty("content", out var rirContent) &&
                rirContent.TryGetProperty(_options.Schema.VideoRendererKey, out var vr))
            {
                var parsed = ParseVideoRendererFromBrowse(vr);
                if (parsed != null) results.Add(parsed);
            }
        }

        return results;
    }

    private InnerTubeVideoItem? ParseVideoRendererFromBrowse(JsonElement vr)
    {
        if (!vr.TryGetProperty("videoId", out var vidProp)) return null;
        var vId = vidProp.GetString();
        if (string.IsNullOrEmpty(vId)) return null;

        var title = vr.ExtractRunsText("title");
        var viewsText = vr.ExtractRunsText("viewCountText");
        var lengthText = vr.ExtractRunsText("lengthText");
        var pubText = vr.ExtractRunsText("publishedTimeText");

        var channelTitle = "";
        var channelId = "";
        if (vr.TryGetProperty("ownerText", out var ot) && ot.TryGetProperty("runs", out var otr) && otr.GetArrayLength() > 0)
        {
            channelTitle = otr[0].TryGetProperty("text", out var t) ? t.GetString() ?? "" : "";
            if (otr[0].TryGetProperty("navigationEndpoint", out var nav) &&
                nav.TryGetProperty("browseEndpoint", out var be))
            {
                channelId = be.TryGetProperty("browseId", out var bid) ? bid.GetString() ?? "" : "";
            }
        }

        int durSec = InnerTubeParsers.ParseDurationToSeconds(lengthText);

        bool isVerified = false;
        if (vr.TryGetProperty("ownerBadges", out var ob) && ob.ValueKind == JsonValueKind.Array)
        {
            foreach (var b in ob.EnumerateArray())
            {
                if (b.TryGetProperty("metadataBadgeRenderer", out var mbr) &&
                    mbr.TryGetProperty("style", out var style) &&
                    (style.GetString()?.Contains("VERIFIED") ?? false))
                {
                    isVerified = true;
                    break;
                }
            }
        }

        return new InnerTubeVideoItem(
            VideoId: vId,
            Title: title,
            ChannelTitle: channelTitle,
            ChannelId: string.IsNullOrEmpty(channelId) ? channelTitle : channelId,
            ViewCount: InnerTubeParsers.ParseCount(viewsText),
            DurationSeconds: durSec,
            IsShort: durSec is > 0 and <= 180,
            PublishedText: pubText,
            Url: $"https://youtu.be/{vId}",
            ThumbnailUrl: $"https://i.ytimg.com/vi/{vId}/hqdefault.jpg",
            IsVerified: isVerified);
    }

    [System.Text.RegularExpressions.GeneratedRegex(@"\s+")]
    private static partial System.Text.RegularExpressions.Regex CleanSpacesRegex();
}
