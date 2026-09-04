using System.Text.Json.Serialization;

namespace Voice.Domain;

[JsonConverter(typeof(JsonStringEnumConverter))]
public enum VoiceEngineType
{
    LocalOmniVoice,
    LocalCosyVoice,
    LocalFishAudio,
    CloudOpenAi,
    CloudMiniMax
}
