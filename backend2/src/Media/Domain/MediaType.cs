using System.Text.Json.Serialization;

namespace MediaContext.Domain;

/// <summary>
/// Тип медиа-ассета в пайплайне монтажа.
/// </summary>
[JsonConverter(typeof(JsonStringEnumConverter))]
public enum MediaType
{
    Video,
    Audio,
    Image
}
