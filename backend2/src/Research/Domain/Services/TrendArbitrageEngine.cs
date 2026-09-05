namespace Research.Domain.Services;

public sealed record ArbitrageItem(
    string EnTopic,
    string TargetLangTopic,
    double ArbitrageScore,
    string Status,
    string ActionablePlan);

public sealed class TrendArbitrageEngine
{
    private readonly Research.Infrastructure.Ingestors.ISignalIngestor _signalIngestor;

    public TrendArbitrageEngine(Research.Infrastructure.Ingestors.ISignalIngestor signalIngestor)
    {
        _signalIngestor = signalIngestor;
    }

    public async Task<IReadOnlyList<ArbitrageItem>> DetectArbitrageOpportunitiesAsync(
        string query, string targetLang, IReadOnlyList<string> localVideoTitles, CancellationToken ct = default)
    {
        var enSignals = await _signalIngestor.CollectEarlySignalsAsync(query, "en", ct);

        var hotSignals = enSignals.Where(s => s.GrowthVelocityPercent >= 30).Take(6).ToList();
        if (hotSignals.Count == 0) hotSignals = enSignals.Take(4).ToList();
        if (hotSignals.Count == 0) return [];

        var opportunities = new List<ArbitrageItem>();
        foreach (var sig in hotSignals)
        {
            double maxSim = localVideoTitles.Count > 0
                ? localVideoTitles.Max(t => CalculateJaccard(sig.Topic, t))
                : 0.0;

            if (maxSim <= 0.45)
            {
                double score = Math.Clamp(Math.Round(sig.GrowthVelocityPercent * (1.1 - maxSim * 0.5), 1), 50.0, 99.0);
                var plan = targetLang.StartsWith("ru", StringComparison.OrdinalIgnoreCase)
                    ? $"Снять первое подробное видео на русском: на Reddit/GitHub тему активно обсуждают, а на YouTube конкуренция равна 0."
                    : $"High demand topic on Reddit/GitHub with virtually 0 video coverage on YouTube. First-mover advantage.";

                opportunities.Add(new ArbitrageItem(
                    EnTopic: sig.Topic,
                    TargetLangTopic: sig.Topic,
                    ArbitrageScore: score,
                    Status: "BLUE_OCEAN_UNCONTESTED",
                    ActionablePlan: plan));
            }
        }

        return opportunities.OrderByDescending(o => o.ArbitrageScore).ToList();
    }

    private static double CalculateJaccard(string a, string b)
    {
        var wA = a.ToLowerInvariant().Split([' ', ',', '.', ':', '-', '/'], StringSplitOptions.RemoveEmptyEntries).ToHashSet();
        var wB = b.ToLowerInvariant().Split([' ', ',', '.', ':', '-', '/'], StringSplitOptions.RemoveEmptyEntries).ToHashSet();
        if (wA.Count == 0 || wB.Count == 0) return 0.0;
        int intersect = wA.Intersect(wB).Count();
        int union = wA.Union(wB).Count();
        return union == 0 ? 0.0 : (double)intersect / union;
    }
}
