namespace Integrations.YouTube.Contracts;

public interface IYouTubeMetadataScraper
{
    Task<YouTubeVideoMetadata> ScrapeVideoMetadataAsync(
        string videoUrlOrId,
        CancellationToken cancellationToken = default);

    Task<IReadOnlyList<YouTubeVideoMetadata>> SearchVideosAsync(
        string query,
        int maxResults = 20,
        int daysBack = 0,
        string lang = "ru",
        CancellationToken cancellationToken = default);

    Task<IReadOnlyList<YouTubeVideoMetadata>> GetRelatedVideosAsync(
        string videoUrlOrId,
        int maxResults = 25,
        string lang = "ru",
        CancellationToken cancellationToken = default);

    Task<IReadOnlyList<YouTubeVideoMetadata>> GetTrendingVideosAsync(
        string lang = "ru",
        CancellationToken cancellationToken = default);

    Task<IReadOnlyList<YouTubeVideoMetadata>> GetHomeFeedVideosAsync(
        string lang = "ru",
        CancellationToken cancellationToken = default);

    Task<IReadOnlyList<string>> ScrapeCommentsAsync(
        string videoUrlOrId,
        int maxComments = 20,
        CancellationToken cancellationToken = default);

    Task<string?> ScrapeTranscriptAsync(
        string videoUrlOrId,
        string[]? preferredLangs = null,
        CancellationToken cancellationToken = default);
}
