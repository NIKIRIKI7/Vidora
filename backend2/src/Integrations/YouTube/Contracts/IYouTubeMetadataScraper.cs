namespace Integrations.YouTube.Contracts;

/// <summary>
/// Порт извлечения метаданных видео без ключа YouTube Data API (на базе ytscrape).
/// </summary>
public interface IYouTubeMetadataScraper
{
    Task<YouTubeVideoMetadata> ScrapeVideoMetadataAsync(
        string videoUrlOrId,
        CancellationToken cancellationToken = default);
}
