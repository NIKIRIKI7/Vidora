using Kernel.Events;
using Kernel.Platform.Config;
using Kernel.Platform.FileSystem;
using Kernel.Platform.Gpu;
using Kernel.Platform.Logging;
using Kernel.Platform.Process;
using Kernel.Platform.WebSockets;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;

namespace Kernel;

public static class KernelServiceExtensions
{
    public static IServiceCollection AddKernelServices(
        this IServiceCollection services,
        IConfiguration configuration,
        ILoggingBuilder loggingBuilder)
    {
        // 0. Конфигурация хранилища и JSONL-логгер
        var storageSection = configuration.GetSection(AppStorageConfig.SectionName);
        services.Configure<AppStorageConfig>(storageSection);
        var storage = storageSection.Get<AppStorageConfig>() ?? new AppStorageConfig();

        var dataDir = string.IsNullOrWhiteSpace(storage.DataStorageDir) ? "data_storage" : storage.DataStorageDir;
        var logFilePath = Path.Combine(Path.GetFullPath(dataDir), "app_events.jsonl");
        loggingBuilder.AddJsonLinesFile(logFilePath);

        // 1. Файловая песочница
        var allowedRoots = storage.AllowedRoots.Where(r => !string.IsNullOrWhiteSpace(r)).ToArray();
        if (allowedRoots.Length == 0)
        {
            allowedRoots = [Directory.GetCurrentDirectory()];
        }
        services.AddSingleton<IPathResolver>(sp =>
            new PathResolver(sp.GetRequiredService<ILogger<PathResolver>>(), allowedRoots));

        // 2. Системные супервайзеры
        services.AddSingleton<IProcessSupervisor, ProcessSupervisor>();
        services.AddSingleton<IGpuManager, GpuManager>();
        services.AddSingleton<IPythonEnvironmentResolver, PythonEnvironmentResolver>();
        services.AddSingleton<IMlProcessHost, MlProcessHost>();
        services.AddSingleton<IWebSocketGateway, WebSocketGateway>();

        // 3. Шина событий, DLQ и диспетчер (разделение ответственности)
        services.AddSingleton<IEventDeadLetterQueue, InMemoryDeadLetterQueue>();
        services.AddSingleton<InMemoryEventBus>();
        services.AddSingleton<IEventBus>(sp => sp.GetRequiredService<InMemoryEventBus>());
        services.AddHostedService<DomainEventDispatcherHostedService>();

        return services;
    }
}
