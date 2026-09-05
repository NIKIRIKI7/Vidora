using System.Globalization;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using Microsoft.Extensions.Logging;

namespace Integrations.YouTube.Innertube;

public sealed record InnerTubeVideoItem(
    string VideoId,
    string Title,
    string ChannelTitle,
    string ChannelId,
    long ViewCount,
    int DurationSeconds,
    bool IsShort,
    string PublishedText,
    string Url,
    string ThumbnailUrl,
    long SubscriberCount = 0,
    bool IsVerified = false);

public interface IInnerTubeClient
{
    Task<IReadOnlyList<InnerTubeVideoItem>> SearchVideosAsync(string query, int maxResults = 30, int daysBack = 0, string lang = "en", CancellationToken ct = default);
    Task<string?> ExtractFastSubtitlesAsync(string videoId, string[]? preferredLangs = null, CancellationToken ct = default);
    Task<IReadOnlyList<InnerTubeVideoItem>> GetRelatedVideosAsync(string videoId, int maxResults = 25, string lang = "en", CancellationToken ct = default);
    Task<IReadOnlyList<InnerTubeVideoItem>> GetTrendingVideosAsync(string lang = "en", CancellationToken ct = default);
    Task<IReadOnlyList<InnerTubeVideoItem>> GetHomeFeedVideosAsync(string lang = "en", CancellationToken ct = default);
    Task<long> GetChannelSubscribersAsync(string channelId, CancellationToken ct = default);
}

public sealed partial class InnerTubeClient : IInnerTubeClient
{
    private const string InnerTubeUrl = "https://www.youtube.com/youtubei/v1";
    private const string PublicInternalKey = "AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8";
    private readonly HttpClient _httpClient;
    private readonly ILogger<InnerTubeClient> _logger;

    public InnerTubeClient(HttpClient httpClient, ILogger<InnerTubeClient> logger)
    {
        _httpClient = httpClient;
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

        var payload = new Dictionary<string, object>
        {
            ["query"] = query,
            ["context"] = new
            {
                client = new
                {
                    hl = lang,
                    gl = region,
                    clientName = "WEB",
                    clientVersion = "2.20240825.01.00"
                }
            }
        };
        if (!string.IsNullOrEmpty(searchParams))
        {
            payload["params"] = searchParams;
        }

        using var cts = CancellationTokenSource.CreateLinkedTokenSource(ct);
        cts.CancelAfter(TimeSpan.FromSeconds(15));
        using var request = new HttpRequestMessage(HttpMethod.Post, $"{InnerTubeUrl}/search?key={PublicInternalKey}");
        request.Headers.UserAgent.ParseAdd("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36");
        request.Content = new StringContent(JsonSerializer.Serialize(payload), Encoding.UTF8, "application/json");

        try
        {
            using var response = await _httpClient.SendAsync(request, cts.Token);
            if (!response.IsSuccessStatusCode) return [];
            await using var stream = await response.Content.ReadAsStreamAsync(cts.Token);
            using var doc = await JsonDocument.ParseAsync(stream, cancellationToken: cts.Token);

            var results = new List<InnerTubeVideoItem>();
            if (!doc.RootElement.TryGetProperty("contents", out var contents)) return results;
            if (!contents.TryGetProperty("twoColumnSearchResultsRenderer", out var col)) return results;
            if (!col.TryGetProperty("primaryContents", out var primary)) return results;
            if (!primary.TryGetProperty("sectionListRenderer", out var sectionList)) return results;
            if (!sectionList.TryGetProperty("contents", out var sections)) return results;

            foreach (var section in sections.EnumerateArray())
            {
                if (!section.TryGetProperty("itemSectionRenderer", out var itemSection)) continue;
                if (!itemSection.TryGetProperty("contents", out var items)) continue;
                foreach (var item in items.EnumerateArray())
                {
                    if (!item.TryGetProperty("videoRenderer", out var vr)) continue;
                    var parsed = ParseVideoRenderer(vr);
                    if (parsed != null)
                    {
                        results.Add(parsed);
                        if (results.Count >= maxResults) break;
                    }
                }
                if (results.Count >= maxResults) break;
            }
            return results;
        }
        catch (Exception ex)
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
        var payload = new
        {
            videoId,
            context = new
            {
                client = new
                {
                    hl = lang,
                    gl = region,
                    clientName = "WEB",
                    clientVersion = "2.20240825.01.00"
                }
            }
        };

        using var cts = CancellationTokenSource.CreateLinkedTokenSource(ct);
        cts.CancelAfter(TimeSpan.FromSeconds(12));
        using var request = new HttpRequestMessage(HttpMethod.Post, $"{InnerTubeUrl}/next?key={PublicInternalKey}");
        request.Content = new StringContent(JsonSerializer.Serialize(payload), Encoding.UTF8, "application/json");

        try
        {
            using var response = await _httpClient.SendAsync(request, cts.Token);
            if (!response.IsSuccessStatusCode) return [];
            await using var stream = await response.Content.ReadAsStreamAsync(cts.Token);
            using var doc = await JsonDocument.ParseAsync(stream, cancellationToken: cts.Token);

            var results = new List<InnerTubeVideoItem>();
            if (!doc.RootElement.TryGetProperty("contents", out var contents)) return results;
            if (!contents.TryGetProperty("twoColumnWatchNextResults", out var watchNext)) return results;
            if (!watchNext.TryGetProperty("secondaryResults", out var sec)) return results;
            JsonElement secondaryResultsContainer = sec.TryGetProperty("secondaryResults", out var sr) ? sr : sec;
            if (!secondaryResultsContainer.TryGetProperty("results", out var items)) return results;

            foreach (var item in items.EnumerateArray())
            {
                ExtractItemsRecursive(item, results, maxResults);
            }
            return results;
        }
        catch (Exception ex)
        {
            _logger.LogDebug(ex, "[InnerTube] Related videos fetch failed for {VideoId}", videoId);
            return [];
        }
    }

