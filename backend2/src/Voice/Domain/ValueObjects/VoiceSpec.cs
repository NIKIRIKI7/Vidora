using System.Text.Json.Serialization;
using Kernel.Exceptions;

namespace Voice.Domain.ValueObjects;

public sealed record VoiceSpec
{
    [JsonPropertyName("engine")]
    public VoiceEngineType Engine { get; init; }

    [JsonPropertyName("speaker_id")]
    public string SpeakerId { get; init; }

    [JsonPropertyName("alignment_engine")]
    public AlignmentEngineType AlignmentEngine { get; init; } = AlignmentEngineType.Whisper;

    [JsonPropertyName("speed")]
    public double Speed { get; init; } = 1.0;

    [JsonPropertyName("pitch")]
    public double Pitch { get; init; } = 1.0;

    [JsonPropertyName("reference_audio_path")]
    public string? ReferenceAudioPath { get; init; }

    public VoiceSpec(
        VoiceEngineType engine,
        string speakerId,
        AlignmentEngineType alignmentEngine = AlignmentEngineType.Whisper,
        double speed = 1.0,
        double pitch = 1.0,
        string? referenceAudioPath = null)
    {
        if (string.IsNullOrWhiteSpace(speakerId))
        {
            throw new ValidationException("speaker_id", "Идентификатор диктора не может быть пустым.");
        }
        if (speed is < 0.2 or > 4.0)
        {
            throw new ValidationException("speed", "Скорость воспроизведения речи должна быть в пределах от 0.2 до 4.0.");
        }
        Engine = engine;
        SpeakerId = speakerId.Trim();
        AlignmentEngine = alignmentEngine;
        Speed = Math.Round(speed, 2);
        Pitch = Math.Round(pitch, 2);
        ReferenceAudioPath = referenceAudioPath?.Trim();
    }
}
