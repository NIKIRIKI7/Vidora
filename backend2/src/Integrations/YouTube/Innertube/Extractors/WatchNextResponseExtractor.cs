using System.Text.Json;
using Integrations.YouTube.Innertube.Config;
using Integrations.YouTube.Innertube.Contracts;
using Integrations.YouTube.Innertube.Extractors;

namespace Integrations.YouTube.Innertube.Extractors;

public interface IWatchNextResponseExtractor
{
    IReadOnlyList<InnerTubeVideoItem> ExtractRelatedVideos(JsonElement root, int maxResults = 25);
    IReadOnlyList<InnerTubeComment> ExtractComments(JsonElement root, int maxComments = 20);
    IReadOnlyList<InnerTubeVideoChapter> ExtractChapters(JsonElement root);
    string? ExtractCommentsContinuationToken(JsonElement root);
    IReadOnlyList<InnerTubeComment> ExtractCommentsFromContinuation(JsonElement root, int maxComments = 50);
    string? ExtractDescription(JsonElement root);
    string? ExtractUploadDate(JsonElement root);
    InnerTubeVideoItem? ExtractPrimaryVideo(JsonElement root);
}

public sealed class WatchNextResponseExtractor : IWatchNextResponseExtractor
{
    private readonly InnerTubeSchemaConfig _schema;

    public WatchNextResponseExtractor(InnerTubeSchemaConfig schema)
    {
        _schema = schema;
    }

    public IReadOnlyList<InnerTubeVideoItem> ExtractRelatedVideos(JsonElement root, int maxResults = 25)
    {
        var results = new List<InnerTubeVideoItem>();
        if (root.ValueKind != JsonValueKind.Object) return results;

        if (!root.TryGetProperty(_schema.ContentsKey, out var contents)) return results;
        if (!contents.TryGetProperty(_schema.TwoColumnWatchNextResultsKey, out var watchNext)) return results;
        if (!watchNext.TryGetProperty(_schema.SecondaryResultsKey, out var sec)) return results;

        var secondaryResultsContainer = sec.TryGetProperty(_schema.SecondaryResultsKey, out var sr) ? sr : sec;
        if (!secondaryResultsContainer.TryGetProperty("results", out var items)) return results;

        foreach (var item in items.EnumerateArray())
        {
            if (results.Count >= maxResults) break;
            ExtractItemsRecursive(item, results, maxResults);
        }

        return results;
    }

    public IReadOnlyList<InnerTubeComment> ExtractComments(JsonElement root, int maxComments = 20)
    {
        var comments = new List<InnerTubeComment>();
        if (root.ValueKind != JsonValueKind.Object) return comments;

        var entities = BuildCommentEntityLookup(root);

        if (root.TryGetProperty(_schema.ContentsKey, out var contents) &&
            contents.TryGetProperty(_schema.TwoColumnWatchNextResultsKey, out var watchNext) &&
            watchNext.TryGetProperty("results", out var results) &&
            results.TryGetProperty("results", out var resultsInner) &&
            resultsInner.TryGetProperty("contents", out var contentsArr) &&
            contentsArr.ValueKind == JsonValueKind.Array)
        {
            foreach (var item in contentsArr.EnumerateArray())
            {
                if (comments.Count >= maxComments) break;
                if (item.TryGetProperty("itemSectionRenderer", out var isr) &&
                    isr.TryGetProperty("contents", out var isrContents) &&
                    isrContents.ValueKind == JsonValueKind.Array)
                {
                    ExtractCommentItems(isrContents, comments, maxComments, entities);
                }
            }
        }

        return comments;
    }

    public string? ExtractDescription(JsonElement root)
    {
        if (root.ValueKind != JsonValueKind.Object) return null;
        if (!root.TryGetProperty(_schema.ContentsKey, out var contents)) return null;
        if (!contents.TryGetProperty(_schema.TwoColumnWatchNextResultsKey, out var watchNext)) return null;
        if (!watchNext.TryGetProperty("results", out var results)) return null;
        if (!results.TryGetProperty("results", out var resultsInner)) return null;
        if (!resultsInner.TryGetProperty("contents", out var contentsArr)) return null;

        foreach (var item in contentsArr.EnumerateArray())
        {
            if (item.TryGetProperty("videoPrimaryInfoRenderer", out var vpir))
            {
                return vpir.ExtractRunsText("description");
            }
        }

        return null;
    }

