using Integrations.YouTube.Innertube.Config;
using Integrations.YouTube.Innertube.Diagnostics;
using Integrations.YouTube.Innertube.Extractors;
using Integrations.YouTube.Innertube.Resolving;
using Integrations.YouTube.Innertube.Transport;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Polly;

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
                        ClientName = "IOS",
                        ClientVersion = "20.10.4",
                        OsName = "iOS",
                        OsVersion = "18.3.1.22D72",
                        Priority = 2,
                        UserAgent = "com.google.ios.youtube/20.10.4 (iPhone16,2; U; CPU iOS 18_3_1 like Mac OS X)"
                    },
                    new InnerTubeClientProfile
                    {
                        ClientName = "ANDROID",
                        ClientVersion = "20.10.38",
                        AndroidSdkVersion = 34,
                        OsName = "Android",
                        OsVersion = "14",
                        Priority = 3,
                        UserAgent = "com.google.android.youtube/20.10.38 (Linux; U; Android 14) gzip"
                    },
                    new InnerTubeClientProfile
                    {
                        ClientName = "TVHTML5_SIMPLY_EMBEDDED_PLAYER",
                        ClientVersion = "2.20240825.01.00",
                        Priority = 4,
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
        })
        .AddStandardResilienceHandler(options =>
        {
            options.Retry.MaxRetryAttempts = 2;
            options.Retry.BackoffType = DelayBackoffType.Exponential;
            options.Retry.UseJitter = true;
            options.AttemptTimeout.Timeout = TimeSpan.FromSeconds(15);
            options.TotalRequestTimeout.Timeout = TimeSpan.FromSeconds(45);
            options.CircuitBreaker.SamplingDuration = TimeSpan.FromSeconds(30);
        });

        services.AddSingleton<IInnerTubeClient, InnerTubeClient>();

        return services;
    }
}
