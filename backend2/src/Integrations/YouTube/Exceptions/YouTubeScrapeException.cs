using Kernel.Exceptions;

namespace Integrations.YouTube.Exceptions;

public class YouTubeScrapeException : DomainException
{
    public YouTubeScrapeException(string message, string? target = null, Exception? inner = null)
        : base($"[YouTube:InnerTube] Ошибка получения метаданных: {message}",
               "YOUTUBE_SCRAPE_FAILED",
               502,
               new { Target = target },
               inner)
    {
    }
}
