using Kernel.Exceptions;
using Microsoft.Extensions.Logging;
using Voice.Domain;
using Voice.Domain.Ports;

namespace Voice.Infrastructure.Providers;

public sealed class VoiceCloneProviderRegistry
{
    private readonly IEnumerable<IVoiceCloneProvider> _providers;
    private readonly ILogger<VoiceCloneProviderRegistry> _logger;

    public VoiceCloneProviderRegistry(IEnumerable<IVoiceCloneProvider> providers, ILogger<VoiceCloneProviderRegistry> logger)
    {
        _providers = providers;
        _logger = logger;
        _logger.LogInformation("[VoiceCloneRegistry] Зарегистрировано клон-провайдеров: {Count}", _providers.Count());
    }

    public IVoiceCloneProvider Resolve(VoiceEngineType engine)
    {
        var provider = _providers.FirstOrDefault(p => p.SupportsEngine(engine));
        if (provider != null)
        {
            _logger.LogDebug("[VoiceCloneRegistry] Выбран провайдер для {Engine}: {Type}", engine, provider.GetType().Name);
            return provider;
        }

        _logger.LogError("[VoiceCloneRegistry] Клонирование для движка {Engine} не поддерживается.", engine);
        throw new ResourceNotFoundException("VoiceCloneProvider", engine);
    }
}
