using Kernel.Exceptions;

namespace Skills.Domain.ValueObjects;

public readonly record struct SkillVersion : IComparable<SkillVersion>
{
    public static readonly SkillVersion Initial = new(1);

    public int Value { get; }

    public SkillVersion(int value)
    {
        if (value < 1)
            throw new ValidationException("version", $"Версия скила не может быть меньше 1. Передано: {value}.");

        Value = value;
    }

    public SkillVersion Next() => new(Value + 1);

    public static implicit operator int(SkillVersion version) => version.Value;
    public static implicit operator SkillVersion(int value) => new(value);

    public static bool operator <(SkillVersion left, SkillVersion right) => left.Value < right.Value;
    public static bool operator >(SkillVersion left, SkillVersion right) => left.Value > right.Value;
    public static bool operator <=(SkillVersion left, SkillVersion right) => left.Value <= right.Value;
    public static bool operator >=(SkillVersion left, SkillVersion right) => left.Value >= right.Value;

    public int CompareTo(SkillVersion other) => Value.CompareTo(other.Value);
    public override string ToString() => Value.ToString();
}
