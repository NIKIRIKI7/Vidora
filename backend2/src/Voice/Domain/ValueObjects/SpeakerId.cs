using System.Text.RegularExpressions;
using Kernel.Exceptions;

namespace Voice.Domain.ValueObjects;

public readonly partial record struct SpeakerId : IComparable<SpeakerId>
{
    public const int MaxLength = 64;
    public string Value { get; }

    public SpeakerId(string value)
    {
        if (string.IsNullOrWhiteSpace(value))
            throw new ValidationException("speaker_id", "Идентификатор диктора не может быть пустым.");
        var trimmed = value.Trim().ToLowerInvariant();
        if (trimmed.Length > MaxLength || !ValidPattern().IsMatch(trimmed))
            throw new ValidationException("speaker_id", $"Недопустимый формат ID диктора: '{trimmed}'.");
        Value = trimmed;
    }

    public static SpeakerId New() => new($"spk-{Guid.NewGuid():N}"[..20]);
    public static implicit operator string(SpeakerId id) => id.Value;
    public static implicit operator SpeakerId(string value) => new(value);
    public int CompareTo(SpeakerId other) => string.Compare(Value, other.Value, StringComparison.Ordinal);
    public override string ToString() => Value;

    public static bool TryParse(string? value, out SpeakerId id)
    {
        if (string.IsNullOrWhiteSpace(value) || value.Trim().Length > MaxLength || !ValidPattern().IsMatch(value.Trim().ToLowerInvariant()))
        {
            id = default;
            return false;
        }
        id = new SpeakerId(value);
        return true;
    }

    [GeneratedRegex(@"^[a-z0-9_\-]+$")]
    private static partial Regex ValidPattern();
}
