using Voice.Application.Contracts;

namespace Voice.Domain.Ports;

public interface IVoiceEngineCatalog
{
    Task<IReadOnlyList<VoiceEngineInfoDto>> DiscoverEnginesAsync(CancellationToken ct = default);
    IVoiceEngineDescriptor? FindDescriptor(string engineId);
}
