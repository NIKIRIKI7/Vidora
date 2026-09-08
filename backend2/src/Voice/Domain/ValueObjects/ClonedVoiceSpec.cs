using System.Text.Json.Serialization;
using Kernel.Exceptions;

namespace Voice.Domain.ValueObjects;

public sealed record ClonedVoiceSpec
{
    [JsonPropertyName("source_engine")]
    public VoiceEngineType SourceEngine { get; init; }

    [JsonPropertyName("reference_audio_path")]
    public string ReferenceAudioPath { get; init; } = string.Empty;

    [JsonPropertyName("reference_text")]
    public string? ReferenceText { get; init; }

    [JsonPropertyName("name")]
    public string Name { get; init; } = string.Empty;

    [JsonPropertyName("language")]
    public string? Language { get; init; }

    // Идентификатор конкретной модели локального ML-воркера (например 'omni_voice_v1')
    [JsonPropertyName("local_engine_id")]
    public string? LocalEngineId { get; init; }

    public ClonedVoiceSpec(
        VoiceEngineType sourceEngine,
        string referenceAudioPath,
        string name,
        string? referenceText = null,
        string? language = null,
        string? localEngineId = null)
    {
        if (string.IsNullOrWhiteSpace(referenceAudioPath))
            throw new ValidationException("reference_audio_path", "Путь к эталонному аудио обязателен.");
        if (string.IsNullOrWhiteSpace(name))
            throw new ValidationException("name", "Имя клонированного голоса обязательно.");
        if (name.Length > 100)
            throw new ValidationException("name", "Имя клонированного голоса не может превышать 100 знаков.");

        SourceEngine = sourceEngine;
        ReferenceAudioPath = referenceAudioPath.Trim();
        Name = name.Trim();
        ReferenceText = referenceText?.Trim();
        Language = language?.Trim();
        LocalEngineId = localEngineId?.Trim();
    }
}
