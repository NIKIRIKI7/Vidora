namespace SystemContext.Contracts;

public interface ISystemModule
{
    Task<SystemHardwareStatusDto> GetHardwareStatusAsync(CancellationToken ct = default);
    Task<SystemHardwareInfoDto> GetHardwareInfoAsync(CancellationToken ct = default);
    Task<AiModelDto> PullModelAsync(string engine, CancellationToken ct = default);
    Task<IReadOnlyList<SystemSettingDto>> GetAllSettingsAsync(CancellationToken ct = default);
    Task<SystemSettingDto> GetSettingAsync(string key, CancellationToken ct = default);
    Task<string?> GetSettingValueAsync(string key, CancellationToken ct = default);
    Task<SystemSettingDto> SetSettingAsync(string key, string value, CancellationToken ct = default);
    Task<IReadOnlyList<AiModelDto>> GetAiModelsAsync(CancellationToken ct = default);
    Task<AiModelDto> TriggerModelDownloadAsync(string modelId, CancellationToken ct = default);
    Task CleanSystemTempFilesAsync(CancellationToken ct = default);
    Task<IReadOnlyList<SystemLogEntryDto>> GetRecentLogsAsync(int limit = 100, string? level = null, CancellationToken ct = default);
}
