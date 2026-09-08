using System.Text.Json.Serialization;

namespace SystemContext.Domain;

[JsonConverter(typeof(JsonStringEnumConverter))]
public enum ModelTaskRole
{
    ScenarioDrafting,    // Сценарии и анализ тем
    SceneCodeGeneration, // Remotion TSX кодогенерация
    BRollMatching,       // Подбор B-Roll
    TtsVoice,            // Озвучка
    SttAlignment         // Whisper выравнивание
}