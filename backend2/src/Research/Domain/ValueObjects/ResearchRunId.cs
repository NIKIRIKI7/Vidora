using System.Text.RegularExpressions;
using Kernel.Exceptions;

namespace Research.Domain.ValueObjects;

public readonly partial record struct ResearchRunId : IComparable<ResearchRunId>
{
    public const int MaxLength = 64;
    public string Value { get; }

    public ResearchRunId(string value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            throw new ValidationException("research_run_id", "Идентификатор сессии исследования не может быть пустым.");
        }

        var trimmed = value.Trim().ToLowerInvariant();
        if (trimmed.Length > MaxLength || !ValidPattern().IsMatch(trimmed))
        {
            throw new ValidationException("research_run_id", $"Недопустимый формат ID исследования: '{trimmed}'.");
        }

        Value = trimmed;
    }

    public static ResearchRunId New() => new($"run-{Guid.NewGuid():N}"[..24]);

    public static bool TryParse(string? value, out ResearchRunId id)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            id = default;
            return false;
        }

        var trimmed = value.Trim().ToLowerInvariant();
        if (trimmed.Length > MaxLength || !ValidPattern().IsMatch(trimmed))
        {
            id = default;
            return false;
        }

        id = new ResearchRunId(trimmed);
        return true;
    }

    public static implicit operator string(ResearchRunId id) => id.Value;
    public static implicit operator ResearchRunId(string value) => new(value);
    public int CompareTo(ResearchRunId other) => string.Compare(Value, other.Value, StringComparison.Ordinal);
    public override string ToString() => Value;

    [GeneratedRegex(@"^[a-z0-9_\-]+$")]
    private static partial Regex ValidPattern();
}
