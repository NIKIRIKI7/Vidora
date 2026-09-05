using Integrations.YouTube.Contracts;

namespace Integrations.YouTube;

public sealed class YouTubeClient : IYouTubeClient
{
    public IYouTubeMetadataScraper Metadata { get; }
    public IYouTubeDownloader Downloader { get; }

    public YouTubeClient(
        IYouTubeMetadataScraper metadataScraper,
        IYouTubeDownloader downloader)
    {
        Metadata = metadataScraper;
        Downloader = downloader;
    }

    public Task<YouTubeVideoMetadata> GetMetadataAsync(string videoUrlOrId, CancellationToken cancellationToken = default) =>
        Metadata.ScrapeVideoMetadataAsync(videoUrlOrId, cancellationToken);

    public Task<IReadOnlyList<YouTubeVideoMetadata>> SearchAsync(string query, int maxResults = 20, int daysBack = 0, string lang = "ru", CancellationToken cancellationToken = default) =>
        Metadata.SearchVideosAsync(query, maxResults, daysBack, lang, cancellationToken);

    public Task<IReadOnlyList<YouTubeVideoMetadata>> GetRelatedVideosAsync(string videoUrlOrId, int maxResults = 25, string lang = "ru", CancellationToken cancellationToken = default) =>
        Metadata.GetRelatedVideosAsync(videoUrlOrId, maxResults, lang, cancellationToken);

    public Task<IReadOnlyList<YouTubeVideoMetadata>> GetTrendingVideosAsync(string lang = "ru", CancellationToken cancellationToken = default) =>
        Metadata.GetTrendingVideosAsync(lang, cancellationToken);

    public Task<IReadOnlyList<YouTubeVideoMetadata>> GetHomeFeedVideosAsync(string lang = "ru", CancellationToken cancellationToken = default) =>
        Metadata.GetHomeFeedVideosAsync(lang, cancellationToken);

    public Task<IReadOnlyList<string>> GetCommentsAsync(string videoUrlOrId, int maxComments = 20, CancellationToken cancellationToken = default) =>
        Metadata.ScrapeCommentsAsync(videoUrlOrId, maxComments, cancellationToken);

    public Task<string?> GetTranscriptAsync(string videoUrlOrId, string[]? preferredLangs = null, CancellationToken cancellationToken = default) =>
        Metadata.ScrapeTranscriptAsync(videoUrlOrId, preferredLangs, cancellationToken);

    public Task<YouTubeDownloadResult> DownloadVideoAsync(
        string videoUrlOrId,
        YouTubeDownloadOptions? options = null,
        IProgress<double>? progress = null,
        CancellationToken cancellationToken = default) =>
        Downloader.DownloadVideoAsync(videoUrlOrId, options, progress, cancellationToken);

    public Task<YouTubeDownloadResult> DownloadAudioAsync(
        string videoUrlOrId,
        YouTubeDownloadOptions? options = null,
        IProgress<double>? progress = null,
        CancellationToken cancellationToken = default) =>
        Downloader.DownloadAudioAsync(videoUrlOrId, options, progress, cancellationToken);
}
