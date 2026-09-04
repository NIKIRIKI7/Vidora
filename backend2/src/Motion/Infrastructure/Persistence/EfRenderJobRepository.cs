using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using MotionContext.Domain;
using MotionContext.Domain.Entities;
using MotionContext.Domain.Ports;
using MotionContext.Domain.ValueObjects;

namespace MotionContext.Infrastructure.Persistence;

public sealed class EfRenderJobRepository : IRenderJobRepository
{
    private readonly MotionDbContext _context;
    private readonly ILogger<EfRenderJobRepository> _logger;

    public EfRenderJobRepository(MotionDbContext context, ILogger<EfRenderJobRepository> logger)
    {
        _context = context;
        _logger = logger;
    }

    public async Task<RenderJob?> GetByIdAsync(RenderJobId id, CancellationToken ct = default)
    {
        _logger.LogDebug("[RenderJobRepo] Поиск: {Id}", id.Value);
        return await _context.RenderJobs.FirstOrDefaultAsync(j => j.Id == id, ct);
    }

    public async Task<RenderJob?> GetNextQueuedJobAsync(CancellationToken ct = default)
    {
        var job = await _context.RenderJobs
            .Where(j => j.Status == RenderJobStatus.Queued)
            .ToListAsync(ct);

        var result = job.OrderBy(j => j.CreatedAt).FirstOrDefault();
        if (result != null)
        {
            _logger.LogDebug("[RenderJobRepo] Извлечена задача: {JobId}", result.Id.Value);
        }
        return result;
    }

    public async Task<IReadOnlyList<RenderJob>> GetBySceneCodeIdAsync(SceneCodeId sceneCodeId, CancellationToken ct = default)
    {
        _logger.LogDebug("[RenderJobRepo] Выборка задач для сцены: {SceneId}", sceneCodeId.Value);
        return await _context.RenderJobs
            .Where(j => j.SceneCodeId == sceneCodeId)
            .ToListAsync(ct);
    }

    public async Task AddAsync(RenderJob job, CancellationToken ct = default)
    {
        _logger.LogInformation("[RenderJobRepo] Добавление: {JobId} (Scene: {SceneId}, Rev: #{Rev})",
            job.Id.Value, job.SceneCodeId.Value, job.TargetRevisionNumber.Value);
        await _context.RenderJobs.AddAsync(job, ct);
    }

    public Task UpdateAsync(RenderJob job, CancellationToken ct = default)
    {
        _logger.LogDebug("[RenderJobRepo] Обновление: {JobId} -> {Status} ({Pct}%)",
            job.Id.Value, job.Status, job.Progress.Percentage);
        _context.RenderJobs.Update(job);
        return Task.CompletedTask;
    }

    public async Task SaveChangesAsync(CancellationToken ct = default)
    {
        _logger.LogDebug("[RenderJobRepo] Фиксация изменений...");
        await _context.SaveChangesAsync(ct);
    }
}
