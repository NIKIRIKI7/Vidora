using Kernel.Contracts;
using MotionContext.Domain.Entities;
using MotionContext.Domain.ValueObjects;

namespace MotionContext.Domain.Ports;

public sealed record WorkspaceMount(
    string WorkspaceDirectory,
    string EntryPointTsx,
    string InputPropsPath,
    string OutputVideoPath);

public interface IRemotionWorkspaceManager
{
    Task<WorkspaceMount> PrepareWorkspaceAsync(
        SceneCode sceneCode,
        SceneRevision revision,
        RenderJobId jobId,
        MontageSettingsDto? montageSettings = null,
        CancellationToken ct = default);

    Task CleanupWorkspaceAsync(string workspaceDirectory, CancellationToken ct = default);
}