    public string? ExtractUploadDate(JsonElement root)
    {
        if (root.ValueKind != JsonValueKind.Object) return null;

        if (root.TryGetProperty("microformat", out var microformat) &&
            microformat.TryGetProperty("microformatDataRenderer", out var microformatRenderer) &&
            microformatRenderer.TryGetProperty("uploadDate", out var uploadDateEl) &&
            uploadDateEl.ValueKind == JsonValueKind.String)
        {
            var uploadDate = uploadDateEl.GetString();
            if (!string.IsNullOrWhiteSpace(uploadDate)) return uploadDate;
        }

        if (!root.TryGetProperty(_schema.ContentsKey, out var contents)) return null;
        if (!contents.TryGetProperty(_schema.TwoColumnWatchNextResultsKey, out var watchNext)) return null;
        if (!watchNext.TryGetProperty("results", out var results)) return null;
        if (!results.TryGetProperty("results", out var resultsInner)) return null;
        if (!resultsInner.TryGetProperty("contents", out var contentsArr)) return null;

        foreach (var item in contentsArr.EnumerateArray())
        {
            if (!item.TryGetProperty("videoPrimaryInfoRenderer", out var vpir)) continue;

            var date = vpir.ExtractRunsText("dateText");
            if (!string.IsNullOrWhiteSpace(date)) return date;
        }

        return null;
    }

    public IReadOnlyList<InnerTubeVideoChapter> ExtractChapters(JsonElement root)
    {
        var chapters = new List<InnerTubeVideoChapter>();
        if (root.ValueKind != JsonValueKind.Object) return chapters;

        ExtractPlayerOverlayChapters(root, chapters);
        ExtractWatchNextChapters(root, chapters);

        for (int i = 0; i < chapters.Count - 1; i++)
        {
            chapters[i] = chapters[i] with { EndSeconds = chapters[i + 1].StartSeconds };
        }

        return chapters;
    }

    private static void ExtractPlayerOverlayChapters(JsonElement root, List<InnerTubeVideoChapter> chapters)
    {
        if (!root.TryGetProperty("playerOverlays", out var playerOverlays) ||
            !playerOverlays.TryGetProperty("playerOverlayRenderer", out var overlay) ||
            !overlay.TryGetProperty("decoratedPlayerBarRenderer", out var decorated) ||
            !decorated.TryGetProperty("decoratedPlayerBarRenderer", out var inner) ||
            !inner.TryGetProperty("playerBar", out var playerBar) ||
            !playerBar.TryGetProperty("multiMarkersPlayerBarRenderer", out var multiMarkers) ||
            !multiMarkers.TryGetProperty("markersMap", out var markersMap) ||
            markersMap.ValueKind != JsonValueKind.Array)
        {
            return;
        }

        foreach (var entry in markersMap.EnumerateArray())
        {
            if (!entry.TryGetProperty("value", out var value) ||
                !value.TryGetProperty("chapters", out var chaptersArray) ||
                chaptersArray.ValueKind != JsonValueKind.Array)
            {
                continue;
            }

            foreach (var chapter in chaptersArray.EnumerateArray())
            {
                if (!chapter.TryGetProperty("chapterRenderer", out var renderer)) continue;

                var title = renderer.ExtractRunsText("title");
                if (string.IsNullOrWhiteSpace(title)) continue;

                var startSeconds = renderer.TryGetProperty("timeRangeStartMillis", out var startEl)
                    ? (int)(ParseDouble(startEl) / 1000.0)
                    : 0;

                var thumbnail = "";
                if (renderer.TryGetProperty("thumbnail", out var thumbnailEl) &&
                    thumbnailEl.TryGetProperty("thumbnails", out var thumbnails) &&
                    thumbnails.ValueKind == JsonValueKind.Array &&
                    thumbnails.GetArrayLength() > 0 &&
                    thumbnails[0].TryGetProperty("url", out var urlEl))
                {
                    thumbnail = urlEl.GetString() ?? "";
                }

                chapters.Add(new InnerTubeVideoChapter(startSeconds, 0, title, thumbnail));
            }
        }
    }

