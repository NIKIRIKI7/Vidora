using Integrations.YouTube.Innertube.Config;
using Integrations.YouTube.Innertube.Diagnostics;
using Integrations.YouTube.Innertube.Extractors;
using Integrations.YouTube.Innertube.Resolving;
using Integrations.YouTube.Innertube.Transport;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace Integrations.YouTube.Innertube;

public static class InnerTubeServiceExtensions
{
    public static IServiceCollection AddInnerTubeModule(this IServiceCollection services, IConfiguration configuration)
    {
        var section = configuration.GetSection(InnerTubeOptions.SectionName);
        services.Configure<InnerTubeOptions>(section);

        services.PostConfigure<InnerTubeOptions>(opts =>
        {
            if (opts.ClientProfiles.Count == 0)
            {
                opts.ClientProfiles =
                [
                    new InnerTubeClientProfile
                    {
                        ClientName = "WEB",
                        ClientVersion = "2.20240825.01.00",
                        ApiKey = "AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8",
                        IsDefault = true,
                        Priority = 1,
                        UserAgent = opts.Defaults.FallbackUserAgent
                    },
                    new InnerTubeClientProfile
                    {
                        ClientName = "ANDROID",
                        ClientVersion = "19.29.35",
                        AndroidSdkVersion = 30,
                        Priority = 2,
                        UserAgent = "com.google.android.youtube/19.29.35 (Linux; U; Android 11) gzip"
                    },
                    new InnerTubeClientProfile
                    {
                        ClientName = "TVHTML5_SIMPLY_EMBEDDED_PLAYER",
                        ClientVersion = "2.0",
                        Priority = 3,
                        UserAgent = "Mozilla/5.0"
                    }
                ];
            }
        });

        services.AddSingleton<IInnerTubeDiagnostics, InnerTubeDiagnostics>();
        services.AddSingleton<IYouTubeQueryResolver, YouTubeQueryResolver>();

        services.AddSingleton<ISearchResponseExtractor>(sp =>
        {
            var opts = sp.GetRequiredService<Microsoft.Extensions.Options.IOptions<InnerTubeOptions>>().Value;
            return new SearchResponseExtractor(opts.Schema);
        });

        services.AddSingleton<IWatchNextResponseExtractor>(sp =>
        {
            var opts = sp.GetRequiredService<Microsoft.Extensions.Options.IOptions<InnerTubeOptions>>().Value;
            return new WatchNextResponseExtractor(opts.Schema);
        });

        services.AddSingleton<IPlayerResponseExtractor>(sp =>
        {
            var opts = sp.GetRequiredService<Microsoft.Extensions.Options.IOptions<InnerTubeOptions>>().Value;
            return new PlayerResponseExtractor(opts.Schema);
        });

        services.AddHttpClient<IInnerTubeHttpTransport, InnerTubeHttpTransport>(client =>
        {
            client.Timeout = TimeSpan.FromSeconds(30);
            client.DefaultRequestHeaders.UserAgent.ParseAdd("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36");
        });

        services.AddSingleton<IInnerTubeClient, InnerTubeClient>();

        return services;
    }
}