    private void ExtractItemsRecursive(JsonElement element, List<InnerTubeVideoItem> results, int maxResults)
    {
        if (results.Count >= maxResults) return;

        if (element.TryGetProperty("compactVideoRenderer", out var cvr))
        {
            var parsed = ParseCompactVideoRenderer(cvr);
            if (parsed != null) results.Add(parsed);
            return;
        }

        if (element.TryGetProperty("videoRenderer", out var vr))
        {
            var parsed = ParseVideoRenderer(vr);
            if (parsed != null) results.Add(parsed);
            return;
        }

        if (element.TryGetProperty("itemSectionRenderer", out var isr) &&
            isr.TryGetProperty("contents", out var isrContents))
        {
            foreach (var child in isrContents.EnumerateArray())
            {
                ExtractItemsRecursive(child, results, maxResults);
            }
        }

        if (element.TryGetProperty("richItemRenderer", out var rir) &&
            rir.TryGetProperty("content", out var rirContent))
        {
            ExtractItemsRecursive(rirContent, results, maxResults);
        }
    }

    private InnerTubeVideoItem? ParseCompactVideoRenderer(JsonElement cvr)
    {
        if (!cvr.TryGetProperty("videoId", out var vidProp)) return null;
        var vId = vidProp.GetString();
        if (string.IsNullOrEmpty(vId)) return null;

        var title = ExtractJsonText(cvr, "title");
        var viewsText = ExtractJsonText(cvr, "viewCountText");
        var lengthText = ExtractJsonText(cvr, "lengthText");
        var pubText = ExtractJsonText(cvr, "publishedTimeText");
        var channelTitle = "";
        var channelId = "";
        if (cvr.TryGetProperty("shortBylineText", out var sbt) && sbt.TryGetProperty("runs", out var sbtr) && sbtr.GetArrayLength() > 0)
        {
            channelTitle = sbtr[0].GetProperty("text").GetString() ?? "";
            if (sbtr[0].TryGetProperty("navigationEndpoint", out var nav) &&
                nav.TryGetProperty("browseEndpoint", out var be))
            {
                channelId = be.TryGetProperty("browseId", out var bid) ? bid.GetString() ?? "" : "";
            }
        }
        int durSec = ParseDurationToSeconds(lengthText);

        bool isVerified = false;
        long subscriberCount = 0L;
        if (cvr.TryGetProperty("ownerBadges", out var ob) && ob.ValueKind == JsonValueKind.Array)
        {
            foreach (var badge in ob.EnumerateArray())
            {
                if (badge.TryGetProperty("metadataBadgeRenderer", out var mbr) &&
                    mbr.TryGetProperty("style", out var styleProp) &&
                    (styleProp.GetString()?.Contains("VERIFIED") ?? false))
                {
                    isVerified = true;
                    subscriberCount = 100_000L;
                    break;
                }
            }
        }

        return new InnerTubeVideoItem(
            VideoId: vId,
            Title: title,
            ChannelTitle: channelTitle,
            ChannelId: string.IsNullOrEmpty(channelId) ? channelTitle : channelId,
            ViewCount: ParseCount(viewsText),
            DurationSeconds: durSec,
            IsShort: durSec is > 0 and <= 180,
            PublishedText: pubText,
            Url: $"https://youtu.be/{vId}",
            ThumbnailUrl: $"https://i.ytimg.com/vi/{vId}/hqdefault.jpg",
            SubscriberCount: subscriberCount,
            IsVerified: isVerified);
    }

