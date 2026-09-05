using System.Text.Json.Serialization;
using Kernel.Exceptions;

namespace Voice.Domain.ValueObjects;

public sealed record VoiceDesignSpec
{
    [JsonPropertyName("description")]
    public string Description { get; init; } = string.Empty;

    [JsonPropertyName("language")]
    public string Language { get; init; } = string.Empty;

    [JsonPropertyName("gender")]
    public string? Gender { get; init; }

    [JsonPropertyName("age_range")]
    public string? AgeRange { get; init; }

    [JsonPropertyName("accent")]
    public string? Accent { get; init; }

    [JsonPropertyName("emotion")]
    public string? Emotion { get; init; }

    [JsonPropertyName("style")]
    public string? Style { get; init; }

    [JsonPropertyName("speed")]
    public double Speed { get; init; } = 1.0;

    public VoiceDesignSpec(
        string description,
        string language,
        string? gender = null,
        string? ageRange = null,
        string? accent = null,
        string? emotion = null,
        string? style = null,
        double speed = 1.0)
    {
        if (string.IsNullOrWhiteSpace(description))
            throw new ValidationException("description", "Описание голоса обязательно.");
        if (description.Length > 500)
            throw new ValidationException("description", "Описание голоса не может превышать 500 знаков.");
        if (string.IsNullOrWhiteSpace(language))
            throw new ValidationException("language", "Язык голоса обязателен.");
        if (speed is < 0.5 or > 2.0)
            throw new ValidationException("speed", "Скорость должна быть от 0.5 до 2.0.");

        Description = description.Trim();
        Language = language.Trim();
        Gender = gender?.Trim();
        AgeRange = ageRange?.Trim();
        Accent = accent?.Trim();
        Emotion = emotion?.Trim();
        Style = style?.Trim();
        Speed = Math.Round(speed, 2);
    }
}
