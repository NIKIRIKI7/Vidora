using System.Text.Json.Serialization;
using Voice.Domain;
using Voice.Domain.Entities;
using Voice.Domain.ValueObjects;

namespace Voice.Application.Contracts;

public sealed record VoiceJobDto
{
    [JsonPropertyName("id")]
    public required string Id { get; init; }

    [JsonPropertyName("text")]
    public required string Text { get; init; }

    [JsonPropertyName("status")]
    public TtsJobStatus Status { get; init; }

    [JsonPropertyName("engine")]
    public VoiceEngineType Engine { get; init; }

    [JsonPropertyName("speaker_id")]
    public required string SpeakerId { get; init; }

    [JsonPropertyName("audio_path")]
    public string? AudioPath { get; init; }

    [JsonPropertyName("media_asset_id")]
    public string? MediaAssetId { get; init; }

    [JsonPropertyName("duration_seconds")]
    public double? DurationSeconds { get; init; }

    [JsonPropertyName("alignment_engine")]
    public string AlignmentEngine { get; init; } = "None";

    [JsonPropertyName("words")]
    public IReadOnlyList<TimedWord> Words { get; init; } = [];

    [JsonPropertyName("error")]
    public string? Error { get; init; }

    public static VoiceJobDto FromEntity(TtsJob job) => new()
    {
        Id = job.Id.Value,
        Text = job.Text,
        Status = job.Status,
        Engine = job.Spec.Engine,
        SpeakerId = job.Spec.SpeakerId,
        AudioPath = job.ProcessedAudioPath ?? job.RawAudioPath,
        MediaAssetId = job.RegisteredMediaAssetId,
        DurationSeconds = job.DurationSeconds,
        AlignmentEngine = job.Alignment.AlignmentEngine,
        Words = job.Alignment.Words,
        Error = job.ErrorMessage
    };
}

public sealed record BatchVoiceResultDto(
    [property: JsonPropertyName("batch_id")] string BatchId,
    [property: JsonPropertyName("jobs")] IReadOnlyList<VoiceJobDto> Jobs,
    [property: JsonPropertyName("total_duration_seconds")] double TotalDurationSeconds);

public sealed record VoiceSpeakerDto(
    [property: JsonPropertyName("id")] string Id,
    [property: JsonPropertyName("name")] string Name,
    [property: JsonPropertyName("engine")] VoiceEngineType Engine,
    [property: JsonPropertyName("language")] string Language,
    [property: JsonPropertyName("gender")] string Gender);

public sealed record SpeakerProfileDto
{
    [JsonPropertyName("id")]
    public required string Id { get; init; }

    [JsonPropertyName("speaker_id")]
    public required string SpeakerId { get; init; }

    [JsonPropertyName("name")]
    public required string Name { get; init; }

    [JsonPropertyName("description")]
    public string? Description { get; init; }

    [JsonPropertyName("source_type")]
    public string SourceType { get; init; } = "BuiltIn";

    [JsonPropertyName("engine")]
    public VoiceEngineType Engine { get; init; }

    [JsonPropertyName("language")]
    public required string Language { get; init; }

    [JsonPropertyName("gender")]
    public string? Gender { get; init; }

    [JsonPropertyName("is_default")]
    public bool IsDefault { get; init; }

    [JsonPropertyName("is_active")]
    public bool IsActive { get; init; }

    [JsonPropertyName("preview_audio_path")]
    public string? PreviewAudioPath { get; init; }

    public static SpeakerProfileDto FromEntity(Voice.Domain.Entities.SpeakerProfile p) => new()
    {
        Id = p.Id,
        SpeakerId = p.SpeakerId.Value,
        Name = p.Name,
        Description = p.Description,
        SourceType = p.SourceType.ToString(),
        Engine = p.Engine,
        Language = p.Language,
        Gender = p.Gender,
        IsDefault = p.IsDefault,
        IsActive = p.IsActive,
        PreviewAudioPath = p.PreviewAudioPath
    };
}

public sealed record DesignSpeakerRequest(
    [property: JsonPropertyName("description")] string Description,
    [property: JsonPropertyName("language")] string Language,
    [property: JsonPropertyName("gender")] string? Gender,
    [property: JsonPropertyName("age_range")] string? AgeRange,
    [property: JsonPropertyName("accent")] string? Accent,
    [property: JsonPropertyName("emotion")] string? Emotion,
    [property: JsonPropertyName("style")] string? Style,
    [property: JsonPropertyName("speed")] double Speed = 1.0);

public sealed record CloneSpeakerRequest(
    [property: JsonPropertyName("name")] string Name,
    [property: JsonPropertyName("engine")] VoiceEngineType Engine,
    [property: JsonPropertyName("reference_text")] string? ReferenceText,
    [property: JsonPropertyName("language")] string? Language);

public sealed record UpdateSpeakerRequest(
    [property: JsonPropertyName("name")] string Name);

public sealed record GeneratePreviewRequest(
    [property: JsonPropertyName("text")] string Text,
    [property: JsonPropertyName("speed")] double Speed = 1.0);

public sealed record DuckedAudioResultDto(
    [property: JsonPropertyName("master_audio_path")] string MasterAudioPath,
    [property: JsonPropertyName("media_asset_id")] string MediaAssetId);

public sealed record AlignSpeechItemDto(
    [property: JsonPropertyName("id")] string Id,
    [property: JsonPropertyName("text")] string Text);

public sealed record AlignSpeechRequest(
    [property: JsonPropertyName("audio_path")] string AudioPath,
    [property: JsonPropertyName("fragments")] IReadOnlyList<AlignSpeechItemDto> Fragments);

public sealed record FragmentTimingResultDto(
    [property: JsonPropertyName("id")] string Id,
    [property: JsonPropertyName("startTime")] double StartTime,
    [property: JsonPropertyName("endTime")] double EndTime);

public sealed record AlignSpeechResponse(
    [property: JsonPropertyName("status")] string Status,
    [property: JsonPropertyName("fragments_timings")] IReadOnlyList<FragmentTimingResultDto> FragmentsTimings,
    [property: JsonPropertyName("fallback")] bool Fallback);

public sealed record TranscribeAudioRequest(
    [property: JsonPropertyName("audio_path")] string AudioPath);

public sealed record TranscribeAudioResponse(
    [property: JsonPropertyName("status")] string Status,
    [property: JsonPropertyName("text")] string Text);

public sealed record ProcessAudioDspRequest(
    [property: JsonPropertyName("audio_path")] string AudioPath,
    [property: JsonPropertyName("action")] string Action,
    [property: JsonPropertyName("threshold_db")] double? ThresholdDb,
    [property: JsonPropertyName("min_silence_ms")] int? MinSilenceMs,
    [property: JsonPropertyName("max_silence_ms")] int? MaxSilenceMs);

public sealed record ProcessAudioDspResponse(
    [property: JsonPropertyName("status")] string Status,
    [property: JsonPropertyName("processed_audio_path")] string ProcessedAudioPath,
    [property: JsonPropertyName("new_duration_sec")] double NewDurationSec);

public sealed record ConcatAudioRequest(
    [property: JsonPropertyName("audio_paths")] IReadOnlyList<string> AudioPaths,
    [property: JsonPropertyName("output_path")] string OutputPath);
