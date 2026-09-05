using System.Text.Json.Serialization;
using Kernel.Contracts;
using ProductionContext.Domain;

namespace ProductionContext.Contracts;

public sealed record ProjectSummaryDto(
    [property: JsonPropertyName("id")] string Id,
    [property: JsonPropertyName("title")] string Title,
    [property: JsonPropertyName("slug")] string Slug,
    [property: JsonPropertyName("status")] ProjectStatus Status,
    [property: JsonPropertyName("current_step")] PipelineStep CurrentStep,
    [property: JsonPropertyName("scenes_count")] int ScenesCount,
    [property: JsonPropertyName("total_duration_seconds")] double TotalDurationSeconds,
    [property: JsonPropertyName("final_video_path")] string? FinalVideoPath,
    [property: JsonPropertyName("created_at")] DateTimeOffset CreatedAt,
    [property: JsonPropertyName("updated_at")] DateTimeOffset UpdatedAt);

public sealed record SceneFragmentDetailsDto(
    [property: JsonPropertyName("id")] string Id,
    [property: JsonPropertyName("fragment_id")] string FragmentId,
    [property: JsonPropertyName("index")] int Index,
    [property: JsonPropertyName("text")] string Text,
    [property: JsonPropertyName("visual_note")] string VisualNote,
    [property: JsonPropertyName("start_seconds")] double StartSeconds,
    [property: JsonPropertyName("end_seconds")] double EndSeconds,
    [property: JsonPropertyName("duration_seconds")] double DurationSeconds,
    [property: JsonPropertyName("voice_asset_id")] string? VoiceAssetId,
    [property: JsonPropertyName("broll_asset_id")] string? BrollAssetId);

public sealed record SceneDetailsDto(
    [property: JsonPropertyName("id")] string Id,
    [property: JsonPropertyName("scene_id")] string SceneId,
    [property: JsonPropertyName("index")] int Index,
    [property: JsonPropertyName("title")] string Title,
    [property: JsonPropertyName("visual_note")] string VisualNote,
    [property: JsonPropertyName("start_seconds")] double StartSeconds,
    [property: JsonPropertyName("end_seconds")] double EndSeconds,
    [property: JsonPropertyName("duration_seconds")] double DurationSeconds,
    [property: JsonPropertyName("scene_code_id")] string? SceneCodeId,
    [property: JsonPropertyName("rendered_video_asset_id")] string? RenderedVideoAssetId,
    [property: JsonPropertyName("fragments")] IReadOnlyList<SceneFragmentDetailsDto> Fragments);

public sealed record ProjectDetailsDto(
    [property: JsonPropertyName("id")] string Id,
    [property: JsonPropertyName("title")] string Title,
    [property: JsonPropertyName("slug")] string Slug,
    [property: JsonPropertyName("relative_path")] string RelativePath,
    [property: JsonPropertyName("status")] ProjectStatus Status,
    [property: JsonPropertyName("current_step")] PipelineStep CurrentStep,
    [property: JsonPropertyName("montage")] MontageSettingsDto Montage,
    [property: JsonPropertyName("total_duration_seconds")] double TotalDurationSeconds,
    [property: JsonPropertyName("final_video_path")] string? FinalVideoPath,
    [property: JsonPropertyName("final_file_size_bytes")] long? FinalFileSizeBytes,
    [property: JsonPropertyName("error_message")] string? ErrorMessage,
    [property: JsonPropertyName("scenes")] IReadOnlyList<SceneDetailsDto> Scenes,
    [property: JsonPropertyName("created_at")] DateTimeOffset CreatedAt,
    [property: JsonPropertyName("updated_at")] DateTimeOffset UpdatedAt);

public sealed record CreateProjectRequest(
    [property: JsonPropertyName("title")] string Title,
    [property: JsonPropertyName("slug")] string? Slug = null,
    [property: JsonPropertyName("montage")] MontageSettingsDto? Montage = null);

public sealed record ParseScenarioRequest(
    [property: JsonPropertyName("markdown_content")] string MarkdownContent);

public sealed record UpdateSceneRequest(
    [property: JsonPropertyName("title")] string? Title,
    [property: JsonPropertyName("visual_note")] string? VisualNote);

public sealed record BuildProjectRequest(
    [property: JsonPropertyName("speaker_id")] string? SpeakerId = "alloy",
    [property: JsonPropertyName("bgm_asset_id")] string? BgmAssetId = null,
    [property: JsonPropertyName("force_rerender")] bool ForceRerender = false);

public sealed record BuildStatusDto(
    [property: JsonPropertyName("project_id")] string ProjectId,
    [property: JsonPropertyName("status")] ProjectStatus Status,
    [property: JsonPropertyName("current_step")] PipelineStep CurrentStep,
    [property: JsonPropertyName("error_message")] string? ErrorMessage,
    [property: JsonPropertyName("final_video_path")] string? FinalVideoPath);
