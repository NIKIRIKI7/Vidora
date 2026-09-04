using Kernel.Exceptions;

namespace Skills.Domain.ValueObjects;

/// <summary>
/// Объект-значение названия скила с валидацией длины и непустого содержимого.
/// </summary>
public readonly record struct SkillName : IComparable<SkillName>
{
    public const int MaxLength = 128;

    public string Value { get; }

    public SkillName(string value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            throw new ValidationException("name", "Название скила обязательно для заполнения.");
        }

        var trimmed = value.Trim();
        if (trimmed.Length > MaxLength)
        {
            throw new ValidationException("name", $"Название скила не должно превышать {MaxLength} символов.");
        }

        Value = trimmed;
    }

    public static implicit operator string(SkillName name) => name.Value;
    public static implicit operator SkillName(string value) => new(value);

    public int CompareTo(SkillName other) => string.Compare(Value, other.Value, StringComparison.OrdinalIgnoreCase);

    public override string ToString() => Value;
}
