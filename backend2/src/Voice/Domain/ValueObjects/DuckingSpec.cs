using System.Text.Json.Serialization;

namespace Voice.Domain.ValueObjects;

public sealed record DuckingSpec
{
    [JsonPropertyName("music_attenuation_db")]
    public double MusicAttenuationDb { get; init; } = -18.0;

    [JsonPropertyName("attack_ms")]
    public int AttackMs { get; init; } = 40;

    [JsonPropertyName("release_ms")]
    public int ReleaseMs { get; init; } = 350;

    /// <summary>Порог срабатывания компрессора громкости музыки (0..1, где 1 = полная амплитуда).</summary>
    [JsonPropertyName("threshold")]
    public double Threshold { get; init; } = 0.08;

    /// <summary>Коэффициент сжатия: во сколько раз давится музыка под голосом.</summary>
    [JsonPropertyName("compression_ratio")]
    public double CompressionRatio { get; init; } = 4.0;

    public string ThresholdInvariantText => Threshold.ToString("F3", System.Globalization.CultureInfo.InvariantCulture);
    public string CompressionRatioInvariantText => CompressionRatio.ToString("F1", System.Globalization.CultureInfo.InvariantCulture);
}