    private void ExtractWatchNextChapters(JsonElement root, List<InnerTubeVideoChapter> chapters)
    {
        if (!root.TryGetProperty(_schema.ContentsKey, out var contents)) return;
        if (!contents.TryGetProperty(_schema.TwoColumnWatchNextResultsKey, out var watchNext)) return;
        if (!watchNext.TryGetProperty("results", out var results)) return;
        if (!results.TryGetProperty("results", out var resultsInner)) return;
        if (!resultsInner.TryGetProperty("contents", out var contentsArr)) return;

        foreach (var item in contentsArr.EnumerateArray())
        {
            if (item.TryGetProperty("itemSectionRenderer", out var isr) &&
                isr.TryGetProperty("contents", out var isrContents))
            {
                foreach (var content in isrContents.EnumerateArray())
                {
                    if (!content.TryGetProperty("macroMarkersListItemRenderer", out var macro)) continue;

                    var title = macro.ExtractRunsText("title");
                    if (string.IsNullOrWhiteSpace(title)) continue;

                    int startSec = 0;
                    if (macro.TryGetProperty("onTap", out var onTap) &&
                        onTap.TryGetProperty("watchEndpoint", out var watchEp) &&
                        watchEp.TryGetProperty("startTimeSeconds", out var startEl))
                    {
                        startSec = startEl.GetInt32();
                    }

                    chapters.Add(new InnerTubeVideoChapter(startSec, 0, title, ""));
                }
            }

            if (item.TryGetProperty("chapteredPlayerBarRenderer", out var cpbr) &&
                cpbr.TryGetProperty("chapters", out var chaptersArr) &&
                chaptersArr.ValueKind == JsonValueKind.Array)
            {
                foreach (var ch in chaptersArr.EnumerateArray())
                {
                    if (!ch.TryGetProperty("chapterRenderer", out var cr)) continue;

                    var title = cr.ExtractRunsText("title");
                    if (string.IsNullOrWhiteSpace(title)) continue;

                    var thumb = "";
                    if (cr.TryGetProperty("thumbnail", out var thumbEl) &&
                        thumbEl.TryGetProperty("thumbnails", out var thumbArr) &&
                        thumbArr.GetArrayLength() > 0)
                    {
                        thumb = thumbArr[0].TryGetProperty("url", out var urlEl) ? urlEl.GetString() ?? "" : "";
                    }

                    int startSec = 0;
                    if (cr.TryGetProperty("timeRangeStartMillis", out var msEl))
                    {
                        startSec = (int)(ParseDouble(msEl) / 1000.0);
                    }

                    chapters.Add(new InnerTubeVideoChapter(startSec, 0, title, thumb));
                }
            }
        }
    }

    private static double ParseDouble(JsonElement element)
    {
        return element.ValueKind switch
        {
            JsonValueKind.Number => element.GetDouble(),
            JsonValueKind.String => double.TryParse(
                element.GetString(), System.Globalization.NumberStyles.Float,
                System.Globalization.CultureInfo.InvariantCulture, out var value) ? value : 0.0,
            _ => 0.0
        };
    }

    public string? ExtractCommentsContinuationToken(JsonElement root)
    {
        if (root.ValueKind != JsonValueKind.Object) return null;
        if (!root.TryGetProperty(_schema.ContentsKey, out var contents)) return null;
        if (!contents.TryGetProperty(_schema.TwoColumnWatchNextResultsKey, out var watchNext)) return null;
        if (!watchNext.TryGetProperty("results", out var results)) return null;
        if (!results.TryGetProperty("results", out var resultsInner)) return null;
        if (!resultsInner.TryGetProperty("contents", out var contentsArr)) return null;

        string? firstToken = null;

        foreach (var item in contentsArr.EnumerateArray())
        {
            if (!item.TryGetProperty("itemSectionRenderer", out var isr)) continue;

            var isCommentSection =
                (isr.TryGetProperty("sectionIdentifier", out var sectionId) &&
                 sectionId.GetString() == "comment-item-section") ||
                (isr.TryGetProperty("targetId", out var targetId) &&
                 targetId.GetString() == "comments-section");

            if (!isr.TryGetProperty("contents", out var isrContents)) continue;

            foreach (var content in isrContents.EnumerateArray())
            {
                if (!content.TryGetProperty("continuationItemRenderer", out var cir) ||
                    !cir.TryGetProperty("continuationEndpoint", out var ep) ||
                    !ep.TryGetProperty("continuationCommand", out var cmd) ||
                    !cmd.TryGetProperty("token", out var tokenEl) ||
                    tokenEl.ValueKind != JsonValueKind.String)
                {
                    continue;
                }

                var token = tokenEl.GetString();
                if (string.IsNullOrEmpty(token)) continue;

                if (isCommentSection) return token;
                firstToken ??= token;
            }
        }

        return firstToken;
    }

