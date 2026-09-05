using System.Text.RegularExpressions;
using Kernel.Exceptions;

namespace ProductionContext.Domain.ValueObjects;

public readonly partial record struct SceneId : IComparable<SceneId>
{
    public const int MaxLength = 64;
    public string Value { get; }

    public SceneId(string value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            throw new ValidationException("scene_id", "Идентификатор сцены не может быть пустым.");
        }

        var trimmed = value.Trim().ToLowerInvariant();
        if (trimmed.Length > MaxLength || !ValidPattern().IsMatch(trimmed))
        {
            throw new ValidationException("scene_id", $"Идентификатор сцены '{trimmed}' недопустим. Допускаются только латиница, цифры, дефис и подчеркивание (до {MaxLength} симв.).");
        }

        Value = trimmed;
    }

    public static SceneId Create(string sceneId) => new(sceneId);

    public static implicit operator string(SceneId id) => id.Value;
    public static implicit operator SceneId(string value) => new(value);

    public int CompareTo(SceneId other) => string.Compare(Value, other.Value, StringComparison.Ordinal);
    public override string ToString() => Value;

    [GeneratedRegex(@"^[a-z0-9_\-]+$")]
    private static partial Regex ValidPattern();
}
