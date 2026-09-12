using Kernel.Exceptions;
using Microsoft.Extensions.Logging;
using Voice.Domain;
using Voice.Domain.Ports;

namespace Voice.Application.Services;

public sealed class TtsProviderRegistry
{
    private readonly Dictionary<VoiceEngineType, ITtsEngineProvider> _providers;
    private readonly ILogger<TtsProviderRegistry> _logger;

    public TtsProviderRegistry(IEnumerable<ITtsEngineProvider> providers, ILogger<TtsProviderRegistry> logger)
    {
        _providers = providers.ToDictionary(p => p.EngineType);
        _logger = logger;
        _logger.LogInformation("[TtsProviderRegistry] Зарегистрированы TTS-движки: {Count} ({Types})",
            _providers.Count, string.Join(", ", _providers.Keys));
    }

    public ITtsEngineProvider Resolve(VoiceEngineType type)
    {
        if (_providers.TryGetValue(type, out var provider))
        {
            _logger.LogDebug("[TtsProviderRegistry] Выбран провайдер: {EngineType}", type);
            return provider;
        }

        _logger.LogError("[TtsProviderRegistry] Провайдер для движка {EngineType} не найден.", type);
        throw new ResourceNotFoundException("TtsEngineProvider", type);
    }
}
