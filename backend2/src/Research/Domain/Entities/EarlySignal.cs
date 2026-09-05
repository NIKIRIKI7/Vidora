using Kernel.Platform.Persistence;
using Research.Domain.ValueObjects;

namespace Research.Domain.Entities;

public class EarlySignal : BaseEntity<string>
{
    public ResearchRunId ResearchRunId { get; private set; }
    public string Topic { get; private set; } = string.Empty;
    public string KeywordClusterJson { get; private set; } = "[]";
    public double GrowthVelocityPercent { get; private set; }
    public int SupportingVideoCount { get; private set; }
    public double AggregateVph { get; private set; }
    public double Confidence { get; private set; }
    public string SourceUrl { get; private set; } = string.Empty;
    public string SourcePlatform { get; private set; } = string.Empty;
    public string GrowthPct { get; private set; } = string.Empty;

    protected EarlySignal() { }

    public static EarlySignal Create(
        ResearchRunId runId,
        string topic,
        IEnumerable<string> keywords,
        double growthVelocityPercent,
        int supportingVideoCount,
        double aggregateVph,
        double confidence,
        string sourceUrl = "",
        string sourcePlatform = "",
        string growthPct = "")
    {
        var kwList = keywords.Where(k => !string.IsNullOrWhiteSpace(k)).Select(k => k.Trim()).Distinct().ToList();
        return new EarlySignal
        {
            Id = $"{runId.Value}_sig_{Guid.NewGuid():N}"[..32],
            ResearchRunId = runId,
            Topic = topic.Trim(),
            KeywordClusterJson = System.Text.Json.JsonSerializer.Serialize(kwList),
            GrowthVelocityPercent = Math.Round(growthVelocityPercent, 1),
            SupportingVideoCount = Math.Max(1, supportingVideoCount),
            AggregateVph = Math.Round(aggregateVph, 1),
            Confidence = Math.Clamp(Math.Round(confidence, 2), 0.0, 1.0),
            SourceUrl = sourceUrl,
            SourcePlatform = sourcePlatform,
            GrowthPct = growthPct,
            CreatedAt = DateTimeOffset.UtcNow,
            UpdatedAt = DateTimeOffset.UtcNow
        };
    }
}
