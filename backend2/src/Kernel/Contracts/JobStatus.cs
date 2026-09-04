using System.Text.Json.Serialization;

namespace Kernel.Contracts;

[JsonConverter(typeof(JsonStringEnumConverter))]
public enum JobStatus
{
    Queued,
    Processing,
    Done,
    Failed,
    Cancelled
}
