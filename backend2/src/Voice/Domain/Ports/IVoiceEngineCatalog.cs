namespace Voice.Domain.Ports;

public sealed record VoiceEngineInfo(
    string Id,
    string Name,
    string Mode,
    IReadOnlyList<string> Capabilities,
    bool SupportsClone,
    bool SupportsDesign,
    bool SupportsSynthesis,
    bool IsAvailable,
    string? StatusMessage,
    string Description);

public interface IVoiceEngineCatalog
{
    Task<IReadOnlyList<VoiceEngineInfo>> DiscoverEnginesAsync(CancellationToken ct = default);
    IVoiceEngineDescriptor? FindDescriptor(string engineId);
}
