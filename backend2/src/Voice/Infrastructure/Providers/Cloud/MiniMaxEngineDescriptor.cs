using SystemContext.Domain.Ports;
using Voice.Domain.Ports;
using Voice.Domain.ValueObjects;

namespace Voice.Infrastructure.Providers.Cloud;

public sealed class MiniMaxEngineDescriptor : IVoiceEngineDescriptor
{
    private readonly ISystemSettingRepository _settings;

    public MiniMaxEngineDescriptor(ISystemSettingRepository settings)
    {
        _settings = settings;
    }

    public string EngineId => "CloudMiniMax";
    public string DisplayName => "MiniMax T2A (Облако)";
    public string Mode => "cloud";
    public VoiceCapabilities Capabilities => VoiceCapabilities.Synthesis | VoiceCapabilities.Clone;
    public string Description => "Высокоточное клонирование и экспрессивная речь с эмоциональными тегами (speech-01-turbo)";

    public async Task<EngineReadiness> ProbeReadinessAsync(CancellationToken ct = default)
    {
        var keySetting = await _settings.GetByKeyAsync("integrations.minimax.api_key", ct);
        var groupSetting = await _settings.GetByKeyAsync("integrations.minimax.group_id", ct);

        bool isConfigured = !string.IsNullOrWhiteSpace(keySetting?.Value) &&
                            !string.IsNullOrWhiteSpace(groupSetting?.Value);

        return isConfigured
            ? EngineReadiness.Ready()
            : EngineReadiness.NotReady(
                "Не указан API-ключ или Group ID MiniMax в настройках",
                "ApiKey");
    }
}
