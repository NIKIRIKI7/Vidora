using Kernel.Platform.Config;
using Kernel.Platform.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using ProductionContext.Application.Services;
using ProductionContext.Contracts;
using ProductionContext.Domain.Ports;
using ProductionContext.Domain.Services;
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
        var storage = configuration.GetSection(AppStorageConfig.SectionName).Get<AppStorageConfig>()
            ?? throw new InvalidOperationException("Секция 'Storage' не найдена в appsettings.json.");
        var fullDataDir = Path.GetFullPath(storage.DataStorageDir);
        if (!Directory.Exists(fullDataDir)) Directory.CreateDirectory(fullDataDir);

        var connectionString = $"Data Source={Path.GetFullPath(storage.GetDatabasePath("production"))}";
        services.AddDbContext<ProductionDbContext>(options => options.UseSqlite(connectionString));

        services.AddScoped<IProjectRepository, EfProjectRepository>();

        // Scenario Engine: AST-парсер вместо устаревшего Regex-парсера (Левый блок)
        services.AddSingleton<ScenarioAstParser>();
        services.AddSingleton<IScenarioParser>(sp => sp.GetRequiredService<ScenarioAstParser>());
        services.AddSingleton<IScenarioAstService>(sp => sp.GetRequiredService<ScenarioAstParser>());
        services.AddSingleton<IVideoStitcher, FfmpegVideoStitcher>();

        // Scenario Engine: режиссёрский линтер — stateless, работает мгновенно (Правый блок)
        services.AddSingleton<ScenarioLinter>();

        // Scenario Engine: ИИ-ассистент (Центральный блок)
        services.AddScoped<ScenarioCopilotService>();

        // Scenario Engine: Шлюз взаимодействия (Facade/Mediator) — единая точка синхронизации
        services.AddScoped<ScenarioEngineGateway>();

        services.AddScoped<ITrendingTopicProvider, ResearchGateway>();
        services.AddScoped<IVoiceGateway, VoiceGateway>();
        services.AddScoped<IMotionGateway, MotionGateway>();
        services.AddScoped<IMediaGateway, MediaGateway>();

        services.AddScoped<IProductionPipelineOrchestrator, ProductionPipelineProcessManager>();
        services.AddScoped<IProductionModule, ProductionModule>();
        services.AddScoped<IDatabaseMigrationParticipant, ProductionMigrationParticipant>();

        // services.AddHostedService<ProductionDatabaseHostedService>(); // migrated to CLI: dotnet run -- --migrate

        return services;
    }
}
