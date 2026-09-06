using Integrations.YouTube.Config;
using Integrations.YouTube.Contracts;
using Integrations.YouTube.Downloader;
using Integrations.YouTube.Innertube;
using Integrations.YouTube.Scraper;
using Kernel.Platform.Config;
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

        services.PostConfigure<YouTubeOptions>(opts =>
        {
            var storageSection = configuration.GetSection(AppStorageConfig.SectionName);
            var storage = storageSection.Get<AppStorageConfig>();
            if (storage != null)
            {
                if (string.IsNullOrWhiteSpace(opts.ToolsDir))
                    opts.ToolsDir = storage.ToolsDir;
                if (string.IsNullOrWhiteSpace(opts.DownloadDirectory))
                    opts.DownloadDirectory = storage.GetTempDirectory("youtube");
            }
        });

        // Native In-Process metadata scraper based on InnerTube
        services.AddHttpClient<IYouTubeMetadataScraper, InnerTubeMetadataScraper>(client =>
        {
            client.Timeout = TimeSpan.FromSeconds(45);
            client.DefaultRequestHeaders.UserAgent.ParseAdd("Vidora-DeepTrend/2.0");
        });

        // Note: IInnerTubeClient is registered via InnerTubeServiceExtensions.AddInnerTubeModule()
        // Do NOT register it here to avoid duplicate/conflicting registrations.

        services.AddSingleton<IYouTubeDownloader, YtDlpDownloader>();
        services.AddSingleton<IYouTubeClient, YouTubeClient>();

        return services;
    }
}
