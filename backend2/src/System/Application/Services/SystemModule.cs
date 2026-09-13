using System.Diagnostics;
using System.Text.Json;
using Kernel.Exceptions;
using Kernel.Platform.Config;
using Kernel.Platform.FileSystem;
using Kernel.Platform.Process;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using SystemContext.Contracts;
using SystemContext.Domain;
using SystemContext.Domain.Entities;
using SystemContext.Domain.Ports;

namespace SystemContext.Application.Services;

public sealed class SystemModule : ISystemModule
{
    private readonly ISystemSettingRepository _settingRepo;
    private readonly IAiModelRepository _modelRepo;
    private readonly ISystemMaintenanceRepository _maintenanceRepo;
    private readonly HardwareMonitorService _hardwareMonitor;
    private readonly IPathResolver _pathResolver;
    private readonly AppStorageConfig _storageConfig;
    private readonly IServiceProvider _serviceProvider;
    private readonly ILogger<SystemModule> _logger;

    public SystemModule(
        ISystemSettingRepository settingRepo,
        IAiModelRepository modelRepo,
        ISystemMaintenanceRepository maintenanceRepo,
        HardwareMonitorService hardwareMonitor,
        IPathResolver pathResolver,
        IOptions<AppStorageConfig> storageConfig,
        IServiceProvider serviceProvider,
        ILogger<SystemModule> logger)
    {
        _settingRepo = settingRepo;
        _modelRepo = modelRepo;
        _maintenanceRepo = maintenanceRepo;
        _hardwareMonitor = hardwareMonitor;
        _pathResolver = pathResolver;
        _storageConfig = storageConfig.Value;
        _serviceProvider = serviceProvider;
        _logger = logger;
    }

    public Task<SystemHardwareStatusDto> GetHardwareStatusAsync(CancellationToken ct = default) =>
        Task.FromResult(_hardwareMonitor.GetMetrics());

    public Task<SystemHardwareInfoDto> GetHardwareInfoAsync(CancellationToken ct = default) =>
        _hardwareMonitor.GetHardwareInfoAsync(ct);

    public async Task<AiModelDto> PullModelAsync(string engine, CancellationToken ct = default)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(engine);
        var cleanEngine = engine.Trim();
        _logger.LogInformation("[System] Запуск загрузки модели: {Engine}", cleanEngine);

        var existing = await _modelRepo.GetByIdAsync(cleanEngine.ToLowerInvariant(), ct);
        if (existing == null)
        {
            var all = await _modelRepo.GetAllAsync(ct);
            existing = all.FirstOrDefault(m => m.Name.Contains(cleanEngine, StringComparison.OrdinalIgnoreCase));
        }

        if (existing != null)
        {
            existing.MarkDownloading();
            await _modelRepo.UpdateAsync(existing, ct);
            await _modelRepo.SaveChangesAsync(ct);
            return MapModel(existing);
        }

        var safeId = _pathResolver.SanitizeFileName(cleanEngine.Replace('/', '_').ToLowerInvariant());
        var targetSubDir = _storageConfig.GetModelPath($"llm/{safeId}");

        var artifact = AiModelArtifact.Create(
            id: safeId,
            name: cleanEngine,
            category: ModelCategory.Llm,
            targetDirectory: targetSubDir,
            downloadUrl: cleanEngine.StartsWith("http", StringComparison.OrdinalIgnoreCase)
                ? cleanEngine
                : $"https://huggingface.co/{cleanEngine}",
            expectedSizeBytes: 4_000_000_000,
            version: "latest",
            isRequired: false);

        artifact.MarkDownloading();
        await _modelRepo.AddAsync(artifact, ct);
        await _modelRepo.SaveChangesAsync(ct);

