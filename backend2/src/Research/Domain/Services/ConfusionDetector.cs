using System.Text.RegularExpressions;

namespace Research.Domain.Services;

public sealed record DetectedConfusion(string TriggerPhrase, string Category, double Weight);

public sealed record ConfusionAnalysisResult(
    double ConfusionIndex, string Status, int QuestionsCount, int FrustrationsCount, int DebatesCount, string ActionableFix);

public sealed partial class ConfusionDetector
{
    private static readonly (Regex Pattern, string Category, double Weight)[] Triggers =
    [
        (HowToRegex(), "PracticalExecution", 0.9),
        (WhyRegex(), "UnderlyingMechanism", 0.85),
        (ContradictionRegex(), "CognitiveDissonance", 1.0),
        (MistakeRegex(), "PainPointAvoidance", 0.95),
        (NobodyExplainsRegex(), "InformationVacuum", 1.0)
    ];

    public IReadOnlyList<DetectedConfusion> DetectFrictionPoints(IEnumerable<string> commentTexts)
    {
        var results = new List<DetectedConfusion>();
        foreach (var comment in commentTexts)
        {
            if (string.IsNullOrWhiteSpace(comment)) continue;
            foreach (var (regex, category, weight) in Triggers)
            {
                var match = regex.Match(comment);
                if (match.Success)
                    results.Add(new DetectedConfusion(match.Value.Trim(), category, weight));
            }
        }
        return results;
    }

    public ConfusionAnalysisResult AnalyzeCommentsFriction(
        IReadOnlyList<string> comments, long views = 0, double ratio = 1.0)
    {
        if (comments.Count == 0)
            return new ConfusionAnalysisResult(0.0, "RED_OCEAN_SATISFIED", 0, 0, 0, "Комментарии отсутствуют");

        int questions = 0, frustrations = 0, debates = 0;
        foreach (var c in comments)
        {
            var text = c.ToLowerInvariant();
            if (QuestionRegex().IsMatch(text)) questions++;
            if (FrustrationRegex().IsMatch(text)) frustrations++;
            if (DebateRegex().IsMatch(text)) debates++;
        }

        double confidenceMultiplier = Math.Min(1.0, comments.Count / 10.0);
        double weightedScore = (questions * 1.4 + frustrations * 2.0 + debates * 1.0) / comments.Count;
        double rawIndex = Math.Min(1.0, weightedScore / 2.2);
        double finalIndex = Math.Round(rawIndex * confidenceMultiplier, 2);

        string status, fix;
        if (finalIndex >= 0.40 && (views >= 20000 || ratio >= 2.0))
        {
            status = "PSEUDO_RED_DISRUPTIVE";
            fix = "Снять ролик-исправление: детальный пошаговый разбор без упущений лидеров";
        }
        else if (finalIndex >= 0.25)
        {
            status = "MODERATE_QUALITY_GAP";
            fix = "Усилить практическую часть и разобрать частые ошибки зрителей";
        }
        else
        {
            status = "RED_OCEAN_SATISFIED";
            fix = "Тема качественно закрыта существующими роликами";
        }

        return new ConfusionAnalysisResult(finalIndex, status, questions, frustrations, debates, fix);
    }

    [GeneratedRegex(@"(как (на самом деле|правильно|сделать|настроить)|how (do you|to actually|can i))", RegexOptions.IgnoreCase)]
    private static partial Regex HowToRegex();

    [GeneratedRegex(@"(почему (никто|до сих пор|не работает|не объясняет)|why does (nobody|it never))", RegexOptions.IgnoreCase)]
    private static partial Regex WhyRegex();

    [GeneratedRegex(@"(но ведь|а как же|разве не|doesn'?t make sense|contradiction)", RegexOptions.IgnoreCase)]
    private static partial Regex ContradictionRegex();

    [GeneratedRegex(@"(главная ошибка|я потерял|все делают не так|biggest mistake|failed because)", RegexOptions.IgnoreCase)]
    private static partial Regex MistakeRegex();

    [GeneratedRegex(@"(никто не говорит|об этом молчат|nobody talks about|secret they hide)", RegexOptions.IgnoreCase)]
    private static partial Regex NobodyExplainsRegex();

    [GeneratedRegex(@"\b(как|почему|зачем|где|куда|откуда|сколько|какой|какая|что если|how to|why does|where can|what if)\b|\?", RegexOptions.IgnoreCase)]
    private static partial Regex QuestionRegex();

    [GeneratedRegex(@"\b(не работает|ошибка|выдает ошибку|забыл|упустил|не сказал|устарело|обман|не помогло|doesn'?t work|not working|error|bug|failed|missing|skipped|outdated)\b", RegexOptions.IgnoreCase)]
    private static partial Regex FrustrationRegex();

    [GeneratedRegex(@"\b(лучше бы|надо было|наоборот|не согласен|вранье|ерунда|альтернатива|better to|should have|disagree|wrong|fake|nonsense|instead of)\b", RegexOptions.IgnoreCase)]
    private static partial Regex DebateRegex();
}
