using Kernel.Ports;
using MotionContext.Domain.ValueObjects;

namespace MotionContext.Domain.Ports;

public interface IScenePromptComposer
{
    Task<LlmPromptSpec> ComposePromptSpecAsync(
        string projectId,
        string sceneId,
        string visualDescription,
        string voiceText,
        CompositionConfig composition,
        MontageTheme theme,
        IReadOnlyList<string> activeCapabilities,
        CancellationToken ct = default);
}
