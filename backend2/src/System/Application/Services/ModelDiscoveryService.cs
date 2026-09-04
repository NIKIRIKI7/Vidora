using Kernel.Platform.Config;
using Kernel.Platform.FileSystem;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using SystemContext.Domain;
using SystemContext.Domain.Ports;

namespace SystemContext.Application.Services;

public sealed class ModelDiscoveryService : BackgroundService
{
    private static readonly TimeSpan ScanInterval = TimeSpan.FromSeconds(5);
    private readonly IServiceProvider _serviceProvider;
    private readonly AppStorageConfig _storageConfig;
    private readonly ILogger<ModelDiscoveryService> _logger;

    public ModelDiscoveryService(
        IServiceProvider serviceProvider,
        IOptions<AppStorageConfig> storageConfig,
        ILogger<ModelDiscoveryService> logger)
    {
        _serviceProvider = serviceProvider;
        _storageConfig = storageConfig.Value;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _logger.LogInformation("[ModelDiscovery] Мониторинг каталогов AI-моделей запущен.");

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await ScanAndSynchronizeModelsAsync(stoppingToken);
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                _logger.LogError(ex, "[ModelDiscovery] Ошибка при сканировании моделей на диске.");
            }

            await Task.Delay(ScanInterval, stoppingToken);
        }
    }

    public async Task ScanAndSynchronizeModelsAsync(CancellationToken ct)
    {
        using var scope = _serviceProvider.CreateScope();
        var modelRepo = scope.ServiceProvider.GetRequiredService<IAiModelRepository>();
        var models = await modelRepo.GetAllAsync(ct);

        foreach (var model in models)
        {
            var foundPath = ModelPathResolver.Locate(model.TargetDirectory, _storageConfig.DataStorageDir);

            if (!string.IsNullOrEmpty(foundPath))
            {
                long actualSizeBytes = 0;
                if (File.Exists(foundPath))
                {
                    actualSizeBytes = new FileInfo(foundPath).Length;
                }
                else if (Directory.Exists(foundPath))
                {
                    actualSizeBytes = Directory.EnumerateFiles(foundPath, "*", SearchOption.AllDirectories)
                        .Sum(f => new FileInfo(f).Length);
                }

                bool pathChanged = !string.Equals(model.TargetDirectory, foundPath, StringComparison.OrdinalIgnoreCase);

                if (model.Status != ModelDownloadStatus.Ready || pathChanged)
                {
                    _logger.LogInformation("[ModelDiscovery] Модель '{ModelId}' успешно обнаружена: {Path} ({SizeMb:F1} MB). Статус: READY.",
                        model.Id, foundPath, actualSizeBytes / (1024.0 * 1024.0));

                    model.UpdateTargetDirectory(foundPath);
                    model.MarkReady(actualSizeBytes);
                    await modelRepo.UpdateAsync(model, ct);
                    await modelRepo.SaveChangesAsync(ct);
                }
            }
            else if (model.Status == ModelDownloadStatus.Ready)
            {
                _logger.LogWarning("[ModelDiscovery] Модель '{ModelId}' удалена или перемещена ({Path}). Статус сброшен.", model.Id, model.TargetDirectory);
                model.MarkFailed("Файлы модели не найдены на диске.");
                await modelRepo.UpdateAsync(model, ct);
                await modelRepo.SaveChangesAsync(ct);
            }
        }
    }
}
