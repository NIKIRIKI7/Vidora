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

    [JsonPropertyName("guidance_scale")]
    public double GuidanceScale { get; init; } = 2.0;

    [JsonPropertyName("num_steps")]
    public int NumSteps { get; init; } = 24;

    [JsonPropertyName("reference_audio_path")]
    public string? ReferenceAudioPath { get; init; }

    [JsonPropertyName("reference_text")]
    public string? ReferenceText { get; init; }

    // Данные локального ML-воркера (заполняются из профиля диктора для LocalTts)
    [JsonPropertyName("local_engine_id")]
    public string? LocalEngineId { get; init; }

    [JsonPropertyName("local_embedding_path")]
    public string? LocalEmbeddingPath { get; init; }

    // Voice Design: instruct-промпт (взаимоисключающ с LocalEmbeddingPath)
    [JsonPropertyName("instruct_prompt")]
    public string? InstructPrompt { get; init; }

    // Advanced Settings (тонкие настройки диффузии локального воркера)
    [JsonPropertyName("denoise")]
    public bool Denoise { get; init; } = true;

    [JsonPropertyName("duration")]
    public double Duration { get; init; } = 0.0;

    [JsonPropertyName("preprocess_prompt")]
    public bool PreprocessPrompt { get; init; } = true;

    [JsonPropertyName("postprocess_output")]
    public bool PostprocessOutput { get; init; } = true;

    public VoiceSpec(
        VoiceEngineType engine,
        string speakerId,
        AlignmentEngineType alignmentEngine = AlignmentEngineType.Whisper,
        double speed = 1.0,
        double pitch = 1.0,
        string? referenceAudioPath = null,
        double guidanceScale = 2.0,
        int numSteps = 24,
        bool denoise = true,
        double duration = 0.0,
        bool preprocessPrompt = true,
        bool postprocessOutput = true,
        string? referenceText = null)
    {
        if (string.IsNullOrWhiteSpace(speakerId))
        {
            throw new ValidationException("speaker_id", "Идентификатор диктора не может быть пустым.");
        }
        if (speed is < 0.2 or > 4.0)
        {
            throw new ValidationException("speed", "Скорость воспроизведения речи должна быть в пределах от 0.2 до 4.0.");
        }
        if (pitch is < 0.5 or > 2.0)
        {
            throw new ValidationException("pitch", "Высота тона должна быть в пределах от 0.5 до 2.0.");
        }
        if (guidanceScale is < 1.0 or > 10.0)
        {
            throw new ValidationException("guidance_scale", "Guidance Scale (CFG) должен быть в пределах от 1.0 до 10.0.");
        }
        if (numSteps is < 8 or > 128)
        {
            throw new ValidationException("num_steps", "Количество шагов диффузии должно быть в пределах от 8 до 128.");
        }
        if (duration < 0.0)
        {
            throw new ValidationException("duration", "Длительность не может быть отрицательной.");
        }

        Engine = engine;
        SpeakerId = speakerId.Trim();
        AlignmentEngine = alignmentEngine;
        Speed = Math.Round(speed, 2);
        Pitch = Math.Round(pitch, 2);
        GuidanceScale = Math.Round(guidanceScale, 2);
        NumSteps = numSteps;
        Denoise = denoise;
        Duration = duration;
        PreprocessPrompt = preprocessPrompt;
        PostprocessOutput = postprocessOutput;
        ReferenceAudioPath = referenceAudioPath?.Trim();
        ReferenceText = referenceText?.Trim();
    }
}
