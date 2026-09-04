using MotionContext.Domain.Entities;
using MotionContext.Domain.ValueObjects;

namespace MotionContext.Domain.Ports;

public interface ISceneCodeRepository
{
    Task<SceneCode?> GetByIdAsync(SceneCodeId id, CancellationToken ct = default);
    Task<SceneCode?> GetByProjectAndSceneAsync(string projectId, string sceneId, CancellationToken ct = default);
    Task<IReadOnlyList<SceneCode>> GetByProjectAsync(string projectId, CancellationToken ct = default);
    Task AddAsync(SceneCode sceneCode, CancellationToken ct = default);
    Task UpdateAsync(SceneCode sceneCode, CancellationToken ct = default);
    Task DeleteAsync(SceneCode sceneCode, CancellationToken ct = default);
    Task SaveChangesAsync(CancellationToken ct = default);
}
