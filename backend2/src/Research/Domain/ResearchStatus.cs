using System.Text.Json.Serialization;

namespace Research.Domain;

[JsonConverter(typeof(JsonStringEnumConverter))]
public enum ResearchStatus
{
    Queued,
    SearchingCandidates,
    AnalyzingMomentum,
    MiningComments,
    DetectingBlueOceans,
    SynthesizingOpportunities,
    Completed,
    Failed,
    Cancelled
}