    public IReadOnlyList<InnerTubeComment> ExtractCommentsFromContinuation(JsonElement root, int maxComments = 50)
    {
        var comments = new List<InnerTubeComment>();
        if (root.ValueKind != JsonValueKind.Object) return comments;

        var entities = BuildCommentEntityLookup(root);

        if (!root.TryGetProperty("onResponseReceivedEndpoints", out var endpoints) ||
            endpoints.ValueKind != JsonValueKind.Array)
        {
            return comments;
        }

        foreach (var endpoint in endpoints.EnumerateArray())
        {
            if (TryGetContinuationItems(endpoint, out var items))
            {
                ExtractCommentItems(items, comments, maxComments, entities);
            }
        }

        return comments;
    }

    private static bool TryGetContinuationItems(JsonElement endpoint, out JsonElement items)
    {
        if (endpoint.TryGetProperty("reloadContinuationItemsCommand", out var reload) &&
            reload.TryGetProperty("continuationItems", out items) &&
            items.ValueKind == JsonValueKind.Array)
        {
            return true;
        }

        if (endpoint.TryGetProperty("appendContinuationItemsAction", out var append) &&
            append.TryGetProperty("continuationItems", out items) &&
            items.ValueKind == JsonValueKind.Array)
        {
            return true;
        }

        items = default;
        return false;
    }

    private static Dictionary<string, JsonElement> BuildCommentEntityLookup(JsonElement root)
    {
        var map = new Dictionary<string, JsonElement>(StringComparer.Ordinal);

        if (!root.TryGetProperty("frameworkUpdates", out var frameworkUpdates) ||
            !frameworkUpdates.TryGetProperty("entityBatchUpdate", out var batchUpdate) ||
            !batchUpdate.TryGetProperty("mutations", out var mutations) ||
            mutations.ValueKind != JsonValueKind.Array)
        {
            return map;
        }

        foreach (var mutation in mutations.EnumerateArray())
        {
            if (!mutation.TryGetProperty("payload", out var payload) ||
                !payload.TryGetProperty("commentEntityPayload", out var entity))
            {
                continue;
            }

            if (entity.TryGetProperty("key", out var keyEl) && keyEl.ValueKind == JsonValueKind.String)
            {
                map[keyEl.GetString()!] = entity;
            }
        }

        return map;
    }

    private void ExtractCommentItems(
        JsonElement items, List<InnerTubeComment> comments, int maxComments,
        Dictionary<string, JsonElement> entities)
    {
        foreach (var item in items.EnumerateArray())
        {
            if (comments.Count >= maxComments) break;

            if (item.TryGetProperty("commentThreadRenderer", out var ctr))
            {
                ExtractCommentThread(ctr, comments, maxComments, entities);
                continue;
            }

            if (item.TryGetProperty("commentRenderer", out var legacyRenderer))
            {
                var legacy = ParseLegacyCommentRenderer(legacyRenderer);
                if (legacy != null) comments.Add(legacy);
            }
        }
    }

    private void ExtractCommentThread(
        JsonElement thread, List<InnerTubeComment> comments, int maxComments,
        Dictionary<string, JsonElement> entities)
    {
        if (comments.Count >= maxComments) return;

        if (thread.TryGetProperty("commentViewModel", out var viewModelWrapper) &&
            viewModelWrapper.TryGetProperty("commentViewModel", out var viewModel))
        {
            var comment = ParseCommentViewModel(viewModel, entities);
            if (comment != null) comments.Add(comment);
        }
        else if (thread.TryGetProperty("comment", out var wrapper) &&
                 wrapper.TryGetProperty("commentRenderer", out var legacyRenderer))
        {
            var legacy = ParseLegacyCommentRenderer(legacyRenderer);
            if (legacy != null) comments.Add(legacy);
        }

        if (comments.Count < maxComments &&
            thread.TryGetProperty("replies", out var replies) &&
            replies.TryGetProperty("commentRepliesRenderer", out var repliesRenderer) &&
            repliesRenderer.TryGetProperty("contents", out var replyItems) &&
            replyItems.ValueKind == JsonValueKind.Array)
        {
            ExtractCommentItems(replyItems, comments, maxComments, entities);
        }
    }

