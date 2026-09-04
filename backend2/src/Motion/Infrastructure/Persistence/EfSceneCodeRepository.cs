using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using MotionContext.Domain.Entities;
using MotionContext.Domain.Ports;
using MotionContext.Domain.ValueObjects;

namespace MotionContext.Infrastructure.Persistence;

public sealed class EfSceneCodeRepository : ISceneCodeRepository
{
    private readonly MotionDbContext _context;
    private readonly ILogger<EfSceneCodeRepository> _logger;

    public EfSceneCodeRepository(MotionDbContext context, ILogger<EfSceneCodeRepository> logger)
    {
        _context = context;
        _logger = logger;
    }

    public async Task<SceneCode?> GetByIdAsync(SceneCodeId id, CancellationToken ct = default)
    {
        _logger.LogDebug("[SceneCodeRepo] Запрос по ID: {Id}", id.Value);
        return await _context.SceneCodes
            .Include(s => s.Revisions)
            .FirstOrDefaultAsync(s => s.Id == id, ct);
    }

    public async Task<SceneCode?> GetByProjectAndSceneAsync(string projectId, string sceneId, CancellationToken ct = default)
    {
        _logger.LogDebug("[SceneCodeRepo] Поиск Project: {Project}, Scene: {Scene}", projectId, sceneId);
        return await _context.SceneCodes
            .Include(s => s.Revisions)
            .FirstOrDefaultAsync(s => s.ProjectId == projectId && s.SceneId == sceneId, ct);
    }

    public async Task<IReadOnlyList<SceneCode>> GetByProjectAsync(string projectId, CancellationToken ct = default)
    {
        _logger.LogDebug("[SceneCodeRepo] Выборка сцен проекта: {Project}", projectId);
        return await _context.SceneCodes
            .Include(s => s.Revisions)
            .Where(s => s.ProjectId == projectId)
            .OrderBy(s => s.SceneId)
            .ToListAsync(ct);
    }

    public async Task AddAsync(SceneCode sceneCode, CancellationToken ct = default)
    {
        _logger.LogInformation("[SceneCodeRepo] Добавление: {Id} ({Project}/{Scene})",
            sceneCode.Id.Value, sceneCode.ProjectId, sceneCode.SceneId);
        await _context.SceneCodes.AddAsync(sceneCode, ct);
    }

    public Task UpdateAsync(SceneCode sceneCode, CancellationToken ct = default)
    {
        _logger.LogDebug("[SceneCodeRepo] Обновление: {Id} (Rev #{Rev})",
            sceneCode.Id.Value, sceneCode.CurrentRevisionNumber.Value);
        _context.SceneCodes.Update(sceneCode);
        return Task.CompletedTask;
    }

    public Task DeleteAsync(SceneCode sceneCode, CancellationToken ct = default)
    {
        _logger.LogInformation("[SceneCodeRepo] Удаление: {Id}", sceneCode.Id.Value);
        _context.SceneCodes.Remove(sceneCode);
        return Task.CompletedTask;
    }

    public async Task SaveChangesAsync(CancellationToken ct = default)
    {
        _logger.LogDebug("[SceneCodeRepo] Фиксация изменений...");
        await _context.SaveChangesAsync(ct);
    }
}