    public async Task<IReadOnlyList<InnerTubeVideoItem>> GetTrendingVideosAsync(string lang = "en", CancellationToken ct = default)
    {
        var region = lang.StartsWith("ru", StringComparison.OrdinalIgnoreCase) ? "RU" : "US";
        var payload = new
        {
            browseId = "FEtrending",
            context = new
            {
                client = new
                {
                    hl = lang,
                    gl = region,
                    clientName = "WEB",
                    clientVersion = "2.20240825.01.00"
                }
            }
        };

        using var request = new HttpRequestMessage(HttpMethod.Post, $"{InnerTubeUrl}/browse?key={PublicInternalKey}");
        request.Content = new StringContent(JsonSerializer.Serialize(payload), Encoding.UTF8, "application/json");

        try
        {
            using var response = await _httpClient.SendAsync(request, ct);
            if (!response.IsSuccessStatusCode) return [];
            await using var stream = await response.Content.ReadAsStreamAsync(ct);
            using var doc = await JsonDocument.ParseAsync(stream, cancellationToken: ct);

            var list = new List<InnerTubeVideoItem>();
            if (!doc.RootElement.TryGetProperty("contents", out var contents)) return list;
            if (!contents.TryGetProperty("twoColumnBrowseResultsRenderer", out var tc)) return list;
            if (!tc.TryGetProperty("tabs", out var tabs) || tabs.GetArrayLength() == 0) return list;
            if (!tabs[0].TryGetProperty("tabRenderer", out var tr)) return list;
            if (!tr.TryGetProperty("content", out var tabContent)) return list;
            if (!tabContent.TryGetProperty("sectionListRenderer", out var slr)) return list;
            if (!slr.TryGetProperty("contents", out var secArr)) return list;

            foreach (var sec in secArr.EnumerateArray())
            {
                if (!sec.TryGetProperty("itemSectionRenderer", out var isr)) continue;
                if (!isr.TryGetProperty("contents", out var isrContents)) continue;
                foreach (var item in isrContents.EnumerateArray())
                {
                    if (item.TryGetProperty("videoRenderer", out var vr))
                    {
                        var parsed = ParseVideoRenderer(vr);
                        if (parsed != null) list.Add(parsed);
                    }
                }
            }
            return list;
        }
        catch (Exception ex)
        {
            _logger.LogDebug(ex, "[InnerTube] Trending feed fetch failed");
            return [];
        }
    }