        // Фоновая попытка загрузки через Ollama CLI (если установлена).
        _ = Task.Run(async () =>
        {
            using var scope = _serviceProvider.CreateScope();
            var supervisor = scope.ServiceProvider.GetRequiredService<IProcessSupervisor>();
            var repo = scope.ServiceProvider.GetRequiredService<IAiModelRepository>();
            try
            {
                var result = await supervisor.RunAsync(
                    "ollama", $"pull {cleanEngine}", cancellationToken: CancellationToken.None);

                var art = await repo.GetByIdAsync(safeId, CancellationToken.None);
                if (art != null)
                {
                    if (result.ExitCode == 0)
                    {
                        art.MarkReady(4_000_000_000);
                    }
                    else
                    {
                        art.MarkFailed(result.StandardError);
                    }
                    await repo.UpdateAsync(art, CancellationToken.None);
                    await repo.SaveChangesAsync(CancellationToken.None);
                }
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "[System] Фоновый pull через ollama не выполнен: {Engine}", cleanEngine);
            }
        });

        return MapModel(artifact);
    }

    public async Task<IReadOnlyList<SystemSettingDto>> GetAllSettingsAsync(CancellationToken ct = default)
    {
        var settings = await _settingRepo.GetAllAsync(ct);
        return settings.Select(MapSetting).ToList();
    }

    public async Task<SystemSettingDto> GetSettingAsync(string key, CancellationToken ct = default)
    {
        var setting = await _settingRepo.GetByKeyAsync(key, ct)
            ?? throw new ResourceNotFoundException("SystemSetting", key);

        return MapSetting(setting);
    }

    public async Task<string?> GetSettingValueAsync(string key, CancellationToken ct = default)
    {
        var setting = await _settingRepo.GetByKeyAsync(key, ct);
        return setting?.Value;
    }

    public async Task<SystemSettingDto> SetSettingAsync(string key, string value, CancellationToken ct = default)
    {
        var setting = await _settingRepo.GetByKeyAsync(key, ct)
            ?? throw new ResourceNotFoundException("SystemSetting", key);

        setting.UpdateValue(value);
        await _settingRepo.UpdateAsync(setting, ct);
        await _settingRepo.SaveChangesAsync(ct);

        _logger.LogInformation("[System] Обновлена настройка {Key} = {Value}", key, value);
        return MapSetting(setting);
    }

    public async Task<IReadOnlyList<AiModelDto>> GetAiModelsAsync(CancellationToken ct = default)
    {
        var models = await _modelRepo.GetAllAsync(ct);
        return models.Select(MapModel).ToList();
    }

    public async Task<AiModelDto> TriggerModelDownloadAsync(string modelId, CancellationToken ct = default)
    {
        var model = await _modelRepo.GetByIdAsync(modelId, ct)
            ?? throw new ResourceNotFoundException("AiModelArtifact", modelId);

        model.MarkDownloading();
        await _modelRepo.UpdateAsync(model, ct);
        await _modelRepo.SaveChangesAsync(ct);

        _logger.LogInformation("[System] Запущена загрузка модели {ModelId}", modelId);
        return MapModel(model);
    }

    public async Task CleanSystemTempFilesAsync(CancellationToken ct = default)
    {
        var sw = Stopwatch.StartNew();
        int deletedFiles = 0;
        try
        {
            var tempDir = Path.GetTempPath();
            var pattern = "vidora_*";
            foreach (var file in Directory.EnumerateFiles(tempDir, pattern))
            {
                try
                {
                    File.Delete(file);
                    deletedFiles++;
                }
                catch (Exception ex)
                {
                    _logger.LogDebug(ex, "[System] Не удалось удалить временный файл {File}", file);
                }
            }

            sw.Stop();
            await _maintenanceRepo.LogAsync(
                SystemMaintenanceLog.Create("CLEAN_TEMP_FILES", sw.ElapsedMilliseconds, true, $"Удалено файлов: {deletedFiles}"),
                ct);

            _logger.LogInformation("[System] Очистка временных файлов завершена за {Ms} мс. Удалено: {Count}", sw.ElapsedMilliseconds, deletedFiles);
        }
        catch (Exception ex)
        {
            sw.Stop();
            await _maintenanceRepo.LogAsync(
                SystemMaintenanceLog.Create("CLEAN_TEMP_FILES", sw.ElapsedMilliseconds, false, ex.Message),
                ct);
            throw;
        }
    }

    public async Task<IReadOnlyList<SystemLogEntryDto>> GetRecentLogsAsync(
        int limit = 100,
        string? level = null,
        CancellationToken ct = default)
    {
        var logFilePath = _storageConfig.GetLogFilePath();

        if (!File.Exists(logFilePath))
        {
            return [];
        }

        var entries = new List<SystemLogEntryDto>();
        using var fs = new FileStream(logFilePath, FileMode.Open, FileAccess.Read, FileShare.ReadWrite);
        using var reader = new StreamReader(fs);

        var lines = new List<string>();
        while (await reader.ReadLineAsync(ct) is { } line)
        {
            if (!string.IsNullOrWhiteSpace(line))
            {
                lines.Add(line);
            }
        }

        for (int i = lines.Count - 1; i >= 0 && entries.Count < limit; i--)
        {
            try
            {
                using var doc = JsonDocument.Parse(lines[i]);
                var root = doc.RootElement;
                var entryLevel = root.GetProperty("level").GetString() ?? "INFO";

                if (!string.IsNullOrWhiteSpace(level) && !entryLevel.Equals(level.Trim(), StringComparison.OrdinalIgnoreCase))
                {
                    continue;
                }

                entries.Add(new SystemLogEntryDto(
                    root.GetProperty("timestamp").GetDateTimeOffset(),
                    entryLevel,
                    root.GetProperty("category").GetString() ?? "",
                    root.GetProperty("event_id").GetInt32(),
                    root.GetProperty("message").GetString() ?? "",
                    root.TryGetProperty("exception", out var ex) && ex.ValueKind != JsonValueKind.Null ? ex.GetRawText() : null));
            }
            catch (Exception logEx)
            {
                _logger.LogTrace(logEx, "[System] Пропущена нечитаемая строка лога");
            }
        }

        return entries;
    }

    private static SystemSettingDto MapSetting(SystemSetting s) =>
        new(s.Id, s.Value, s.Description, s.DataType, s.IsReadOnly, s.UpdatedAt);

    private static AiModelDto MapModel(AiModelArtifact m) =>
        new(m.Id, m.Name, m.Category, m.TargetDirectory,
            Math.Round((double)m.ExpectedSizeBytes / (1024 * 1024), 2),
            Math.Round((double)m.DownloadedSizeBytes / (1024 * 1024), 2),
            m.Status, m.ErrorMessage, m.Version, m.IsRequired);
}
