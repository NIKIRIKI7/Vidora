using System.Text.RegularExpressions;
using Kernel.Exceptions;

namespace ProductionContext.Domain.ValueObjects;

public readonly partial record struct ProjectId : IComparable<ProjectId>
{
    public const int MaxLength = 64;
    public string Value { get; }

    public ProjectId(string value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            throw new ValidationException("project_id", "Идентификатор проекта не может быть пустым.");
        }

        var trimmed = value.Trim().ToLowerInvariant();
        if (trimmed.Length > MaxLength)
        {
            throw new ValidationException("project_id", $"Длина идентификатора проекта не должна превышать {MaxLength} символов.");
        }

        if (!ValidPattern().IsMatch(trimmed))
        {
            throw new ValidationException("project_id", "Идентификатор проекта может содержать только латинские буквы, цифры, дефисы и подчеркивания.");
        }

        Value = trimmed;
    }

    public static ProjectId New(string prefix = "proj") =>
        new($"{prefix}-{Guid.NewGuid():N}"[..Math.Min(MaxLength, prefix.Length + 33)]);

    public static bool TryParse(string? value, out ProjectId id)
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

        id = new ProjectId(trimmed);
        return true;
    }

    public static implicit operator string(ProjectId id) => id.Value;
    public static implicit operator ProjectId(string value) => new(value);

    public int CompareTo(ProjectId other) => string.Compare(Value, other.Value, StringComparison.Ordinal);
    public override string ToString() => Value;

    [GeneratedRegex(@"^[a-z0-9_\-]+$")]
    private static partial Regex ValidPattern();
}
