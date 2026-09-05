using Kernel.Platform.Persistence;
using Research.Domain.ValueObjects;

namespace Research.Domain.Entities;

public class Opportunity : BaseEntity<string>
{
    public ResearchRunId ResearchRunId { get; private set; }
    public string AngleTitle { get; private set; } = string.Empty;
    public string HookHypothesis { get; private set; } = string.Empty;
    public string TargetAudience { get; private set; } = string.Empty;
    public string RecommendedFormat { get; private set; } = "Shorts 60s";
    public OpportunityScore Score { get; private set; }
    public string FrictionPoint { get; private set; } = string.Empty;
    public string WhyItWorks { get; private set; } = string.Empty;
    public string ReferenceVideoIdsJson { get; private set; } = "[]";

    protected Opportunity() { }

    public static Opportunity Create(
        ResearchRunId runId,
        string angleTitle,
        string hookHypothesis,
        string targetAudience,
        string recommendedFormat,
        OpportunityScore score,
        string frictionPoint,
        string whyItWorks,
        IEnumerable<string>? referenceVideoIds = null)
    {
        var refs = referenceVideoIds?.Where(r => !string.IsNullOrWhiteSpace(r)).Select(r => r.Trim()).Distinct().ToList() ?? [];
        return new Opportunity
        {
            Id = $"{runId.Value}_opp_{Guid.NewGuid():N}"[..32],
            ResearchRunId = runId,
            AngleTitle = angleTitle.Trim(),
            HookHypothesis = hookHypothesis.Trim(),
            TargetAudience = targetAudience.Trim(),
            RecommendedFormat = recommendedFormat.Trim(),
            Score = score,
            FrictionPoint = frictionPoint.Trim(),
            WhyItWorks = whyItWorks.Trim(),
            ReferenceVideoIdsJson = System.Text.Json.JsonSerializer.Serialize(refs),
            CreatedAt = DateTimeOffset.UtcNow,
            UpdatedAt = DateTimeOffset.UtcNow
        };
    }
}
