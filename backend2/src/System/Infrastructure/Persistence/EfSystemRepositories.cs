using Microsoft.EntityFrameworkCore;
using SystemContext.Domain.Entities;
using SystemContext.Domain.Ports;

namespace SystemContext.Infrastructure.Persistence;

public sealed class EfSystemSettingRepository : ISystemSettingRepository
{
    private readonly SystemDbContext _context;

    public EfSystemSettingRepository(SystemDbContext context) => _context = context;

    public async Task<SystemSetting?> GetByKeyAsync(string key, CancellationToken ct = default) =>
        await _context.Settings.FirstOrDefaultAsync(s => s.Id == key.Trim().ToLowerInvariant(), ct);

    public async Task<IReadOnlyList<SystemSetting>> GetAllAsync(CancellationToken ct = default) =>
        await _context.Settings.OrderBy(s => s.Id).ToListAsync(ct);

    public async Task AddAsync(SystemSetting setting, CancellationToken ct = default) =>
        await _context.Settings.AddAsync(setting, ct);

    public Task UpdateAsync(SystemSetting setting, CancellationToken ct = default)
    {
        _context.Settings.Update(setting);
        return Task.CompletedTask;
    }

    public async Task<bool> ExistsAsync(string key, CancellationToken ct = default) =>
        await _context.Settings.AnyAsync(s => s.Id == key.Trim().ToLowerInvariant(), ct);

    public async Task SaveChangesAsync(CancellationToken ct = default) =>
        await _context.SaveChangesAsync(ct);
}

public sealed class EfAiModelRepository : IAiModelRepository
{
    private readonly SystemDbContext _context;

    public EfAiModelRepository(SystemDbContext context) => _context = context;

    public async Task<AiModelArtifact?> GetByIdAsync(string id, CancellationToken ct = default) =>
        await _context.AiModels.FirstOrDefaultAsync(m => m.Id == id.Trim().ToLowerInvariant(), ct);

    public async Task<IReadOnlyList<AiModelArtifact>> GetAllAsync(CancellationToken ct = default) =>
        await _context.AiModels.OrderBy(m => m.Category).ThenBy(m => m.Name).ToListAsync(ct);

    public async Task AddAsync(AiModelArtifact model, CancellationToken ct = default) =>
        await _context.AiModels.AddAsync(model, ct);

    public Task UpdateAsync(AiModelArtifact model, CancellationToken ct = default)
    {
        _context.AiModels.Update(model);
        return Task.CompletedTask;
    }

    public async Task<bool> ExistsAsync(string id, CancellationToken ct = default) =>
        await _context.AiModels.AnyAsync(m => m.Id == id.Trim().ToLowerInvariant(), ct);

    public async Task SaveChangesAsync(CancellationToken ct = default) =>
        await _context.SaveChangesAsync(ct);
}

public sealed class EfSystemMaintenanceRepository : ISystemMaintenanceRepository
{
    private readonly SystemDbContext _context;

    public EfSystemMaintenanceRepository(SystemDbContext context) => _context = context;

    public async Task LogAsync(SystemMaintenanceLog log, CancellationToken ct = default)
    {
        await _context.MaintenanceLogs.AddAsync(log, ct);
        await _context.SaveChangesAsync(ct);
    }

    public async Task<IReadOnlyList<SystemMaintenanceLog>> GetRecentLogsAsync(int limit = 50, CancellationToken ct = default) =>
        await _context.MaintenanceLogs.OrderByDescending(l => l.CreatedAt).Take(limit).ToListAsync(ct);
}
