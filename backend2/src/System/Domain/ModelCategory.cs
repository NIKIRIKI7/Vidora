using System.Text.Json.Serialization;

namespace SystemContext.Domain;

[JsonConverter(typeof(JsonStringEnumConverter))]
public enum ModelCategory
{
    Stt,
    Tts,
    Llm,
    Chromium,
    Vision
}
