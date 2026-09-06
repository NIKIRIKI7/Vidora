namespace MediaContext.Domain.Ports;

public interface IYouTubeBrollCatalog
{
    Task<IReadOnlyList<YouTubeBrollCandidate>> SearchCandidatesAsync(
        string query,
        int maxResults = 10,
        string license = "creative_commons",
        CancellationToken ct = default);

    Task<YouTubeBrollCandidate?> GetByIdAsync(string videoId, CancellationToken ct = default);
}

public sealed record YouTubeBrollCandidate(
    string VideoId,
    string Title,
    string ChannelTitle,
    string ThumbnailUrl,
    int DurationSeconds,
    long ViewCount,
    string License);
