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

        if (!root.TryGetProperty(_schema.ContentsKey, out var contents)) return comments;
        if (!contents.TryGetProperty(_schema.TwoColumnWatchNextResultsKey, out var watchNext)) return comments;
        if (!watchNext.TryGetProperty("results", out var results)) return comments;
        if (!results.TryGetProperty("results", out var resultsInner))
        {
            return comments;
        }
        if (!resultsInner.TryGetProperty("contents", out var contentsArr)) return comments;

        foreach (var item in contentsArr.EnumerateArray())
        {
            if (comments.Count >= maxComments) break;

            if (item.TryGetProperty("itemSectionRenderer", out var isr) &&
                isr.TryGetProperty("contents", out var isrContents))
            {
                foreach (var content in isrContents.EnumerateArray())
                {
                    if (comments.Count >= maxComments) break;

                    if (content.TryGetProperty("continuationItemRenderer", out _))
                    {
                        // Comments are loaded via continuation, skip for now
                    }
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

    public IReadOnlyList<InnerTubeVideoChapter> ExtractChapters(JsonElement root)
    {
        var chapters = new List<InnerTubeVideoChapter>();
        if (root.ValueKind != JsonValueKind.Object) return chapters;

        if (!root.TryGetProperty(_schema.ContentsKey, out var contents)) return chapters;
        if (!contents.TryGetProperty(_schema.TwoColumnWatchNextResultsKey, out var watchNext)) return chapters;
        if (!watchNext.TryGetProperty("results", out var results)) return chapters;
        if (!results.TryGetProperty("results", out var resultsInner)) return chapters;
        if (!resultsInner.TryGetProperty("contents", out var contentsArr)) return chapters;

        foreach (var item in contentsArr.EnumerateArray())
        {
            if (item.TryGetProperty("itemSectionRenderer", out var isr) &&
                isr.TryGetProperty("contents", out var isrContents))
            {
                foreach (var content in isrContents.EnumerateArray())
                {
                    if (content.TryGetProperty("macroMarkersListItemRenderer", out var macro))
                    {
                        var title = macro.ExtractRunsText("title");
                        var timeDesc = macro.ExtractRunsText("timeDescription");

                        int startSec = 0;
                        if (macro.TryGetProperty("onTap", out var onTap) &&
                            onTap.TryGetProperty("watchEndpoint", out var watchEp) &&
                            watchEp.TryGetProperty("startTimeSeconds", out var startEl))
                        {
                            startSec = startEl.GetInt32();
                        }

                        chapters.Add(new InnerTubeVideoChapter(
                            StartSeconds: startSec,
                            EndSeconds: 0,
                            Title: title,
                            ThumbnailUrl: ""));
                    }
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
                        startSec = msEl.GetInt32() / 1000;
                    }

                    chapters.Add(new InnerTubeVideoChapter(
                        StartSeconds: startSec,
                        EndSeconds: 0,
                        Title: title,
                        ThumbnailUrl: thumb));
                }
            }
        }

        for (int i = 0; i < chapters.Count - 1; i++)
        {
            chapters[i] = chapters[i] with { EndSeconds = chapters[i + 1].StartSeconds };
        }

        return chapters;
    }

    public string? ExtractCommentsContinuationToken(JsonElement root)
    {
        if (root.ValueKind != JsonValueKind.Object) return null;
        if (!root.TryGetProperty(_schema.ContentsKey, out var contents)) return null;
        if (!contents.TryGetProperty(_schema.TwoColumnWatchNextResultsKey, out var watchNext)) return null;
        if (!watchNext.TryGetProperty("results", out var results)) return null;
        if (!results.TryGetProperty("results", out var resultsInner)) return null;
        if (!resultsInner.TryGetProperty("contents", out var contentsArr)) return null;

        foreach (var item in contentsArr.EnumerateArray())
        {
            if (item.TryGetProperty("itemSectionRenderer", out var isr) &&
                isr.TryGetProperty("contents", out var isrContents))
            {
                foreach (var content in isrContents.EnumerateArray())
                {
                    if (content.TryGetProperty("continuationItemRenderer", out var cir) &&
                        cir.TryGetProperty("continuationEndpoint", out var ep) &&
                        ep.TryGetProperty("continuationCommand", out var cmd) &&
                        cmd.TryGetProperty("token", out var tokenEl))
                    {
                        return tokenEl.GetString();
                    }
                }
            }
        }

        return null;
    }

    public IReadOnlyList<InnerTubeComment> ExtractCommentsFromContinuation(JsonElement root, int maxComments = 50)
    {
        var comments = new List<InnerTubeComment>();
        if (root.ValueKind != JsonValueKind.Object) return comments;

        if (!root.TryGetProperty("onResponseReceivedEndpoints", out var endpoints) ||
            endpoints.ValueKind != JsonValueKind.Array)
            return comments;

        foreach (var endpoint in endpoints.EnumerateArray())
        {
            if (endpoint.TryGetProperty("reloadContinuationItemsCommand", out var reload))
            {
                if (reload.TryGetProperty("continuationItems", out var items) && items.ValueKind == JsonValueKind.Array)
                    ExtractCommentItems(items, comments, maxComments);
            }
            else if (endpoint.TryGetProperty("appendContinuationItemsAction", out var append))
            {
                if (append.TryGetProperty("continuationItems", out var items) && items.ValueKind == JsonValueKind.Array)
                    ExtractCommentItems(items, comments, maxComments);
            }
        }

        return comments;
    }

    private void ExtractCommentItems(JsonElement items, List<InnerTubeComment> comments, int maxComments)
    {
        foreach (var item in items.EnumerateArray())
        {
            if (comments.Count >= maxComments) break;

            if (!item.TryGetProperty("commentThreadRenderer", out var ctr)) continue;
            if (!ctr.TryGetProperty("comment", out var commentWrapper)) continue;
            if (!commentWrapper.TryGetProperty("commentRenderer", out var cr)) continue;

            var authorName = cr.ExtractRunsText("authorText");
            var authorChannelId = "";
            if (cr.TryGetProperty("authorEndpoint", out var ae) &&
                ae.TryGetProperty("browseEndpoint", out var be))
            {
                authorChannelId = be.TryGetProperty("browseId", out var bid) ? bid.GetString() ?? "" : "";
            }

            var commentId = cr.TryGetProperty("commentId", out var cidEl) ? cidEl.GetString() ?? "" : "";
            var text = cr.ExtractRunsText("contentText");
            var pubTime = cr.ExtractRunsText("publishedTimeText");

            int likeCount = 0;
            if (cr.TryGetProperty("voteCount", out var vc))
            {
                var likeText = vc.ExtractRunsText("simpleText");
                likeCount = (int)InnerTubeParsers.ParseCount(likeText);
            }

            comments.Add(new InnerTubeComment(
                AuthorName: authorName,
                AuthorChannelId: authorChannelId,
                Text: text,
                LikeCount: likeCount,
                PublishedTime: pubTime,
                CommentId: commentId));
        }
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
