using Voice.Application.Contracts;
using Voice.Domain.Ports;
using Voice.Domain.ValueObjects;

namespace Voice.Infrastructure.Providers;

public sealed class VoiceEngineCatalog : IVoiceEngineCatalog
{
    private readonly IEnumerable<IVoiceEngineDescriptor> _descriptors;

    public VoiceEngineCatalog(IEnumerable<IVoiceEngineDescriptor> descriptors)
    {
        _descriptors = descriptors;
    }

    public async Task<IReadOnlyList<VoiceEngineInfoDto>> DiscoverEnginesAsync(CancellationToken ct = default)
    {
        var tasks = _descriptors.Select(async desc =>
        {
            EngineReadiness readiness;
            try
            {
                readiness = await desc.ProbeReadinessAsync(ct);
            }
            catch (Exception ex)
            {
                readiness = EngineReadiness.NotReady($"Ошибка самодиагностики: {ex.Message}");
            }

            var caps = new List<string>();
            if (desc.Capabilities.HasFlag(VoiceCapabilities.Synthesis)) caps.Add("synthesis");
            if (desc.Capabilities.HasFlag(VoiceCapabilities.Clone)) caps.Add("clone");
            if (desc.Capabilities.HasFlag(VoiceCapabilities.Design)) caps.Add("design");
            if (desc.Capabilities.HasFlag(VoiceCapabilities.Streaming)) caps.Add("streaming");

            return new VoiceEngineInfoDto(
                Id: desc.EngineId,
                Name: desc.DisplayName,
                Mode: desc.Mode,
                Capabilities: caps,
                SupportsClone: desc.Capabilities.HasFlag(VoiceCapabilities.Clone),
                SupportsDesign: desc.Capabilities.HasFlag(VoiceCapabilities.Design),
                SupportsSynthesis: desc.Capabilities.HasFlag(VoiceCapabilities.Synthesis),
                IsAvailable: readiness.IsReady,
                StatusMessage: readiness.Reason,
                Description: desc.Description
            );
        });

        var results = await Task.WhenAll(tasks);
        return results.OrderByDescending(r => r.IsAvailable).ThenBy(r => r.Name).ToList();
    }

    public IVoiceEngineDescriptor? FindDescriptor(string engineId) =>
        _descriptors.FirstOrDefault(d =>
            string.Equals(d.EngineId, engineId, StringComparison.OrdinalIgnoreCase));
}
