namespace Integrations.YouTube.Contracts;

public interface IYouTubeClient
{
    IYouTubeMetadataScraper Metadata { get; }
    IYouTubeDownloader Downloader { get; }

    Task<YouTubeVideoMetadata> GetMetadataAsync(string videoUrlOrId, CancellationToken cancellationToken = default);
    Task<IReadOnlyList<YouTubeVideoMetadata>> SearchAsync(string query, int maxResults = 20, int daysBack = 0, string lang = "ru", CancellationToken cancellationToken = default);
    Task<IReadOnlyList<YouTubeVideoMetadata>> GetRelatedVideosAsync(string videoUrlOrId, int maxResults = 25, string lang = "ru", CancellationToken cancellationToken = default);
    Task<IReadOnlyList<YouTubeVideoMetadata>> GetTrendingVideosAsync(string lang = "ru", CancellationToken cancellationToken = default);
    Task<IReadOnlyList<YouTubeVideoMetadata>> GetHomeFeedVideosAsync(string lang = "ru", CancellationToken cancellationToken = default);
    Task<IReadOnlyList<string>> GetCommentsAsync(string videoUrlOrId, int maxComments = 20, CancellationToken cancellationToken = default);
    Task<string?> GetTranscriptAsync(string videoUrlOrId, string[]? preferredLangs = null, CancellationToken cancellationToken = default);

    Task<YouTubeDownloadResult> DownloadVideoAsync(
        string videoUrlOrId,
        YouTubeDownloadOptions? options = null,
        IProgress<double>? progress = null,
        CancellationToken cancellationToken = default);

    Task<YouTubeDownloadResult> DownloadAudioAsync(
        string videoUrlOrId,
        YouTubeDownloadOptions? options = null,
        IProgress<double>? progress = null,
        CancellationToken cancellationToken = default);
}
