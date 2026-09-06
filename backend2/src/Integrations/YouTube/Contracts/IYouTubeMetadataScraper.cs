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

    Task<IReadOnlyList<YouTubeVideoMetadata>> SearchVideosFilteredAsync(
        string query,
        YouTubeSearchFilter? filter = null,
        int maxResults = 20,
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

    Task<IReadOnlyList<YouTubeCommentItem>> ScrapeCommentsDetailedAsync(
        string videoUrlOrId,
        int maxComments = 50,
        CancellationToken cancellationToken = default);

    Task<IReadOnlyList<string>> ScrapeCommentsAsync(
        string videoUrlOrId,
        int maxComments = 20,
        CancellationToken cancellationToken = default);

    Task<IReadOnlyList<YouTubeVideoChapter>> GetVideoChaptersAsync(
        string videoUrlOrId,
        CancellationToken cancellationToken = default);

    Task<IReadOnlyList<YouTubeHeatmapPoint>> GetVideoHeatmapAsync(
        string videoUrlOrId,
        CancellationToken cancellationToken = default);

    Task<IReadOnlyList<YouTubeWordTimestamp>> GetWordTimestampsAsync(
        string videoUrlOrId,
        CancellationToken cancellationToken = default);

    Task<YouTubeChannelStats> GetChannelStatsAsync(
        string channelId,
        CancellationToken cancellationToken = default);

    Task<IReadOnlyList<YouTubeChannelUpload>> GetChannelRecentUploadsAsync(
        string channelId,
        int maxUploads = 15,
        string lang = "ru",
        CancellationToken cancellationToken = default);

    Task<string?> ScrapeTranscriptAsync(
        string videoUrlOrId,
        string[]? preferredLangs = null,
        CancellationToken cancellationToken = default);
}
