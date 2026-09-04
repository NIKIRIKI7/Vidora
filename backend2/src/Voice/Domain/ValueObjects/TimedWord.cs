using System.Text.Json.Serialization;
using Kernel.Exceptions;

namespace Voice.Domain.ValueObjects;

public sealed record TimedWord
{
    [JsonPropertyName("word")]
    public string Word { get; init; }

    [JsonPropertyName("start_ms")]
    public long StartMs { get; init; }

    [JsonPropertyName("end_ms")]
    public long EndMs { get; init; }

    [JsonPropertyName("confidence")]
    public double Confidence { get; init; }

    public TimedWord(string word, long startMs, long endMs, double confidence = 1.0)
    {
        if (string.IsNullOrWhiteSpace(word))
        {
            throw new ValidationException("word", "Слово не может быть пустым.");
        }
        if (startMs < 0 || endMs < startMs)
        {
            throw new ValidationException("timing", $"Некорректный тайминг слова '{word}': {startMs}ms - {endMs}ms");
        }
        Word = word.Trim();
        StartMs = startMs;
        EndMs = endMs;
        Confidence = Math.Clamp(confidence, 0.0, 1.0);
    }
}
