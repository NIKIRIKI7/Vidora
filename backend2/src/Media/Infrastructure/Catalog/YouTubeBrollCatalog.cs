using Integrations.YouTube.Contracts;
using MediaContext.Domain.Ports;

namespace MediaContext.Infrastructure.Catalog;

public sealed class YouTubeBrollCatalog : IYouTubeBrollCatalog
{
    private readonly IYouTubeClient _ytClient;

    public YouTubeBrollCatalog(IYouTubeClient ytClient)
    {
        _ytClient = ytClient;
    }

    public async Task<IReadOnlyList<YouTubeBrollCandidate>> SearchCandidatesAsync(
        string query,
        int maxResults = 10,
        string license = "creative_commons",
        CancellationToken ct = default)
    {
        var filter = new YouTubeSearchFilter
        {
            Type = "video",
            Features = license == "creative_commons" ? "creative_commons" : null
        };

        var results = await _ytClient.SearchFilteredAsync(query, filter, maxResults, "en", ct);

        return results.Select(v => new YouTubeBrollCandidate(
            v.VideoId,
            v.Title,
            v.ChannelTitle,
            v.ThumbnailUrl,
            (int)v.Duration.TotalSeconds,
            v.ViewCount,
            license)).ToList();
    }

    public async Task<YouTubeBrollCandidate?> GetByIdAsync(string videoId, CancellationToken ct = default)
    {
        var metadata = await _ytClient.GetMetadataAsync(videoId, ct);
        return new YouTubeBrollCandidate(
            metadata.VideoId,
            metadata.Title,
            metadata.ChannelTitle,
            metadata.ThumbnailUrl,
            (int)metadata.Duration.TotalSeconds,
            metadata.ViewCount,
            "unknown");
    }
}
