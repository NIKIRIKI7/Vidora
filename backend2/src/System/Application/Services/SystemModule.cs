using System.Diagnostics;
using System.Text.Json;
using Kernel.Exceptions;
using Kernel.Platform.Config;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using SystemContext.Contracts;
using SystemContext.Domain.Entities;
using SystemContext.Domain.Ports;

namespace SystemContext.Application.Services;

public sealed class SystemModule : ISystemModule
{
    private readonly ISystemSettingRepository _settingRepo;
    private readonly IAiModelRepository _modelRepo;
    private readonly ISystemMaintenanceRepository _maintenanceRepo;
    private readonly HardwareMonitorService _hardwareMonitor;
    private readonly AppStorageConfig _storageConfig;
    private readonly ILogger<SystemModule> _logger;

    public SystemModule(
        ISystemSettingRepository settingRepo,
        IAiModelRepository modelRepo,
        ISystemMaintenanceRepository maintenanceRepo,
        HardwareMonitorService hardwareMonitor,
        IOptions<AppStorageConfig> storageConfig,
        ILogger<SystemModule> logger)
    {
        _settingRepo = settingRepo;
        _modelRepo = modelRepo;
        _maintenanceRepo = maintenanceRepo;
        _hardwareMonitor = hardwareMonitor;
        _storageConfig = storageConfig.Value;
        _logger = logger;
    }

    public Task<SystemHardwareStatusDto> GetHardwareStatusAsync(CancellationToken ct = default) =>
        Task.FromResult(_hardwareMonitor.GetMetrics());

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
                catch { }
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
                    root.TryGetProperty("exception", out var ex) && ex.ValueKind != JsonValueKind.Null ? ex.Clone() : null));
            }
            catch { }
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
