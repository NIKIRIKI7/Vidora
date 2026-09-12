using System.Runtime.CompilerServices;
using System.Text.Json;
using Kernel.Ports;
using Microsoft.Extensions.Logging;
using Research.Contracts;
using Research.Domain;
using Research.Domain.Entities;
using Research.Domain.Ports;
using Research.Domain.Services;
using Research.Domain.ValueObjects;
using Skills.Contracts;
using Skills.Domain;

namespace Research.Application.Pipelines;

public sealed class DeepTrendDagPipeline : IDeepTrendDagPipeline
{
    private readonly IYouTubeSearchIngestor _ingestor;
    private readonly ISignalIngestor _signalIngestor;
    private readonly MomentumEngine _momentumEngine;
    private readonly BlueOceanDetector _blueOceanDetector;
    private readonly ConfusionDetector _confusionDetector;
    private readonly CommentGoldmineExtractor _goldmineExtractor;
    private readonly ISkillsCatalog _skillsCatalog;
    private readonly ILlmClient _llmClient;
    private readonly ILogger<DeepTrendDagPipeline> _logger;

    public DeepTrendDagPipeline(
        IYouTubeSearchIngestor ingestor,
        ISignalIngestor signalIngestor,
        MomentumEngine momentumEngine,
        BlueOceanDetector blueOceanDetector,
        ConfusionDetector confusionDetector,
        CommentGoldmineExtractor goldmineExtractor,
        ISkillsCatalog skillsCatalog,
        ILlmClient llmClient,
        ILogger<DeepTrendDagPipeline> logger)
    {
        _ingestor = ingestor;
        _signalIngestor = signalIngestor;
        _momentumEngine = momentumEngine;
        _blueOceanDetector = blueOceanDetector;
        _confusionDetector = confusionDetector;
        _goldmineExtractor = goldmineExtractor;
        _skillsCatalog = skillsCatalog;
        _llmClient = llmClient;
        _logger = logger;
    }

    public async IAsyncEnumerable<ResearchDagProgressDto> RunAsync(
        ResearchRun run,
        int maxCandidates = 30,
        [EnumeratorCancellation] CancellationToken ct = default)
    {
        run.MarkStatus(ResearchStatus.SearchingCandidates);
        yield return new ResearchDagProgressDto(run.Id.Value, ResearchStatus.SearchingCandidates, 15.0, "Сбор видео-кандидатов через YouTube Ingestor...", 0, 0);

        IReadOnlyList<RawVideoSearchResult> rawResults;
        try
        {
            rawResults = await _ingestor.SearchTopicCandidatesAsync(run.TopicQuery, maxCandidates, ct: ct);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "[DeepTrend DAG] YouTube search failed (blocked/timeout). Falling back to signal-based synthesis.");
            rawResults = [];
        }
        _logger.LogInformation("[DeepTrend DAG] Собрано {Count} кандидатов по запросу '{Query}'", rawResults.Count, run.TopicQuery);

