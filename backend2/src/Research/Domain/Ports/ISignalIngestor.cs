using Research.Domain.Entities;

namespace Research.Domain.Ports;

/// <summary>
/// Аналитический контекст ниши, разрешённый через LLM для поиска ранних сигналов.
/// </summary>
public sealed record NicheContext(
    string DisplayTopic,
    string EffectiveQuery,
    string EnglishQuery,
    IReadOnlyList<string> Keywords,
    IReadOnlyList<string> RedditSubreddits);

public interface ISignalIngestor
{
    Task<IReadOnlyList<EarlySignal>> CollectEarlySignalsAsync(string query, string lang = "ru", CancellationToken ct = default);
    Task<IReadOnlyList<string>> FetchGoogleTrendsKeywordsAsync(string query, string lang = "ru", CancellationToken ct = default);
    Task<NicheContext> ResolveNicheContextAsync(string query, string lang = "ru", CancellationToken ct = default);
}
