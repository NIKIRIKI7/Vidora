using System.Text.Json.Serialization;

namespace Voice.Domain;

[JsonConverter(typeof(JsonStringEnumConverter))]
public enum TtsJobStatus
{
    Queued,
    Synthesizing,
    Aligning,
    ProcessingAudio,
    Ready,
    Failed
}
