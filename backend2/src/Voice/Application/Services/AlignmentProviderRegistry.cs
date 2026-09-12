using Microsoft.Extensions.Logging;
using Voice.Domain;
using Voice.Domain.Ports;

namespace Voice.Application.Services;

public sealed class AlignmentProviderRegistry
{
    private readonly Dictionary<AlignmentEngineType, IForcedAlignmentProvider> _providers;
    private readonly ILogger<AlignmentProviderRegistry> _logger;

    public AlignmentProviderRegistry(IEnumerable<IForcedAlignmentProvider> providers, ILogger<AlignmentProviderRegistry> logger)
    {
        _providers = providers.ToDictionary(p => p.EngineType);
        _logger = logger;
        _logger.LogInformation("[AlignmentRegistry] Доступные движки выравнивания: {Count} ({Types})",
            _providers.Count, string.Join(", ", _providers.Keys));
    }

    public IForcedAlignmentProvider Resolve(AlignmentEngineType type)
    {
        if (_providers.TryGetValue(type, out var provider))
        {
            _logger.LogDebug("[AlignmentRegistry] Выбран провайдер выравнивания: {Type}", type);
            return provider;
        }

        _logger.LogWarning("[AlignmentRegistry] Провайдер выравнивания {Type} не найден, используется NativeFallback.", type);
        return _providers[AlignmentEngineType.NativeTts];
    }
}
