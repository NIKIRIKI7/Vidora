using System.Text.Json.Serialization;

namespace Voice.Domain.ValueObjects;

[Flags]
[JsonConverter(typeof(JsonStringEnumConverter))]
public enum VoiceCapabilities
{
    None = 0,
    Synthesis = 1 << 0,
    Clone = 1 << 1,
    Design = 1 << 2,
    Streaming = 1 << 3
}
