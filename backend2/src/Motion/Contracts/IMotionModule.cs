using MotionContext.Domain.ValueObjects;

namespace MotionContext.Contracts;

public interface IMotionModule
{
    Task<SceneCodeDto> GetSceneCodeAsync(string sceneCodeId, CancellationToken ct = default);
    Task<SceneCodeDto?> FindSceneCodeBySceneAsync(string projectId, string sceneId, CancellationToken ct = default);
    Task<SceneRevisionDto> GetRevisionAsync(string sceneCodeId, int revisionNumber, CancellationToken ct = default);
    Task<SceneCodeDto> GenerateSceneCodeAsync(GenerateSceneCodeRequest request, CancellationToken ct = default);
    Task<SceneCodeDto> UpdateManualCodeAsync(string sceneCodeId, UpdateSceneCodeManualRequest request, CancellationToken ct = default);
    Task<SceneCodeDto> RollbackRevisionAsync(string sceneCodeId, RollbackSceneCodeRequest request, CancellationToken ct = default);

    Task<RenderJobDto> StartRenderAsync(string sceneCodeId, StartRenderRequest request, CancellationToken ct = default);
    Task<RenderJobDto> GetRenderStatusAsync(string renderJobId, CancellationToken ct = default);
    Task CancelRenderAsync(string renderJobId, CancellationToken ct = default);
    Task<IReadOnlyList<string>> GetAvailableCapabilitiesAsync(CancellationToken ct = default);
}
