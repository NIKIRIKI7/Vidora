using MotionContext.Domain.Entities;
using MotionContext.Domain.ValueObjects;

namespace MotionContext.Domain.Ports;

public interface IRenderJobRepository
{
    Task<RenderJob?> GetByIdAsync(RenderJobId id, CancellationToken ct = default);
    Task<RenderJob?> GetNextQueuedJobAsync(CancellationToken ct = default);
    Task<IReadOnlyList<RenderJob>> GetBySceneCodeIdAsync(SceneCodeId sceneCodeId, CancellationToken ct = default);
    Task AddAsync(RenderJob job, CancellationToken ct = default);
    Task UpdateAsync(RenderJob job, CancellationToken ct = default);
    Task SaveChangesAsync(CancellationToken ct = default);
}
