using Kernel.Platform.Config;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using ProductionContext.Application.Services;
using ProductionContext.Contracts;
using ProductionContext.Domain.Ports;
using ProductionContext.Infrastructure.Export;
using ProductionContext.Infrastructure.Gateways;
using ProductionContext.Infrastructure.Parsing;
using ProductionContext.Infrastructure.Persistence;
using ProductionContext.Infrastructure.Seeding;

namespace ProductionContext;

public static class ProductionServiceExtensions
{
    public static IServiceCollection AddProductionContext(
        this IServiceCollection services,
        IConfiguration configuration)
    {
        var storageSection = configuration.GetSection(AppStorageConfig.SectionName);
        var storage = storageSection.Get<AppStorageConfig>() ?? new AppStorageConfig();
        var dataDir = string.IsNullOrWhiteSpace(storage.DataStorageDir) ? "data_storage" : storage.DataStorageDir;
        var fullDataDir = Path.GetFullPath(dataDir);
        if (!Directory.Exists(fullDataDir)) Directory.CreateDirectory(fullDataDir);

        var connectionString = $"Data Source={Path.Combine(fullDataDir, "production.db")}";
        services.AddDbContext<ProductionDbContext>(options => options.UseSqlite(connectionString));

        services.AddScoped<IProjectRepository, EfProjectRepository>();

        services.AddSingleton<IScenarioParser, MarkdownScenarioParser>();
        services.AddSingleton<IVideoStitcher, FfmpegVideoStitcher>();

        services.AddScoped<IVoiceGateway, VoiceGateway>();
        services.AddScoped<IMotionGateway, MotionGateway>();
        services.AddScoped<IMediaGateway, MediaGateway>();

        services.AddScoped<IProductionPipelineOrchestrator, ProductionPipelineProcessManager>();
        services.AddScoped<IProductionModule, ProductionModule>();

        // services.AddHostedService<ProductionDatabaseHostedService>(); // migrated to CLI: dotnet run -- --migrate

        return services;
    }
}
