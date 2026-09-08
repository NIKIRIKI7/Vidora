using Kernel.Events;
using Kernel.Platform.Config;
using Kernel.Platform.FileSystem;
using Kernel.Platform.Gpu;
using Kernel.Platform.Logging;
using Kernel.Platform.Persistence;
using Kernel.Platform.Process;
using Kernel.Platform.WebSockets;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace Kernel;

public static class KernelServiceExtensions
{
    public static IServiceCollection AddKernelServices(
        this IServiceCollection services,
        IConfiguration configuration,
        ILoggingBuilder loggingBuilder)
    {
        // 1. Привязка конфигурации из JSON с валидацией при старте
        services.AddOptions<AppStorageConfig>()
            .Bind(configuration.GetSection(AppStorageConfig.SectionName))
            .ValidateDataAnnotations()
            .ValidateOnStart();

        // 2. Чтение настроек для инициализации сервисов ядра
        var storageSection = configuration.GetSection(AppStorageConfig.SectionName);
        var storage = storageSection.Get<AppStorageConfig>()
            ?? throw new InvalidOperationException("Критическая ошибка: Секция 'Storage' не найдена в appsettings.json.");

        // Создаем корневую директорию хранилища из конфига
        var fullDataDir = Path.GetFullPath(storage.DataStorageDir);
        if (!Directory.Exists(fullDataDir))
        {
            Directory.CreateDirectory(fullDataDir);
        }

        // Логирование в файл по пути из конфига
        var logFilePath = Path.GetFullPath(storage.GetLogFilePath());
        loggingBuilder.AddJsonLinesFile(logFilePath);

        // 3. Файловая песочница (разрешаем директорию данных и корень проекта)
        var allowedRoots = storage.AllowedRoots
            .Where(r => !string.IsNullOrWhiteSpace(r))
            .Concat([Directory.GetCurrentDirectory(), fullDataDir])
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToArray();

        services.AddSingleton<IPathResolver>(sp =>
            new PathResolver(sp.GetRequiredService<ILogger<PathResolver>>(), allowedRoots));

        // 4. Системные супервайзеры (исключительно нативные CLI: FFmpeg, yt-dlp, Node.js)
        services.AddSingleton<IProcessSupervisor, ProcessSupervisor>();
        services.AddSingleton<IGpuManager, GpuManager>();
        services.AddSingleton<IWebSocketGateway, WebSocketGateway>();

        // 5. Шина событий и DLQ
        services.AddSingleton<IEventDeadLetterQueue, InMemoryDeadLetterQueue>();
        services.AddSingleton<InMemoryEventBus>();
        services.AddSingleton<IEventBus>(sp => sp.GetRequiredService<InMemoryEventBus>());
        services.AddHostedService<DomainEventDispatcherHostedService>();

        // 6. Менеджер миграций БД
        services.AddScoped<DatabaseMigrationManager>();

        return services;
    }
}
