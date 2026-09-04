using System.Text.Json.Serialization;

namespace MediaContext.Domain;

/// <summary>
/// Происхождение ассета.
/// </summary>
[JsonConverter(typeof(JsonStringEnumConverter))]
public enum AssetSource
{
    UserUpload,
    StockPexels,
    YouTubeRip,
    GeneratedVoice,
    SystemCatalog
}
