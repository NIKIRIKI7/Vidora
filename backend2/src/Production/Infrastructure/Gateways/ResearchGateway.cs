using Microsoft.Extensions.Logging;
using ProductionContext.Domain.Ports;
using Research.Contracts;

namespace ProductionContext.Infrastructure.Gateways;

public sealed class ResearchGateway : ITrendingTopicProvider
{
    private readonly IResearchModule _researchModule;
    private readonly ILogger<ResearchGateway> _logger;

    public ResearchGateway(IResearchModule researchModule, ILogger<ResearchGateway> logger)
    {
        _researchModule = researchModule;
        _logger = logger;
    }

    public async Task<IReadOnlyList<string>> GetTrendingHooksAsync(string topic, int max = 5, CancellationToken ct = default)
    {
        try
        {
            return await _researchModule.GetTrendingHooksAsync(topic, max, ct);
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            _logger.LogDebug(ex, "[ResearchGateway] Не удалось получить трендовые хуки для '{Topic}'", topic);
            return [];
        }
    }
}
