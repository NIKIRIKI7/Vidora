using Kernel.Platform.Config;
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
using MotionContext.Infrastructure.Remotion;
using MotionContext.Infrastructure.Seeding;
using MotionContext.Infrastructure.Workers;

namespace MotionContext;

public static class MotionServiceExtensions
{
    public static IServiceCollection AddMotionContext(
        this IServiceCollection services,
        IConfiguration configuration)
    {
        var storageSection = configuration.GetSection(AppStorageConfig.SectionName);
        var storage = storageSection.Get<AppStorageConfig>() ?? new AppStorageConfig();
        var dataDir = string.IsNullOrWhiteSpace(storage.DataStorageDir) ? "data_storage" : storage.DataStorageDir;
        var fullDataDir = Path.GetFullPath(dataDir);
        if (!Directory.Exists(fullDataDir)) Directory.CreateDirectory(fullDataDir);

        var connectionString = $"Data Source={Path.Combine(fullDataDir, "motion.db")}";
        services.AddDbContext<MotionDbContext>(options => options.UseSqlite(connectionString));

        // Persistence
        services.AddScoped<ISceneCodeRepository, EfSceneCodeRepository>();
        services.AddScoped<IRenderJobRepository, EfRenderJobRepository>();

        // Domain & Application Services
        services.AddSingleton<IPackageCapabilityRegistry, PackageCapabilityRegistry>();
        services.AddSingleton<ITsxSanitizer, TsxSanitizer>();
        services.AddScoped<IScenePromptComposer, ScenePromptComposer>();
        services.AddScoped<ILlmCodeExtractor, LlmCodeExtractor>();

        // Reactive Render Queue (Channel-based, no polling)
        services.AddSingleton<IRenderJobQueue, ChannelRenderJobQueue>();
        services.AddSingleton<IRenderTracker, RenderTracker>();

        // Remotion Environment & Templating
        services.AddSingleton<IWorkspaceLinker, WorkspaceLinker>();
        services.AddSingleton<IRemotionTemplateRenderer, RemotionTemplateRenderer>();
        services.AddSingleton<INodeEnvironmentResolver, NodeEnvironmentResolver>();
        services.AddSingleton<IRemotionWorkspaceManager, RemotionWorkspaceManager>();
        services.AddSingleton<IRemotionRunner, RemotionRunner>();

        // LLM Port (registered in Integrations via AddIntegrationServices)

        // Entry point facade
        services.AddScoped<IMotionModule, MotionModule>();

        // Background Hosted Services
        // services.AddHostedService<MotionDatabaseHostedService>(); // migrated to CLI: dotnet run -- --migrate
        services.AddHostedService<RenderQueueHostedService>();

        return services;
    }
}
