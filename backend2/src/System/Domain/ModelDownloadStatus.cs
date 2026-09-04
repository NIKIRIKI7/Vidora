using System.Text.Json.Serialization;

namespace SystemContext.Domain;

[JsonConverter(typeof(JsonStringEnumConverter))]
public enum ModelDownloadStatus
{
    NotDownloaded,
    Downloading,
    Ready,
    Failed
}
