using System.Text.Json.Serialization;

namespace MotionContext.Domain;

[JsonConverter(typeof(JsonStringEnumConverter))]
public enum RenderJobStatus
{
    Queued,
    Rendering,
    Muxing,
    Done,
    Failed,
    Cancelled
}
