using Voice.Domain.ValueObjects;

namespace Voice.Domain.Ports;

public sealed record EngineReadiness(
    bool IsReady,
    string? Reason = null,
    string? MissingPrerequisite = null)
{
    public static EngineReadiness Ready() => new(true);
    public static EngineReadiness NotReady(string reason, string? prerequisite = null)
        => new(false, reason, prerequisite);
}

public interface IVoiceEngineDescriptor
{
    string EngineId { get; }
    string DisplayName { get; }
    string Mode { get; }
    VoiceCapabilities Capabilities { get; }
    string Description { get; }
    Task<EngineReadiness> ProbeReadinessAsync(CancellationToken ct = default);
}
