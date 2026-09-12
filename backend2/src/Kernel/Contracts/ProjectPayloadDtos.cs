using System.Text.Json.Serialization;

namespace Kernel.Contracts;

// ─────────────────────────────────────────────────────────────────────────────
// Фоновые музыка / ducking (зеркало frontend BackgroundMusicSettings).
// ─────────────────────────────────────────────────────────────────────────────

public sealed record MusicEqSettingsDto
{
    [JsonPropertyName("enableLowCut")] public bool? EnableLowCut { get; init; }
    [JsonPropertyName("lowCutFreqHz")] public double? LowCutFreqHz { get; init; }
    [JsonPropertyName("enableMidCarve")] public bool? EnableMidCarve { get; init; }
    [JsonPropertyName("midCarveFreqHz")] public double? MidCarveFreqHz { get; init; }
    [JsonPropertyName("midCarveGainDb")] public double? MidCarveGainDb { get; init; }
}

public sealed record BackgroundMusicSettingsDto
{
    [JsonPropertyName("enabled")] public bool? Enabled { get; init; }
    [JsonPropertyName("trackId")] public string? TrackId { get; init; }
    [JsonPropertyName("trackName")] public string? TrackName { get; init; }
    [JsonPropertyName("customTrackPath")] public string? CustomTrackPath { get; init; }
    [JsonPropertyName("preset")] public string? Preset { get; init; }
    [JsonPropertyName("baseVolume")] public double? BaseVolume { get; init; }
    [JsonPropertyName("duckedVolume")] public double? DuckedVolume { get; init; }
    [JsonPropertyName("threshold")] public double? Threshold { get; init; }
    [JsonPropertyName("attackMs")] public double? AttackMs { get; init; }
    [JsonPropertyName("releaseMs")] public double? ReleaseMs { get; init; }
    [JsonPropertyName("holdMs")] public double? HoldMs { get; init; }
    [JsonPropertyName("fadeInSec")] public double? FadeInSec { get; init; }
    [JsonPropertyName("fadeOutSec")] public double? FadeOutSec { get; init; }
    [JsonPropertyName("loop")] public bool? Loop { get; init; }
    [JsonPropertyName("loopCrossfadeSec")] public double? LoopCrossfadeSec { get; init; }
    [JsonPropertyName("eq")] public MusicEqSettingsDto? Eq { get; init; }
}

// ─────────────────────────────────────────────────────────────────────────────
// Полный слепок проекта, который фронтенд пересылает в /code/generate и /render/start.
// Все поля опциональны: это сквозной payload, который бэкенд пока не читает,
// но Swagger/openapi-typescript должны отдавать именованную схему, а не unknown.
// ─────────────────────────────────────────────────────────────────────────────

public sealed record ProjectMetadataPayloadDto
{
    [JsonPropertyName("title")] public string? Title { get; init; }
    [JsonPropertyName("description")] public string? Description { get; init; }
    [JsonPropertyName("tags")] public IReadOnlyList<string>? Tags { get; init; }
    [JsonPropertyName("thumbnail")] public string? Thumbnail { get; init; }
}

public sealed record TypographyPayloadDto
{
    [JsonPropertyName("heading")] public string? Heading { get; init; }
    [JsonPropertyName("body")] public string? Body { get; init; }
}

public sealed record ProjectMontagePayloadDto
{
    [JsonPropertyName("fps")] public string? Fps { get; init; }
    [JsonPropertyName("animationStyle")] public string? AnimationStyle { get; init; }
    [JsonPropertyName("transitions")] public IReadOnlyList<string>? Transitions { get; init; }
    [JsonPropertyName("colors")] public AppColorsDto? Colors { get; init; }
    [JsonPropertyName("typography")] public TypographyPayloadDto? Typography { get; init; }
}

