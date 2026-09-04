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
}