    public async Task<IReadOnlyList<InnerTubeVideoItem>> GetHomeFeedVideosAsync(string lang = "en", CancellationToken ct = default)
    {
        var region = lang.StartsWith("ru", StringComparison.OrdinalIgnoreCase) ? "RU" : "US";
        var payload = new
        {
            browseId = "FEwhat_to_watch",
            context = new
            {
                client = new
                {
                    hl = lang,
                    gl = region,
                    clientName = "WEB",
                    clientVersion = "2.20240825.01.00"
                }
            }
        };

        using var request = new HttpRequestMessage(HttpMethod.Post, $"{InnerTubeUrl}/browse?key={PublicInternalKey}");
        request.Content = new StringContent(JsonSerializer.Serialize(payload), Encoding.UTF8, "application/json");

        try
        {
            using var response = await _httpClient.SendAsync(request, ct);
            if (!response.IsSuccessStatusCode) return [];
            await using var stream = await response.Content.ReadAsStreamAsync(ct);
            using var doc = await JsonDocument.ParseAsync(stream, cancellationToken: ct);

            var list = new List<InnerTubeVideoItem>();
            if (!doc.RootElement.TryGetProperty("contents", out var contents)) return list;
            if (!contents.TryGetProperty("twoColumnBrowseResultsRenderer", out var tc)) return list;
            if (!tc.TryGetProperty("tabs", out var tabs) || tabs.GetArrayLength() == 0) return list;
            if (!tabs[0].TryGetProperty("tabRenderer", out var tr)) return list;
            if (!tr.TryGetProperty("content", out var tabContent)) return list;
            if (!tabContent.TryGetProperty("richGridRenderer", out var rgr)) return list;
            if (!rgr.TryGetProperty("contents", out var contentsArr)) return list;

            foreach (var item in contentsArr.EnumerateArray())
            {
                if (item.TryGetProperty("richItemRenderer", out var rir) &&
                    rir.TryGetProperty("content", out var rirContent) &&
                    rirContent.TryGetProperty("videoRenderer", out var vr))
                {
                    var parsed = ParseVideoRenderer(vr);
                    if (parsed != null) list.Add(parsed);
                }
            }
            return list;
        }
        catch (Exception ex)
        {
            _logger.LogDebug(ex, "[InnerTube] Home feed fetch failed");
            return [];
        }
    }

    public async Task<long> GetChannelSubscribersAsync(string channelId, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(channelId) || !channelId.StartsWith("UC")) return 0;

        var payload = new
        {
            browseId = channelId,
            context = new
            {
                client = new
                {
                    hl = "en",
                    gl = "US",
                    clientName = "WEB",
                    clientVersion = "2.20240825.01.00"
                }
            }
        };

        using var request = new HttpRequestMessage(HttpMethod.Post, $"{InnerTubeUrl}/browse?key={PublicInternalKey}");
        request.Content = new StringContent(JsonSerializer.Serialize(payload), Encoding.UTF8, "application/json");

