using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Voice.Domain.Entities;
using Voice.Domain.Ports;
using Voice.Domain.ValueObjects;

namespace Voice.Infrastructure.Persistence;

public sealed class EfTtsJobRepository : ITtsJobRepository
{
    private readonly VoiceDbContext _context;
    private readonly ILogger<EfTtsJobRepository> _logger;

    public EfTtsJobRepository(VoiceDbContext context, ILogger<EfTtsJobRepository> logger)
    {
        _context = context;
        _logger = logger;
    }

    public async Task<TtsJob?> GetByIdAsync(TtsJobId id, CancellationToken ct = default)
    {
        _logger.LogDebug("[VoiceRepo] Поиск TtsJob по ID: {JobId}", id.Value);
        return await _context.TtsJobs.FirstOrDefaultAsync(j => j.Id == id, ct);
    }

    public async Task<IReadOnlyList<TtsJob>> GetByIdsAsync(IEnumerable<TtsJobId> ids, CancellationToken ct = default)
    {
        var idList = ids.Select(i => i.Value).ToList();
        _logger.LogDebug("[VoiceRepo] Пакетная выгрузка {Count} задач...", idList.Count);
        return await _context.TtsJobs.Where(j => idList.Contains(j.Id.Value)).ToListAsync(ct);
    }

    public async Task AddAsync(TtsJob job, CancellationToken ct = default)
    {
        _logger.LogInformation("[VoiceRepo] Добавление новой задачи {JobId} (Status: {Status})", job.Id.Value, job.Status);
        await _context.TtsJobs.AddAsync(job, ct);
    }

    public Task UpdateAsync(TtsJob job, CancellationToken ct = default)
    {
        _logger.LogDebug("[VoiceRepo] Обновление сущности {JobId} (Status: {Status})", job.Id.Value, job.Status);
        _context.TtsJobs.Update(job);
        return Task.CompletedTask;
    }

    public async Task SaveChangesAsync(CancellationToken ct = default)
    {
        _logger.LogDebug("[VoiceRepo] Фиксация изменений в VoiceDbContext...");
        await _context.SaveChangesAsync(ct);
    }
}
