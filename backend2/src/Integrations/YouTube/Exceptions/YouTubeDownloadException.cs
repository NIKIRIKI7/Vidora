using Kernel.Exceptions;

namespace Integrations.YouTube.Exceptions;

public class YouTubeDownloadException : DomainException
{
    public YouTubeDownloadException(string message, string? target = null, Exception? inner = null)
        : base($"[yt-dlp] Ошибка скачивания видео YouTube: {message}",
               "YOUTUBE_DOWNLOAD_FAILED",
               502,
               new { Target = target },
               inner)
    {
    }
}
