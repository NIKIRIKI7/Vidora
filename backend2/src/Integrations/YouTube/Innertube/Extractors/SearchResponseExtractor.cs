using System.Text.Json;
using Integrations.YouTube.Innertube.Config;
using Integrations.YouTube.Innertube.Contracts;
using Integrations.YouTube.Innertube.Extractors;

namespace Integrations.YouTube.Innertube.Extractors;

public interface ISearchResponseExtractor
{
    IReadOnlyList<InnerTubeVideoItem> Extract(JsonElement root, int maxResults = 30);
}

public sealed class SearchResponseExtractor : ISearchResponseExtractor
{
    private readonly InnerTubeSchemaConfig _schema;

    public SearchResponseExtractor(InnerTubeSchemaConfig schema)
    {
        _schema = schema;
    }

    public IReadOnlyList<InnerTubeVideoItem> Extract(JsonElement root, int maxResults = 30)
    {
        var results = new List<InnerTubeVideoItem>();
        if (root.ValueKind != JsonValueKind.Object) return results;

        if (!root.TryGetProperty(_schema.ContentsKey, out var contents)) return results;
        if (!contents.TryGetProperty(_schema.TwoColumnSearchResultsKey, out var twoCol)) return results;
        if (!twoCol.TryGetProperty(_schema.PrimaryContentsKey, out var primary)) return results;
        if (!primary.TryGetProperty(_schema.SectionListRendererKey, out var sectionList)) return results;
        if (!sectionList.TryGetProperty(_schema.ContentsKey, out var sections)) return results;

        foreach (var section in sections.EnumerateArray())
        {
            if (results.Count >= maxResults) break;

            if (!section.TryGetProperty(_schema.ItemSectionRendererKey, out var itemSection)) continue;
            if (!itemSection.TryGetProperty(_schema.ContentsKey, out var items)) continue;

            foreach (var item in items.EnumerateArray())
            {
                if (results.Count >= maxResults) break;

                if (item.TryGetProperty(_schema.VideoRendererKey, out var vr))
                {
                    var parsed = ParseVideoRenderer(vr);
                    if (parsed != null) results.Add(parsed);
                }
            }
        }

        return results;
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
