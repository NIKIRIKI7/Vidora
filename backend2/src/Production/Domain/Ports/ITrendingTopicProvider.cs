namespace ProductionContext.Domain.Ports;

/// <summary>
/// Порт получения трендовых хуков из другого bounded context (Research) без прямой
/// зависимости Application/Domain от его внутренностей.
/// </summary>
public interface ITrendingTopicProvider
{
    Task<IReadOnlyList<string>> GetTrendingHooksAsync(string topic, int max = 5, CancellationToken ct = default);
}
