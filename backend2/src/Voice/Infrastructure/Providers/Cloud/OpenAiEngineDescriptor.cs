using SystemContext.Domain.Ports;
using Voice.Domain.Ports;
using Voice.Domain.ValueObjects;

namespace Voice.Infrastructure.Providers.Cloud;

public sealed class OpenAiEngineDescriptor : IVoiceEngineDescriptor
{
    private readonly ISystemSettingRepository _settings;

    public OpenAiEngineDescriptor(ISystemSettingRepository settings)
    {
        _settings = settings;
    }

    public string EngineId => "CloudOpenAi";
    public string DisplayName => "OpenAI Speech (Облако)";
    public string Mode => "cloud";
    public VoiceCapabilities Capabilities => VoiceCapabilities.Synthesis;
    public string Description => "Студийные голоса OpenAI (Alloy, Echo, Shimmer)";

    public async Task<EngineReadiness> ProbeReadinessAsync(CancellationToken ct = default)
    {
        var keySetting = await _settings.GetByKeyAsync("integrations.openai.api_key", ct);
        return !string.IsNullOrWhiteSpace(keySetting?.Value)
            ? EngineReadiness.Ready()
            : EngineReadiness.NotReady(
                "API-ключ OpenAI не настроен в системе",
                "ApiKey");
    }
}
