namespace Integrations.YouTube.Contracts;

/// <summary>
/// Порт скачивания медиафайлов YouTube через yt-dlp.
/// </summary>
public interface IYouTubeDownloader
{
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
