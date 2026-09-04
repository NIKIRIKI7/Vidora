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
