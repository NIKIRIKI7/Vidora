using SystemContext.Contracts;
using Voice.Domain.Ports;
using Voice.Domain.ValueObjects;

namespace Voice.Infrastructure.Providers.Cloud;

public sealed class OpenAiEngineDescriptor : IVoiceEngineDescriptor
{
    private readonly ISystemModule _system;

    public OpenAiEngineDescriptor(ISystemModule system)
    {
        _system = system;
    }

    public string EngineId => "CloudOpenAi";
    public string DisplayName => "OpenAI Speech (облачный)";
    public string Mode => "cloud";
    public VoiceCapabilities Capabilities => VoiceCapabilities.Synthesis;
    public string Description => "Облачный синтез OpenAI (Alloy, Echo, Shimmer)";

    public async Task<EngineReadiness> ProbeReadinessAsync(CancellationToken ct = default)
    {
        var apiKey = await _system.GetSettingValueAsync("integrations.openai.api_key", ct);

        return !string.IsNullOrWhiteSpace(apiKey)
            ? EngineReadiness.Ready()
            : EngineReadiness.NotReady(
                "API-ключ OpenAI не настроен в системе",
                "ApiKey");
    }
}
