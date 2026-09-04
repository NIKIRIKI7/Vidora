using System.Text.Json.Serialization;

namespace Voice.Domain.ValueObjects;

public sealed record AudioFilterSpec
{
    [JsonPropertyName("target_lufs")]
    public double TargetLufs { get; init; } = -14.0;

    [JsonPropertyName("remove_silence")]
    public bool RemoveSilence { get; init; } = true;

    [JsonPropertyName("silence_threshold_db")]
    public double SilenceThresholdDb { get; init; } = -42.0;

    [JsonPropertyName("highpass_hz")]
    public int HighpassHz { get; init; } = 80;
}