    private static InnerTubeComment? ParseCommentViewModel(
        JsonElement viewModel, Dictionary<string, JsonElement> entities)
    {
        var commentKey = viewModel.TryGetProperty("commentKey", out var keyEl) ? keyEl.GetString() : null;
        var commentId = viewModel.TryGetProperty("commentId", out var idEl) ? idEl.GetString() ?? "" : "";

        if (commentKey == null || !entities.TryGetValue(commentKey, out var entity) ||
            !entity.TryGetProperty("properties", out var properties))
        {
            return null;
        }

        var text = "";
        if (properties.TryGetProperty("content", out var content) &&
            content.TryGetProperty("content", out var textEl))
        {
            text = textEl.GetString() ?? "";
        }

        if (string.IsNullOrWhiteSpace(text)) return null;

        var authorName = "";
        var authorChannelId = "";
        var author = entity.TryGetProperty("author", out var entityAuthor)
            ? entityAuthor
            : properties.TryGetProperty("author", out var propAuthor) ? propAuthor : default;
        if (author.ValueKind == JsonValueKind.Object)
        {
            authorName = author.ExtractRunsText("displayName");
            if (author.TryGetProperty("channelId", out var channelIdEl))
            {
                authorChannelId = channelIdEl.GetString() ?? "";
            }
        }

        var publishedTime = properties.TryGetProperty("publishedTime", out var publishedEl)
            ? publishedEl.GetString() ?? ""
            : "";

        if (string.IsNullOrEmpty(commentId) &&
            properties.TryGetProperty("commentId", out var propCommentId))
        {
            commentId = propCommentId.GetString() ?? "";
        }

        var likeCount = 0;
        var toolbar = entity.TryGetProperty("toolbar", out var entityToolbar)
            ? entityToolbar
            : properties.TryGetProperty("toolbar", out var propToolbar) ? propToolbar : default;
        if (toolbar.ValueKind == JsonValueKind.Object)
        {
            var likeText = toolbar.TryGetProperty("likeCountLiked", out var liked)
                ? liked.GetString()
                : toolbar.TryGetProperty("likeCountNotliked", out var notLiked)
                    ? notLiked.GetString()
                    : null;
            likeCount = (int)InnerTubeParsers.ParseCount(likeText ?? "");
        }

        return new InnerTubeComment(
            AuthorName: authorName,
            AuthorChannelId: authorChannelId,
            Text: text,
            LikeCount: likeCount,
            PublishedTime: publishedTime,
            CommentId: commentId,
            Category: "general");
    }

    private static InnerTubeComment? ParseLegacyCommentRenderer(JsonElement renderer)
    {
        var authorName = renderer.ExtractRunsText("authorText");
        var authorChannelId = "";
        if (renderer.TryGetProperty("authorEndpoint", out var authorEndpoint) &&
            authorEndpoint.TryGetProperty("browseEndpoint", out var browseEndpoint))
        {
            authorChannelId = browseEndpoint.TryGetProperty("browseId", out var browseId)
                ? browseId.GetString() ?? ""
                : "";
        }

        var commentId = renderer.TryGetProperty("commentId", out var commentIdEl)
            ? commentIdEl.GetString() ?? ""
            : "";
        var text = renderer.ExtractRunsText("contentText");
        var publishedTime = renderer.ExtractRunsText("publishedTimeText");

        var likeCount = 0;
        if (renderer.TryGetProperty("voteCount", out var voteCount))
        {
            likeCount = (int)InnerTubeParsers.ParseCount(voteCount.ExtractRunsText("simpleText"));
        }

        if (string.IsNullOrWhiteSpace(text)) return null;

        return new InnerTubeComment(
            AuthorName: authorName,
            AuthorChannelId: authorChannelId,
            Text: text,
            LikeCount: likeCount,
            PublishedTime: publishedTime,
            CommentId: commentId,
            Category: "general");
    }