public sealed record SceneFragmentPayloadDto
{
    [JsonPropertyName("id")] public string? Id { get; init; }
    [JsonPropertyName("visualNote")] public string? VisualNote { get; init; }
    [JsonPropertyName("text")] public string? Text { get; init; }
    [JsonPropertyName("startTime")] public double? StartTime { get; init; }
    [JsonPropertyName("endTime")] public double? EndTime { get; init; }
    [JsonPropertyName("remotionCode")] public string? RemotionCode { get; init; }
    [JsonPropertyName("audioFileName")] public string? AudioFileName { get; init; }
    [JsonPropertyName("bRollFileName")] public string? BRollFileName { get; init; }
    [JsonPropertyName("bRollAudioMode")] public string? BRollAudioMode { get; init; }
    [JsonPropertyName("lastAudioHash")] public string? LastAudioHash { get; init; }
    [JsonPropertyName("lastAudioTextNormalized")] public string? LastAudioTextNormalized { get; init; }
}

public sealed record ScenePayloadDto
{
    [JsonPropertyName("id")] public string? Id { get; init; }
    [JsonPropertyName("title")] public string? Title { get; init; }
    [JsonPropertyName("timecode")] public string? Timecode { get; init; }
    [JsonPropertyName("fragments")] public IReadOnlyList<SceneFragmentPayloadDto>? Fragments { get; init; }
    [JsonPropertyName("remotionCode")] public string? RemotionCode { get; init; }
    [JsonPropertyName("ignoreTsx")] public bool? IgnoreTsx { get; init; }
    [JsonPropertyName("remotionCodeHistory")] public IReadOnlyList<string>? RemotionCodeHistory { get; init; }
    [JsonPropertyName("historyIndex")] public int? HistoryIndex { get; init; }
    [JsonPropertyName("lastCodeHash")] public string? LastCodeHash { get; init; }
    [JsonPropertyName("audioOffset")] public double? AudioOffset { get; init; }
}

public sealed record CustomVoicePayloadDto
{
    [JsonPropertyName("id")] public string? Id { get; init; }
    [JsonPropertyName("name")] public string? Name { get; init; }
    [JsonPropertyName("refAudioPath")] public string? RefAudioPath { get; init; }
    [JsonPropertyName("refText")] public string? RefText { get; init; }
    [JsonPropertyName("designPrompt")] public string? DesignPrompt { get; init; }
    [JsonPropertyName("tags")] public IReadOnlyList<string>? Tags { get; init; }
}

public sealed record AudioProcessingSettingsDto
{
    [JsonPropertyName("silenceThresholdDb")] public double? SilenceThresholdDb { get; init; }
    [JsonPropertyName("minSilenceMs")] public int? MinSilenceMs { get; init; }
    [JsonPropertyName("maxSilenceMs")] public int? MaxSilenceMs { get; init; }
    [JsonPropertyName("removeEdges")] public bool? RemoveEdges { get; init; }
}

public sealed record ProjectDataPayloadDto
{
    [JsonPropertyName("name")] public string? Name { get; init; }
    [JsonPropertyName("format")] public string? Format { get; init; }
    [JsonPropertyName("resolution")] public string? Resolution { get; init; }
    [JsonPropertyName("metadata")] public ProjectMetadataPayloadDto? Metadata { get; init; }
    [JsonPropertyName("montage")] public ProjectMontagePayloadDto? Montage { get; init; }
    [JsonPropertyName("scenes")] public IReadOnlyList<ScenePayloadDto>? Scenes { get; init; }
    [JsonPropertyName("customVoices")] public IReadOnlyList<CustomVoicePayloadDto>? CustomVoices { get; init; }
    [JsonPropertyName("rawMarkdown")] public string? RawMarkdown { get; init; }
    [JsonPropertyName("audioMode")] public string? AudioMode { get; init; }
    [JsonPropertyName("backendProjectId")] public string? BackendProjectId { get; init; }
    [JsonPropertyName("audioProcessing")] public AudioProcessingSettingsDto? AudioProcessing { get; init; }
    [JsonPropertyName("backgroundMusic")] public BackgroundMusicSettingsDto? BackgroundMusic { get; init; }
    [JsonPropertyName("renderQuality")] public string? RenderQuality { get; init; }
    [JsonPropertyName("use3D")] public bool? Use3D { get; init; }
    [JsonPropertyName("autoBRollEnabled")] public bool? AutoBRollEnabled { get; init; }
}