        // Fallback: if YouTube blocked, gather early signals as synthetic candidates
        IReadOnlyList<EarlySignal> earlySignals = [];
        if (rawResults.Count == 0)
        {
            _logger.LogWarning("[DeepTrend DAG] YouTube returned 0 results. Gathering early signals from Habr/GitHub/HN...");
            try
            {
                earlySignals = await _signalIngestor.CollectEarlySignalsAsync(run.TopicQuery, run.Niche ?? "ru", ct);
                _logger.LogInformation("[DeepTrend DAG] Collected {Count} early signals as fallback candidates", earlySignals.Count);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "[DeepTrend DAG] Signal collection also failed.");
            }
        }

        run.MarkStatus(ResearchStatus.AnalyzingMomentum);
        yield return new ResearchDagProgressDto(run.Id.Value, ResearchStatus.AnalyzingMomentum, 35.0, "Расчет метрик Momentum и детекция выбросов скорости...", 0, 0);

        var candidateEntities = new List<VideoCandidate>();
        var allComments = new List<string>();

        foreach (var r in rawResults)
        {
            var momentum = _momentumEngine.CalculateMomentum(r.ViewCount, r.PublishedAt, r.SubscriberCount);
            var entity = VideoCandidate.Create(
                run.Id, r.VideoId, r.Title, r.ChannelTitle, r.ChannelId,
                r.SubscriberCount, r.ViewCount, r.PublishedAt, r.DurationSeconds,
                momentum, r.ThumbnailUrl, JsonSerializer.Serialize(r.TopComments));

            candidateEntities.Add(entity);
            allComments.AddRange(r.TopComments);
        }

        run.AddCandidates(candidateEntities);
        var outlierCandidates = candidateEntities.Where(c => _momentumEngine.IsVelocityOutlier(c.Momentum)).ToList();
        if (outlierCandidates.Count == 0) outlierCandidates = candidateEntities.Take(5).ToList();

        run.MarkStatus(ResearchStatus.MiningComments);
        yield return new ResearchDagProgressDto(run.Id.Value, ResearchStatus.MiningComments, 55.0, "Извлечение болей и когнитивного диссонанса из комментариев...", 0, 0);

        var frictionPoints = _confusionDetector.DetectFrictionPoints(allComments);
        var topPainPoints = _goldmineExtractor.ExtractTopPainPoints(allComments);

        run.MarkStatus(ResearchStatus.DetectingBlueOceans);
        yield return new ResearchDagProgressDto(run.Id.Value, ResearchStatus.DetectingBlueOceans, 70.0, "Валидация гипотез Голубого Океана...", 0, 0);

        var signals = new List<EarlySignal>();
        foreach (var pain in topPainPoints)
        {
            double aggregateVph = outlierCandidates.Sum(c => c.Momentum.ViewsPerHour);
            var eval = _blueOceanDetector.EvaluateTopicCompetition(pain.TopicSummary, candidateEntities.Count, 2, aggregateVph);

            if (eval.IsBlueOcean || signals.Count == 0)
            {
                var sig = EarlySignal.Create(
                    run.Id,
                    pain.TopicSummary,
                    [run.TopicQuery, pain.TopicSummary, "viral-insight"],
                    growthVelocityPercent: pain.ImportanceScore,
                    supportingVideoCount: Math.Max(1, pain.MentionCount),
                    aggregateVph: aggregateVph,
                    confidence: eval.CompetitionIndex);
                signals.Add(sig);
            }
        }

        run.AddSignals(signals);
        yield return new ResearchDagProgressDto(run.Id.Value, ResearchStatus.DetectingBlueOceans, 80.0, $"Обнаружено ранних сигналов: {signals.Count}", signals.Count, 0);

        // Merge early signals from signal ingestor into the run
        if (earlySignals.Count > 0)
        {
            run.AddSignals(earlySignals.Take(5).ToList());
        }

        run.MarkStatus(ResearchStatus.SynthesizingOpportunities);
        yield return new ResearchDagProgressDto(run.Id.Value, ResearchStatus.SynthesizingOpportunities, 90.0, "Генерация сценарных углов и хуков через LLM...", signals.Count, 0);

        var skillBundle = await _skillsCatalog.GetSkillBundleForStageAsync(
            SkillStage.TrendResearch,
            maxTokenLimit: 3000,
            customHeaderInstructions: "Act as a viral YouTube strategist. Synthesize Blue Ocean content opportunities from signals.",
            cancellationToken: ct);

        var videoLines = string.Join("\n", outlierCandidates.Take(3)
            .Select(c => $"- {c.Title} (VPH: {c.Momentum.ViewsPerHour:F0}, Outlier: x{c.Momentum.OutlierMultiplier:F1})"));
        var frictionLines = string.Join("\n", frictionPoints.Take(5)
            .Select(f => $"- [{f.Category}] {f.TriggerPhrase}"));

        var promptUser =
            $"Topic Query: {run.TopicQuery}\n" +
            $"Niche: {run.Niche}\n" +
            $"Top Outlier Videos:\n{videoLines}\n\n" +
            $"Audience Friction Points:\n{frictionLines}\n\n" +
            "Generate JSON array of 3 Opportunity objects:\n" +
            "[\n" +
            "  {\"angle_title\": \"String\", \"hook_hypothesis\": \"String (first 3 seconds rule)\", \"target_audience\": \"String\", \"recommended_format\": \"Shorts 60s or DeepDive 8m\", \"friction_point\": \"String\", \"why_it_works\": \"String\"}\n" +
            "]";

        var spec = new LlmPromptSpec(
            Messages:
            [
                new LlmPromptMessage("system", skillBundle.SystemPrompt),
                new LlmPromptMessage("user", promptUser)
            ],
            Temperature: 0.4f,
            JsonMode: true);

        var opportunities = new List<Opportunity>();
        try
        {
            var rawJson = await _llmClient.GenerateTextAsync(spec, ct);
            var parsed = ParseOpportunitiesFromJson(run.Id, rawJson, outlierCandidates.Select(c => c.VideoId).ToList());
            opportunities.AddRange(parsed);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "[DeepTrend DAG] LLM генерация не удалась, переход на алгоритмический синтез возможностей.");
            opportunities.AddRange(FallbackSynthesizeOpportunities(run.Id, run.TopicQuery, signals, outlierCandidates));
        }

        run.AddOpportunities(opportunities);
        run.MarkCompleted();

        yield return new ResearchDagProgressDto(
            run.Id.Value,
            ResearchStatus.Completed,
            100.0,
            $"Сессия успешно завершена. Найдено возможностей: {opportunities.Count}",
            signals.Count,
            opportunities.Count);
    }

    private static List<Opportunity> ParseOpportunitiesFromJson(
        ResearchRunId runId,
        string json,
        List<string> refIds)
    {
        var list = new List<Opportunity>();
        using var doc = JsonDocument.Parse(json.Trim('`', ' '));
        var root = doc.RootElement;
        var array = root.ValueKind == JsonValueKind.Array ? root : (root.TryGetProperty("opportunities", out var opp) ? opp : default);

        if (array.ValueKind == JsonValueKind.Array)
        {
            foreach (var item in array.EnumerateArray())
            {
                var title = item.GetProperty("angle_title").GetString() ?? "Viral Angle";
                var hook = item.GetProperty("hook_hypothesis").GetString() ?? "Hook";
                var aud = item.TryGetProperty("target_audience", out var a) ? a.GetString() ?? "General" : "General";
                var fmt = item.TryGetProperty("recommended_format", out var f) ? f.GetString() ?? "Shorts 60s" : "Shorts 60s";
                var fric = item.TryGetProperty("friction_point", out var fr) ? fr.GetString() ?? "" : "";
                var why = item.TryGetProperty("why_it_works", out var w) ? w.GetString() ?? "" : "";

                var score = OpportunityScore.Create(85.0, 0.75, 0.90);
                list.Add(Opportunity.Create(runId, title, hook, aud, fmt, score, fric, why, refIds));
            }
        }

        return list;
    }

    private static List<Opportunity> FallbackSynthesizeOpportunities(
        ResearchRunId runId,
        string query,
        List<EarlySignal> signals,
        List<VideoCandidate> candidates)
    {
        var opportunities = new List<Opportunity>();
        var refs = candidates.Take(2).Select(c => c.VideoId).ToList();

        var ranked = signals
            .OrderByDescending(s => s.GrowthVelocityPercent)
            .ThenByDescending(s => s.Confidence)
            .Take(5)
            .ToList();

        if (ranked.Count == 0)
        {
            opportunities.Add(Opportunity.Create(
                runId,
                $"Untapped Angle: {query}",
                $"Decode \"{query}\" from first principles instead of repeating surface-level tutorials.",
                "Practitioners researching the query",
                "Shorts 60s",
                OpportunityScore.Create(60.0, 0.5, 0.5),
                query,
                "Seed opportunity synthesized without external signals.",
                refs));
            return opportunities;
        }

        foreach (var signal in ranked)
        {
            double demand = Math.Round(Math.Clamp(50.0 + signal.GrowthVelocityPercent, 55.0, 95.0), 1);
            double competition = Math.Round(Math.Clamp(1.0 - signal.Confidence, 0.15, 0.85), 2);
            double confidence = Math.Clamp(signal.Confidence, 0.2, 1.0);
            string audience = string.IsNullOrWhiteSpace(signal.SourcePlatform)
                ? "Practitioners frustrated by surface-level content"
                : $"Audience discovering the topic via {signal.SourcePlatform}";
            string format = signal.AggregateVph > 0 ? "DeepDive 8m" : "Shorts 60s";

            opportunities.Add(Opportunity.Create(
                runId,
                $"Unexplored Mechanics of {signal.Topic}",
                $"Regarding \"{signal.Topic}\" — what practitioners actually miss beyond the canonical tutorials.",
                audience,
                format,
                OpportunityScore.Create(demand, competition, confidence),
                signal.Topic,
                $"Derived from {signal.SupportingVideoCount} videos (VPH {signal.AggregateVph:F0}), growth {signal.GrowthVelocityPercent:F0}%, confidence {confidence:P0}, source {signal.SourcePlatform}.",
                refs));
        }

        return opportunities;
    }
}
