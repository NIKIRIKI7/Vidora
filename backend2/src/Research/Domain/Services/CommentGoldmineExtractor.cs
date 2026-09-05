namespace Research.Domain.Services;

public sealed record MinedPainPoint(string TopicSummary, int MentionCount, double ImportanceScore);

public sealed class CommentGoldmineExtractor
{
    public IReadOnlyList<MinedPainPoint> ExtractTopPainPoints(IEnumerable<string> rawComments, int topLimit = 5)
    {
        var clusters = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);

        foreach (var comment in rawComments)
        {
            var clean = comment.Trim().ToLowerInvariant();
            if (clean.Length < 15) continue;

            if (clean.Contains("почему") || clean.Contains("why"))
                Increment(clusters, "Механизм работы и скрытые причины");
            else if (clean.Contains("как") || clean.Contains("how"))
                Increment(clusters, "Пошаговое руководство и реализация");
            else if (clean.Contains("ошибка") || clean.Contains("проблем") || clean.Contains("problem") || clean.Contains("error"))
                Increment(clusters, "Типичные критические ошибки новичков");
            else if (clean.Contains("цена") || clean.Contains("стоимость") || clean.Contains("worth") || clean.Contains("cost"))
                Increment(clusters, "Ценообразование и окупаемость");
            else if (clean.Contains("лучше") || clean.Contains("разниц") || clean.Contains("vs") || clean.Contains("better"))
                Increment(clusters, "Прямое сравнение альтернатив");
        }

        return clusters
            .OrderByDescending(c => c.Value)
            .Take(topLimit)
            .Select(c => new MinedPainPoint(c.Key, c.Value, Math.Min(100.0, c.Value * 12.5)))
            .ToList();
    }

    private static void Increment(Dictionary<string, int> dict, string key)
    {
        dict[key] = dict.GetValueOrDefault(key, 0) + 1;
    }
}
