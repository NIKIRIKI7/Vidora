using Integrations.YouTube.Config;
using Integrations.YouTube.Contracts;
using Integrations.YouTube.Downloader;
using Integrations.YouTube.Innertube;
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

        services.AddHttpClient<IYouTubeMetadataScraper, YtScrapeMetadataScraper>(client =>
        {
            client.Timeout = TimeSpan.FromSeconds(45);
            client.DefaultRequestHeaders.UserAgent.ParseAdd("Vidora-DeepTrend/2.0");
        });

        services.AddHttpClient<IInnerTubeClient, InnerTubeClient>(client =>
        {
            client.Timeout = TimeSpan.FromSeconds(30);
            client.DefaultRequestHeaders.UserAgent.ParseAdd("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36");
        });

        services.AddSingleton<IYouTubeDownloader, YtDlpDownloader>();
        services.AddSingleton<IYouTubeClient, YouTubeClient>();

        return services;
    }
}
