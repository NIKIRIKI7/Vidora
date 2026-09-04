using MotionContext.Domain.ValueObjects;

namespace MotionContext.Application.Commands;

public sealed record GenerateSceneCodeCommand(
    string ProjectId,
    string SceneId,
    string VisualDescription,
    string VoiceText,
    double DurationSeconds,
    int? Width,
    int? Height,
    int? Fps,
    MontageTheme? Theme,
    IReadOnlyList<string>? RequestedCapabilities);

public sealed record UpdateManualCodeCommand(
    string SceneCodeId,
    string RawCode);

public sealed record RollbackSceneCodeCommand(
    string SceneCodeId,
    int TargetRevision);

public sealed record StartRenderJobCommand(
    string SceneCodeId,
    int? TargetRevisionNumber,
    MontageTheme? Theme);

public sealed record CancelRenderJobCommand(
    string RenderJobId);
