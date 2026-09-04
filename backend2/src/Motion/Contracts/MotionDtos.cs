using System.Text.Json.Serialization;
using Kernel.Contracts;
using MotionContext.Domain;
using MotionContext.Domain.Entities;

namespace MotionContext.Contracts;

public sealed record SceneRevisionDto(
    [property: JsonPropertyName("revision_number")] int RevisionNumber,
    [property: JsonPropertyName("source_hash")] string SourceHash,
    [property: JsonPropertyName("origin")] RevisionOrigin Origin,
    [property: JsonPropertyName("created_at")] DateTimeOffset CreatedAt,
    [property: JsonPropertyName("source_code")] string? SourceCode = null);

public sealed record SceneCodeDto(
    [property: JsonPropertyName("id")] string Id,
    [property: JsonPropertyName("project_id")] string ProjectId,
    [property: JsonPropertyName("scene_id")] string SceneId,
    [property: JsonPropertyName("current_revision")] int CurrentRevision,
    [property: JsonPropertyName("width")] int Width,
    [property: JsonPropertyName("height")] int Height,
    [property: JsonPropertyName("fps")] int Fps,
    [property: JsonPropertyName("duration_in_frames")] int DurationInFrames,
    [property: JsonPropertyName("duration_seconds")] double DurationSeconds,
    [property: JsonPropertyName("required_capabilities")] IReadOnlyCollection<string> RequiredCapabilities,
    [property: JsonPropertyName("revisions")] IReadOnlyList<SceneRevisionDto> Revisions,
    [property: JsonPropertyName("current_code")] string CurrentCode);

public sealed record RenderJobDto(
    [property: JsonPropertyName("id")] string Id,
    [property: JsonPropertyName("scene_code_id")] string SceneCodeId,
    [property: JsonPropertyName("revision_number")] int RevisionNumber,
    [property: JsonPropertyName("status")] RenderJobStatus Status,
    [property: JsonPropertyName("rendered_frames")] int RenderedFrames,
    [property: JsonPropertyName("total_frames")] int TotalFrames,
    [property: JsonPropertyName("percentage")] double Percentage,
    [property: JsonPropertyName("fps")] double Fps,
    [property: JsonPropertyName("output_path")] string? OutputPath,
    [property: JsonPropertyName("error_message")] string? ErrorMessage,
    [property: JsonPropertyName("started_at")] DateTimeOffset? StartedAt,
    [property: JsonPropertyName("completed_at")] DateTimeOffset? CompletedAt);

public sealed record GenerateSceneCodeRequest(
    [property: JsonPropertyName("project_id")] string ProjectId,
    [property: JsonPropertyName("scene_id")] string SceneId,
    [property: JsonPropertyName("visual_description")] string VisualDescription,
    [property: JsonPropertyName("voice_text")] string VoiceText,
    [property: JsonPropertyName("duration_seconds")] double DurationSeconds,
    [property: JsonPropertyName("width")] int? Width,
    [property: JsonPropertyName("height")] int? Height,
    [property: JsonPropertyName("fps")] int? Fps,
    [property: JsonPropertyName("montage_settings")] MontageSettingsDto? MontageSettings,
    [property: JsonPropertyName("capabilities")] IReadOnlyList<string>? Capabilities);

public sealed record UpdateSceneCodeManualRequest(
    [property: JsonPropertyName("code")] string Code);

public sealed record RollbackSceneCodeRequest(
    [property: JsonPropertyName("target_revision")] int TargetRevision);

public sealed record StartRenderRequest(
    [property: JsonPropertyName("revision_number")] int? RevisionNumber,
    [property: JsonPropertyName("montage_settings")] MontageSettingsDto? MontageSettings);
