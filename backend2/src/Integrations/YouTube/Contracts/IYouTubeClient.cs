namespace Integrations.YouTube.Contracts;

/// <summary>
/// Единый фасад взаимодействия с YouTube:
/// Метаданные через ytscrape, скачивание потоков через yt-dlp.
/// </summary>
public interface IYouTubeClient
{
    IYouTubeMetadataScraper Metadata { get; }
    IYouTubeDownloader Downloader { get; }

    Task<YouTubeVideoMetadata> GetMetadataAsync(string videoUrlOrId, CancellationToken cancellationToken = default);
    Task<YouTubeDownloadResult> DownloadVideoAsync(string videoUrlOrId, YouTubeDownloadOptions? options = null, IProgress<double>? progress = null, CancellationToken cancellationToken = default);
    Task<YouTubeDownloadResult> DownloadAudioAsync(string videoUrlOrId, YouTubeDownloadOptions? options = null, IProgress<double>? progress = null, CancellationToken cancellationToken = default);
}
