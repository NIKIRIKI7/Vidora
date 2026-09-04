using Integrations.YouTube.Config;
using Integrations.YouTube.Contracts;
using Integrations.YouTube.Downloader;
using Integrations.YouTube.Scraper;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace Integrations.YouTube;

public static class YouTubeServiceExtensions
{
    public static IServiceCollection AddYouTubeIntegration(
        this IServiceCollection services,
        IConfiguration configuration)
    {
        var section = configuration.GetSection(YouTubeOptions.SectionName);
        services.Configure<YouTubeOptions>(section);

        // Регистрация скрапера метаданных (ytscrape через Python-враппер)
        services.AddSingleton<IYouTubeMetadataScraper, YtScrapeMetadataScraper>();

        // Регистрация загрузчика медиа (yt-dlp)
        services.AddSingleton<IYouTubeDownloader, YtDlpDownloader>();

        // Регистрация универсального фасада
        services.AddSingleton<IYouTubeClient, YouTubeClient>();

        return services;
    }
}
