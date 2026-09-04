using System.Text.RegularExpressions;
using Kernel.Exceptions;

namespace Voice.Domain.ValueObjects;

public readonly partial record struct TtsJobId : IComparable<TtsJobId>
{
    public const int MaxLength = 64;
    public string Value { get; }

    public TtsJobId(string value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            throw new ValidationException("tts_job_id", "Идентификатор задачи не может быть пустым.");
        }
        var trimmed = value.Trim().ToLowerInvariant();
        if (trimmed.Length > MaxLength || !ValidPattern().IsMatch(trimmed))
        {
            throw new ValidationException("tts_job_id", $"Недопустимый формат ID задачи: '{trimmed}'.");
        }
        Value = trimmed;
    }

    public static TtsJobId New() => new($"tts-{Guid.NewGuid():N}");

    public static implicit operator string(TtsJobId id) => id.Value;
    public static implicit operator TtsJobId(string value) => new(value);
    public int CompareTo(TtsJobId other) => string.Compare(Value, other.Value, StringComparison.Ordinal);
    public override string ToString() => Value;

    public static bool TryParse(string? value, out TtsJobId id)
    {
        if (string.IsNullOrWhiteSpace(value) || value.Trim().Length > MaxLength || !ValidPattern().IsMatch(value.Trim().ToLowerInvariant()))
        {
            id = default;
            return false;
        }
        id = new TtsJobId(value);
        return true;
    }

    [GeneratedRegex(@"^[a-z0-9_\-]+$")]
    private static partial Regex ValidPattern();
}
