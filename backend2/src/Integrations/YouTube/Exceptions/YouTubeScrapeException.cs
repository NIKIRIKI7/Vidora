using Kernel.Exceptions;

namespace Integrations.YouTube.Exceptions;

public class YouTubeScrapeException : DomainException
{
    public YouTubeScrapeException(string message, string? target = null, Exception? inner = null)
        : base($"[ytscrape] Ошибка получения метаданных YouTube: {message}",
               "YOUTUBE_SCRAPE_FAILED",
               502,
               new { Target = target },
               inner)
    {
    }
}
