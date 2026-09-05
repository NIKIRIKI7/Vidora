using System.Text.Json.Serialization;

namespace Voice.Domain;

[JsonConverter(typeof(JsonStringEnumConverter))]
public enum SpeakerSourceType
{
    BuiltIn,
    Designed,
    Cloned
}
