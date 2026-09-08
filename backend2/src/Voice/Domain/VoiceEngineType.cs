using System.Text.Json.Serialization;

namespace Voice.Domain;

[JsonConverter(typeof(JsonStringEnumConverter))]
public enum VoiceEngineType
{
    CloudOpenAi = 1,
    CloudMiniMax = 2
}
