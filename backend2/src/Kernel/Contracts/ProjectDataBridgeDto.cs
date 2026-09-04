using System.Text.Json.Serialization;

namespace Kernel.Contracts;

public sealed record AppColorsDto
{
    [JsonPropertyName("primary")]
    public string Primary { get; init; } = "#000000";

    [JsonPropertyName("secondary")]
    public string Secondary { get; init; } = "#ffffff";

    [JsonPropertyName("background")]
    public string Background { get; init; } = "#121212";

    [JsonPropertyName("surface")]
    public string Surface { get; init; } = "#1e1e1e";

    [JsonPropertyName("accent")]
    public string Accent { get; init; } = "#ff5722";

    [JsonPropertyName("text")]
    public string Text { get; init; } = "#ffffff";
}

public sealed record MontageSettingsDto
{
    [JsonPropertyName("fps")]
    public int Fps { get; init; } = 30;

    [JsonPropertyName("width")]
    public int Width { get; init; } = 1920;

    [JsonPropertyName("height")]
    public int Height { get; init; } = 1080;

    [JsonPropertyName("animation_style")]
    public string AnimationStyle { get; init; } = "smooth";

    [JsonPropertyName("typography")]
    public string Typography { get; init; } = "Inter";

    [JsonPropertyName("colors")]
    public AppColorsDto Colors { get; init; } = new();
}

public sealed record FragmentTimingDto
{
    [JsonPropertyName("start")]
    public double Start { get; init; }

    [JsonPropertyName("end")]
    public double End { get; init; }
}

public sealed record SceneFragmentDto
{
    [JsonPropertyName("fragment_id")]
    public required string FragmentId { get; init; }

    [JsonPropertyName("visual_note")]
    public string VisualNote { get; init; } = string.Empty;

    [JsonPropertyName("text")]
    public string Text { get; init; } = string.Empty;

    [JsonPropertyName("timing")]
    public FragmentTimingDto? Timing { get; init; }

    [JsonPropertyName("voice_asset_id")]
    public string? VoiceAssetId { get; init; }

    [JsonPropertyName("broll_asset_id")]
    public string? BrollAssetId { get; init; }
}

public sealed record SceneDto
{
    [JsonPropertyName("scene_id")]
    public required string SceneId { get; init; }

    [JsonPropertyName("title")]
    public string Title { get; init; } = string.Empty;

    [JsonPropertyName("timecode")]
    public string Timecode { get; init; } = "00:00";

    [JsonPropertyName("fragments")]
    public IReadOnlyList<SceneFragmentDto> Fragments { get; init; } = [];
}

/// <summary>
/// Мост обратной совместимости (G3 / Phase 5):
/// Полный слепок проекта, который фронтенд пока пересылает в запросах целиком.
/// </summary>
public sealed record ProjectDataDto
{
    [JsonPropertyName("project_id")]
    public required string ProjectId { get; init; }

    [JsonPropertyName("slug")]
    public required string Slug { get; init; }

    [JsonPropertyName("project_path")]
    public string? ProjectPath { get; init; }

    [JsonPropertyName("montage")]
    public MontageSettingsDto Montage { get; init; } = new();

    [JsonPropertyName("scenes")]
    public IReadOnlyList<SceneDto> Scenes { get; init; } = [];
}
