using Kernel.Exceptions;

namespace Skills.Domain.ValueObjects;

public readonly record struct SkillPriority : IComparable<SkillPriority>
{
    public const int MinValue = 0;
    public const int MaxValue = 1000;

    public static readonly SkillPriority Low = new(10);
    public static readonly SkillPriority Normal = new(100);
    public static readonly SkillPriority High = new(500);
    public static readonly SkillPriority Critical = new(1000);

    public int Value { get; }

    public SkillPriority(int value)
    {
        if (value is < MinValue or > MaxValue)
        {
            throw new ValidationException("priority",
                $"Приоритет скила должен находиться в диапазоне от {MinValue} до {MaxValue}. Передано: {value}.");
        }

        Value = value;
    }

    public static implicit operator int(SkillPriority priority) => priority.Value;
    public static implicit operator SkillPriority(int value) => new(value);

    public static bool operator <(SkillPriority left, SkillPriority right) => left.Value < right.Value;
    public static bool operator >(SkillPriority left, SkillPriority right) => left.Value > right.Value;
    public static bool operator <=(SkillPriority left, SkillPriority right) => left.Value <= right.Value;
    public static bool operator >=(SkillPriority left, SkillPriority right) => left.Value >= right.Value;

    public int CompareTo(SkillPriority other) => Value.CompareTo(other.Value);
    public override string ToString() => Value.ToString();
}
