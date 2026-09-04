using System.Text.RegularExpressions;
using Kernel.Exceptions;

namespace Skills.Domain.ValueObjects;

public readonly partial record struct SkillId : IComparable<SkillId>
{
    public const int MaxLength = 64;

    public string Value { get; }

    public SkillId(string value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            throw new ValidationException("id", "Идентификатор скила не может быть пустым.");
        }

        var trimmed = value.Trim().ToLowerInvariant();
        if (trimmed.Length > MaxLength)
        {
            throw new ValidationException("id", $"Длина идентификатора не может превышать {MaxLength} символов.");
        }

        if (!ValidIdPattern().IsMatch(trimmed))
        {
            throw new ValidationException("id", "Идентификатор может содержать только латинские буквы, цифры, дефисы и подчеркивания.");
        }

        Value = trimmed;
    }

    public static bool TryParse(string? value, out SkillId skillId)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            skillId = default;
            return false;
        }

        var trimmed = value.Trim().ToLowerInvariant();
        if (trimmed.Length > MaxLength || !ValidIdPattern().IsMatch(trimmed))
        {
            skillId = default;
            return false;
        }

        skillId = new SkillId(trimmed);
        return true;
    }

    public static implicit operator string(SkillId id) => id.Value;
    public static implicit operator SkillId(string value) => new(value);

    public int CompareTo(SkillId other) => string.Compare(Value, other.Value, StringComparison.Ordinal);

    public override string ToString() => Value;

    [GeneratedRegex(@"^[a-z0-9_\-]+$")]
    private static partial Regex ValidIdPattern();
}
