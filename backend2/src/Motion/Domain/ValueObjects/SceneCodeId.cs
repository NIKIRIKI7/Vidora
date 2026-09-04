using System.Text.RegularExpressions;
using Kernel.Exceptions;

namespace MotionContext.Domain.ValueObjects;

public readonly partial record struct SceneCodeId : IComparable<SceneCodeId>
{
    public const int MaxLength = 64;
    public string Value { get; }

    public SceneCodeId(string value)
    {
        if (string.IsNullOrWhiteSpace(value))
            throw new ValidationException("scene_code_id", "Идентификатор кода сцены не может быть пустым.");

        var trimmed = value.Trim().ToLowerInvariant();
        if (trimmed.Length > MaxLength)
            throw new ValidationException("scene_code_id", $"Длина ID кода сцены не может превышать {MaxLength} символов.");

        if (!ValidPattern().IsMatch(trimmed))
            throw new ValidationException("scene_code_id", "Идентификатор может содержать только латиницу, цифры, дефисы и подчеркивания.");

        Value = trimmed;
    }

    public static SceneCodeId New(string prefix = "sc") =>
        new($"{prefix}-{Guid.NewGuid():N}"[..Math.Min(MaxLength, prefix.Length + 33)]);

    public static bool TryParse(string? value, out SceneCodeId id)
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

        id = new SceneCodeId(trimmed);
        return true;
    }

    public static implicit operator string(SceneCodeId id) => id.Value;
    public static implicit operator SceneCodeId(string value) => new(value);
    public int CompareTo(SceneCodeId other) => string.Compare(Value, other.Value, StringComparison.Ordinal);
    public override string ToString() => Value;

    [GeneratedRegex(@"^[a-z0-9_\-]+$")]
    private static partial Regex ValidPattern();
}
