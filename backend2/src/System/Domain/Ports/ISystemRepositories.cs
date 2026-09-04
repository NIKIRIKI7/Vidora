using SystemContext.Domain.Entities;

namespace SystemContext.Domain.Ports;

public interface ISystemSettingRepository
{
    Task<SystemSetting?> GetByKeyAsync(string key, CancellationToken ct = default);
    Task<IReadOnlyList<SystemSetting>> GetAllAsync(CancellationToken ct = default);
    Task AddAsync(SystemSetting setting, CancellationToken ct = default);
    Task UpdateAsync(SystemSetting setting, CancellationToken ct = default);
    Task<bool> ExistsAsync(string key, CancellationToken ct = default);
    Task SaveChangesAsync(CancellationToken ct = default);
}

public interface IAiModelRepository
{
    Task<AiModelArtifact?> GetByIdAsync(string id, CancellationToken ct = default);
    Task<IReadOnlyList<AiModelArtifact>> GetAllAsync(CancellationToken ct = default);
    Task AddAsync(AiModelArtifact model, CancellationToken ct = default);
    Task UpdateAsync(AiModelArtifact model, CancellationToken ct = default);
    Task<bool> ExistsAsync(string id, CancellationToken ct = default);
    Task SaveChangesAsync(CancellationToken ct = default);
}

public interface ISystemMaintenanceRepository
{
    Task LogAsync(SystemMaintenanceLog log, CancellationToken ct = default);
    Task<IReadOnlyList<SystemMaintenanceLog>> GetRecentLogsAsync(int limit = 50, CancellationToken ct = default);
}
