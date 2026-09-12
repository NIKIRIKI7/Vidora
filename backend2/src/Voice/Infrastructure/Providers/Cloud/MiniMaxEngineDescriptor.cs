using SystemContext.Contracts;
using Voice.Domain.Ports;
using Voice.Domain.ValueObjects;

namespace Voice.Infrastructure.Providers.Cloud;

public sealed class MiniMaxEngineDescriptor : IVoiceEngineDescriptor
{
    private readonly ISystemModule _system;

    public MiniMaxEngineDescriptor(ISystemModule system)
    {
        _system = system;
    }

    public string EngineId => "CloudMiniMax";
    public string DisplayName => "MiniMax T2A (облачный)";
    public string Mode => "cloud";
    public VoiceCapabilities Capabilities => VoiceCapabilities.Synthesis | VoiceCapabilities.Clone;
    public string Description => "Высококачественный облачный синтез речи с поддержкой клонирования голоса (speech-01-turbo)";

    public async Task<EngineReadiness> ProbeReadinessAsync(CancellationToken ct = default)
    {
        var apiKey = await _system.GetSettingValueAsync("integrations.minimax.api_key", ct);
        var groupId = await _system.GetSettingValueAsync("integrations.minimax.group_id", ct);

        bool isConfigured = !string.IsNullOrWhiteSpace(apiKey) && !string.IsNullOrWhiteSpace(groupId);

        return isConfigured
            ? EngineReadiness.Ready()
            : EngineReadiness.NotReady(
                "Не заданы API-ключ или Group ID MiniMax в настройках",
                "ApiKey");
    }
}
