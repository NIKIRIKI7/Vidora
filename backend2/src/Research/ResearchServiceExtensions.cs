using Kernel.Platform.Config;
using Kernel.Platform.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Research.Application.Pipelines;
using Research.Application.Services;
using Research.Contracts;
using Research.Domain.Ports;
using Research.Domain.Services;
using Research.Infrastructure.Caching;
using Research.Infrastructure.Export;
using Research.Infrastructure.Ingestors;
using Research.Infrastructure.Persistence;
using Research.Infrastructure.Seeding;

namespace Research;

public static class ResearchServiceExtensions
{
    public static IServiceCollection AddResearchContext(
        this IServiceCollection services,
        IConfiguration configuration)
    {
        var storage = configuration.GetSection(AppStorageConfig.SectionName).Get<AppStorageConfig>()
            ?? throw new InvalidOperationException("Секция 'Storage' не найдена в appsettings.json.");
        var fullDataDir = Path.GetFullPath(storage.DataStorageDir);
        if (!Directory.Exists(fullDataDir)) Directory.CreateDirectory(fullDataDir);

        var connectionString = $"Data Source={Path.GetFullPath(storage.GetDatabasePath("research"))}";
        services.AddDbContext<ResearchDbContext>(options => options.UseSqlite(connectionString));

        services.AddScoped<IResearchRunRepository, EfResearchRunRepository>();
        services.AddSingleton<IResearchCacheService, InMemoryResearchCacheService>();
        services.AddScoped<IYouTubeSearchIngestor, YouTubeSearchIngestor>();
        services.AddScoped<IYouTubeVideoInspector, YouTubeVideoInspector>();
        services.AddSingleton<IResearchReportExporter, OpenXmlResearchReportExporter>();

        services.AddSingleton<MomentumEngine>();
        services.AddSingleton<BlueOceanDetector>();
        services.AddSingleton<ConfusionDetector>();
        services.AddSingleton<CommentGoldmineExtractor>();

        services.AddHttpClient<ISignalIngestor, SignalIngestor>(client =>
        {
            client.Timeout = TimeSpan.FromSeconds(15);
        });
        services.AddSingleton<TrendArbitrageEngine>();
        services.AddScoped<YouTubeDeepTrendStreamingPipeline>();

        services.AddScoped<IDeepTrendDagPipeline, DeepTrendDagPipeline>();
        services.AddScoped<IResearchModule, ResearchModule>();
        services.AddScoped<IDatabaseMigrationParticipant, ResearchMigrationParticipant>();

        // services.AddHostedService<ResearchDatabaseHostedService>(); // migrated to CLI: dotnet run -- --migrate

        return services;
    }
}
