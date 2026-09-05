using System.Text.Json.Serialization;

namespace ProductionContext.Domain;

[JsonConverter(typeof(JsonStringEnumConverter))]
public enum ProjectStatus
{
    Draft,
    Configured,
    Processing,
    Ready,
    Failed,
    Cancelled
}
