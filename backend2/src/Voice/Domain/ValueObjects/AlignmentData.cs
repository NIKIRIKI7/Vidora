using System.Text.Json.Serialization;

namespace Voice.Domain.ValueObjects;

public sealed record AlignmentData
{
    [JsonPropertyName("words")]
    public IReadOnlyList<TimedWord> Words { get; init; }

    [JsonPropertyName("total_duration_ms")]
    public long TotalDurationMs { get; init; }

    [JsonPropertyName("alignment_engine")]
    public string AlignmentEngine { get; init; }

    public AlignmentData(IEnumerable<TimedWord> words, long totalDurationMs, string alignmentEngine = "None")
    {
        Words = words.OrderBy(w => w.StartMs).ToList();
        TotalDurationMs = totalDurationMs;
        AlignmentEngine = alignmentEngine;
    }

    public static AlignmentData Empty => new([], 0, "None");
}
