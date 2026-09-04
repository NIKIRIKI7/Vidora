using Kernel.Exceptions;

namespace MotionContext.Domain.ValueObjects;

public readonly record struct RevisionNumber : IComparable<RevisionNumber>
{
    public static readonly RevisionNumber Initial = new(1);
    public int Value { get; }

    public RevisionNumber(int value)
    {
        if (value < 1)
            throw new ValidationException("revision_number", $"Номер ревизии не может быть меньше 1. Передано: {value}");

        Value = value;
    }

    public RevisionNumber Next() => new(Value + 1);

    public static implicit operator int(RevisionNumber rev) => rev.Value;
    public static implicit operator RevisionNumber(int value) => new(value);
    public int CompareTo(RevisionNumber other) => Value.CompareTo(other.Value);
    public override string ToString() => Value.ToString();
}