        try
        {
            using var response = await _httpClient.SendAsync(request, ct);
            if (!response.IsSuccessStatusCode) return 0;
            await using var stream = await response.Content.ReadAsStreamAsync(ct);
            using var doc = await JsonDocument.ParseAsync(stream, cancellationToken: ct);
            var root = doc.RootElement;

            if (root.TryGetProperty("header", out var header))
            {
                if (header.TryGetProperty("c4TabbedHeaderRenderer", out var c4) &&
                    c4.TryGetProperty("subscriberCountText", out var sct))
                {
                    var text = ExtractJsonText(c4, "subscriberCountText");
                    return ParseCount(text);
                }
                var headerStr = header.ToString();
                var match = Regex.Match(headerStr, @"""subscriberCountText"":\s*\{""simpleText""\s*:\s*""([\d\.,]+[KkMmБбМм]?)\s*(?:subscribers|подписчик)""");
                if (match.Success) return ParseCount(match.Groups[1].Value);
                var match2 = Regex.Match(headerStr, @"([\d\.,]+[KkMmБбМм]?)\s*(?:subscribers|подписчик)");
                if (match2.Success) return ParseCount(match2.Groups[1].Value);
            }
            return 0;
        }
        catch
        {
            return 0;
        }
    }

    public async Task<string?> ExtractFastSubtitlesAsync(string videoId, string[]? preferredLangs = null, CancellationToken ct = default)
    {
        var langs = preferredLangs ?? ["ru", "en", "es"];
        var payload = new
        {
            videoId,
            context = new
            {
                client = new
                {
                    hl = "en",
                    gl = "US",
                    clientName = "ANDROID",
                    clientVersion = "19.29.35",
                    androidSdkVersion = 30
                }
            }
        };

        using var request = new HttpRequestMessage(HttpMethod.Post, $"{InnerTubeUrl}/player?key={PublicInternalKey}");
        request.Content = new StringContent(JsonSerializer.Serialize(payload), Encoding.UTF8, "application/json");

        using var cts = CancellationTokenSource.CreateLinkedTokenSource(ct);
        cts.CancelAfter(TimeSpan.FromSeconds(10));

        try
        {
            using var response = await _httpClient.SendAsync(request, cts.Token);
            if (!response.IsSuccessStatusCode) return null;
            await using var stream = await response.Content.ReadAsStreamAsync(cts.Token);
            using var doc = await JsonDocument.ParseAsync(stream, cancellationToken: cts.Token);

            if (!doc.RootElement.TryGetProperty("captions", out var captions)) return null;
            if (!captions.TryGetProperty("playerCaptionsTracklistRenderer", out var tracklist)) return null;
            if (!tracklist.TryGetProperty("captionTracks", out var tracks) || tracks.GetArrayLength() == 0) return null;

            string? targetUrl = null;
            foreach (var lang in langs)
            {
                foreach (var track in tracks.EnumerateArray())
                {
                    var code = track.TryGetProperty("languageCode", out var lc) ? lc.GetString()?.ToLowerInvariant() ?? "" : "";
                    if (code.StartsWith(lang))
                    {
                        targetUrl = track.GetProperty("baseUrl").GetString();
                        break;
                    }
                }
                if (targetUrl != null) break;
            }
            targetUrl ??= tracks[0].TryGetProperty("baseUrl", out var bu) ? bu.GetString() : null;
            if (string.IsNullOrEmpty(targetUrl)) return null;

            var subRes = await _httpClient.GetStringAsync($"{targetUrl}&fmt=json3", cts.Token);
            using var subDoc = JsonDocument.Parse(subRes);
            if (!subDoc.RootElement.TryGetProperty("events", out var events)) return null;

            var sb = new StringBuilder();
            foreach (var ev in events.EnumerateArray())
            {
                if (!ev.TryGetProperty("segs", out var segs)) continue;
                foreach (var s in segs.EnumerateArray())
                {
                    if (s.TryGetProperty("utf8", out var text))
                    {
                        sb.Append(text.GetString()).Append(' ');
                    }
                }
            }
            var clean = CleanSpacesRegex().Replace(sb.ToString(), " ").Trim();
            return clean.Length > 40 ? clean : null;
        }
        catch (Exception ex)
        {
            _logger.LogDebug(ex, "[InnerTube] Subtitles unavailable for {VideoId}", videoId);
            return null;
        }
    }

    private static InnerTubeVideoItem? ParseVideoRenderer(JsonElement vr)
    {
        if (!vr.TryGetProperty("videoId", out var vidProp)) return null;
        var vId = vidProp.GetString();
        if (string.IsNullOrEmpty(vId)) return null;
        var title = ExtractJsonText(vr, "title");
        var viewsText = ExtractJsonText(vr, "viewCountText");
        var lengthText = ExtractJsonText(vr, "lengthText");
        var pubText = ExtractJsonText(vr, "publishedTimeText");
        var channelTitle = "";
        var channelId = "";
        if (vr.TryGetProperty("ownerText", out var ot) && ot.TryGetProperty("runs", out var otr) && otr.GetArrayLength() > 0)
        {
            channelTitle = otr[0].GetProperty("text").GetString() ?? "";
            if (otr[0].TryGetProperty("navigationEndpoint", out var nav) &&
                nav.TryGetProperty("browseEndpoint", out var be))
            {
                channelId = be.TryGetProperty("browseId", out var bid) ? bid.GetString() ?? "" : "";
            }
        }
        int durSec = ParseDurationToSeconds(lengthText);

        bool isVerified = false;
        if (vr.TryGetProperty("ownerBadges", out var ob) && ob.ValueKind == JsonValueKind.Array)
        {
            foreach (var b in ob.EnumerateArray())
            {
                if (b.TryGetProperty("metadataBadgeRenderer", out var mbr) &&
                    mbr.TryGetProperty("style", out var style))
                {
                    var s = style.GetString() ?? "";
                    if (s.Contains("VERIFIED", StringComparison.OrdinalIgnoreCase))
                    {
                        isVerified = true;
                        break;
                    }
                }
            }
        }

        return new InnerTubeVideoItem(
            VideoId: vId,
            Title: title,
            ChannelTitle: channelTitle,
            ChannelId: string.IsNullOrEmpty(channelId) ? channelTitle : channelId,
            ViewCount: ParseCount(viewsText),
            DurationSeconds: durSec,
            IsShort: durSec is > 0 and <= 180,
            PublishedText: pubText,
            Url: $"https://youtu.be/{vId}",
            ThumbnailUrl: $"https://i.ytimg.com/vi/{vId}/hqdefault.jpg",
            SubscriberCount: isVerified ? 100_000L : 0L,
            IsVerified: isVerified);
    }

    public static string ExtractJsonText(JsonElement parent, string propertyName)
    {
        if (!parent.TryGetProperty(propertyName, out var prop)) return "";
        if (prop.ValueKind == JsonValueKind.String) return prop.GetString() ?? "";
        if (prop.TryGetProperty("simpleText", out var st)) return st.GetString() ?? "";
        if (prop.TryGetProperty("runs", out var runs) && runs.ValueKind == JsonValueKind.Array)
        {
            var sb = new StringBuilder();
            foreach (var r in runs.EnumerateArray())
            {
                if (r.TryGetProperty("text", out var t)) sb.Append(t.GetString());
            }
            return sb.ToString();
        }
        return "";
    }

    public static long ParseCount(string raw)
    {
        if (string.IsNullOrWhiteSpace(raw)) return 0;
        var clean = raw.ToLowerInvariant().Replace("views", "").Replace("subscribers", "").Replace("подписчиков", "").Replace("подписчика", "").Replace("подписчик", "").Replace(" ", "").Trim();
        double mult = 1.0;
        if (clean.EndsWith('k') || clean.EndsWith('к')) { mult = 1_000; clean = clean[..^1]; }
        else if (clean.EndsWith('m') || clean.EndsWith('м')) { mult = 1_000_000; clean = clean[..^1]; }
        else if (clean.EndsWith('b') || clean.EndsWith('б')) { mult = 1_000_000_000; clean = clean[..^1]; }
        if (double.TryParse(clean.Replace(',', '.'), NumberStyles.Float, CultureInfo.InvariantCulture, out var val))
            return (long)(val * mult);
        return 0;
    }

    public static int ParseDurationToSeconds(string duration)
    {
        if (string.IsNullOrWhiteSpace(duration)) return 0;
        var parts = duration.Split(':');
        try
        {
            if (parts.Length == 3) return int.Parse(parts[0]) * 3600 + int.Parse(parts[1]) * 60 + int.Parse(parts[2]);
            if (parts.Length == 2) return int.Parse(parts[0]) * 60 + int.Parse(parts[1]);
            if (parts.Length == 1 && int.TryParse(parts[0], out var s)) return s;
        }
        catch { }
        return 0;
    }

    [GeneratedRegex(@"\s+")]
    private static partial Regex CleanSpacesRegex();
}