    public InnerTubeVideoItem? ExtractPrimaryVideo(JsonElement root)
    {
        if (root.ValueKind != JsonValueKind.Object) return null;
        if (!root.TryGetProperty(_schema.ContentsKey, out var contents)) return null;
        if (!contents.TryGetProperty(_schema.TwoColumnWatchNextResultsKey, out var watchNext)) return null;
        if (!watchNext.TryGetProperty("results", out var results)) return null;
        if (!results.TryGetProperty("results", out var resultsInner)) return null;
        if (!resultsInner.TryGetProperty("contents", out var contentsArr)) return null;

        foreach (var item in contentsArr.EnumerateArray())
        {
            if (item.TryGetProperty("videoPrimaryInfoRenderer", out var vpir))
            {
                var videoId = vpir.TryGetProperty("videoId", out var vid) ? vid.GetString() ?? "" : "";
                if (string.IsNullOrEmpty(videoId)) continue;

                var title = vpir.ExtractRunsText("title");
                var viewCountText = vpir.ExtractRunsText("viewCountText");
                var dateText = vpir.ExtractRunsText("dateText");

                return new InnerTubeVideoItem(
                    VideoId: videoId,
                    Title: title,
                    ChannelTitle: "",
                    ChannelId: "",
                    ViewCount: InnerTubeParsers.ParseCount(viewCountText),
                    DurationSeconds: 0,
                    IsShort: false,
                    PublishedText: dateText,
                    Url: $"https://youtu.be/{videoId}",
                    ThumbnailUrl: $"https://i.ytimg.com/vi/{videoId}/hqdefault.jpg");
            }
        }

        return null;
    }

    private void ExtractItemsRecursive(JsonElement element, List<InnerTubeVideoItem> results, int maxResults)
    {
        if (results.Count >= maxResults) return;

        if (element.TryGetProperty(_schema.CompactVideoRendererKey, out var cvr))
        {
            var parsed = ParseCompactVideoRenderer(cvr);
            if (parsed != null) results.Add(parsed);
            return;
        }

        if (element.TryGetProperty(_schema.VideoRendererKey, out var vr))
        {
            var parsed = ParseVideoRenderer(vr);
            if (parsed != null) results.Add(parsed);
            return;
        }

        if (element.TryGetProperty(_schema.ItemSectionRendererKey, out var isr) &&
            isr.TryGetProperty(_schema.ContentsKey, out var isrContents))
        {
            foreach (var child in isrContents.EnumerateArray())
            {
                ExtractItemsRecursive(child, results, maxResults);
            }
        }

        if (element.TryGetProperty(_schema.RichItemRendererKey, out var rir) &&
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

        var title = cvr.ExtractRunsText("title");
        var viewsText = cvr.ExtractRunsText("viewCountText");
        var lengthText = cvr.ExtractRunsText("lengthText");
        var pubText = cvr.ExtractRunsText("publishedTimeText");

        var channelTitle = "";
        var channelId = "";
        if (cvr.TryGetProperty("shortBylineText", out var sbt) && sbt.TryGetProperty("runs", out var sbtr) && sbtr.GetArrayLength() > 0)
        {
            channelTitle = sbtr[0].TryGetProperty("text", out var t) ? t.GetString() ?? "" : "";
            if (sbtr[0].TryGetProperty("navigationEndpoint", out var nav) &&
                nav.TryGetProperty("browseEndpoint", out var be))
            {
                channelId = be.TryGetProperty("browseId", out var bid) ? bid.GetString() ?? "" : "";
            }
        }

        int durSec = InnerTubeParsers.ParseDurationToSeconds(lengthText);

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
            ViewCount: InnerTubeParsers.ParseCount(viewsText),
            DurationSeconds: durSec,
            IsShort: durSec is > 0 and <= 180,
            PublishedText: pubText,
            Url: $"https://youtu.be/{vId}",
            ThumbnailUrl: $"https://i.ytimg.com/vi/{vId}/hqdefault.jpg",
            SubscriberCount: subscriberCount,
            IsVerified: isVerified);
    }

    private InnerTubeVideoItem? ParseVideoRenderer(JsonElement vr)
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
}
