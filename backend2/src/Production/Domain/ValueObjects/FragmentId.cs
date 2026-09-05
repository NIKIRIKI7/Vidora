using System.Text.RegularExpressions;
using Kernel.Exceptions;

namespace ProductionContext.Domain.ValueObjects;

public readonly partial record struct FragmentId : IComparable<FragmentId>
{
    public const int MaxLength = 64;
    public string Value { get; }

    public FragmentId(string value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            throw new ValidationException("fragment_id", "Идентификатор фрагмента не может быть пустым.");
        }

        var trimmed = value.Trim().ToLowerInvariant();
        if (trimmed.Length > MaxLength || !ValidPattern().IsMatch(trimmed))
        {
            throw new ValidationException("fragment_id", $"Идентификатор фрагмента '{trimmed}' недопустим.");
        }

        Value = trimmed;
    }

    public static FragmentId New() => new($"frag-{Guid.NewGuid():N}"[..24]);

    public static implicit operator string(FragmentId id) => id.Value;
    public static implicit operator FragmentId(string value) => new(value);

    public int CompareTo(FragmentId other) => string.Compare(Value, other.Value, StringComparison.Ordinal);
    public override string ToString() => Value;

    [GeneratedRegex(@"^[a-z0-9_\-]+$")]
    private static partial Regex ValidPattern();
}
