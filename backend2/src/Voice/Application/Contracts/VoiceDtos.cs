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

public sealed record DuckedAudioResultDto(
    [property: JsonPropertyName("master_audio_path")] string MasterAudioPath,
    [property: JsonPropertyName("media_asset_id")] string MediaAssetId);
