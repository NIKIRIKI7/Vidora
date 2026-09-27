using Kernel.Platform.Config;
using Kernel.Platform.Persistence;
using Kernel.Ports;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using MotionContext.Application.Services;
using MotionContext.Contracts;
using MotionContext.Domain.Ports;
using MotionContext.Infrastructure.Capabilities;
using MotionContext.Infrastructure.Parsing;
using MotionContext.Infrastructure.Persistence;
using MotionContext.Infrastructure.Seeding;

namespace MotionContext;

public static class MotionServiceExtensions
{
    public static IServiceCollection AddMotionContext(
        this IServiceCollection services,
        IConfiguration configuration)
    {
        var storage = configuration.GetSection(AppStorageConfig.SectionName).Get<AppStorageConfig>()
            ?? throw new InvalidOperationException("Секция 'Storage' не найдена в appsettings.json.");
        var fullDataDir = Path.GetFullPath(storage.DataStorageDir);
        if (!Directory.Exists(fullDataDir)) Directory.CreateDirectory(fullDataDir);

        var connectionString = $"Data Source={Path.GetFullPath(storage.GetDatabasePath("motion"))}";
        services.AddDbContext<MotionDbContext>(options => options.UseSqlite(connectionString));

        // Persistence
        services.AddScoped<ISceneCodeRepository, EfSceneCodeRepository>();

        // Domain & Application Services
        services.AddSingleton<IPackageCapabilityRegistry, PackageCapabilityRegistry>();
        services.AddSingleton<ITsxSanitizer, TsxSanitizer>();
        services.AddScoped<IScenePromptComposer, ScenePromptComposer>();
        services.AddScoped<ILlmCodeExtractor, LlmCodeExtractor>();

        // LLM Port (registered in Integrations via AddIntegrationServices)

        // Entry point facade
        services.AddScoped<IMotionModule, MotionModule>();
        services.AddScoped<IDatabaseMigrationParticipant, MotionMigrationParticipant>();

        return services;
    }
}
