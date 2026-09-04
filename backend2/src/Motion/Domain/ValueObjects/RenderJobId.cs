using System.Text.RegularExpressions;
using Kernel.Exceptions;

namespace MotionContext.Domain.ValueObjects;

public readonly partial record struct RenderJobId : IComparable<RenderJobId>
{
    public const int MaxLength = 64;
    public string Value { get; }

    public RenderJobId(string value)
    {
        if (string.IsNullOrWhiteSpace(value))
            throw new ValidationException("render_job_id", "Идентификатор задачи рендера не может быть пустым.");

        var trimmed = value.Trim().ToLowerInvariant();
        if (trimmed.Length > MaxLength || !ValidPattern().IsMatch(trimmed))
            throw new ValidationException("render_job_id", $"Недопустимый формат ID задачи рендера: '{trimmed}'.");

        Value = trimmed;
    }

    public static RenderJobId New() => new($"rnd-{Guid.NewGuid():N}");

    public static bool TryParse(string? value, out RenderJobId id)
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

        id = new RenderJobId(trimmed);
        return true;
    }

    public static implicit operator string(RenderJobId id) => id.Value;
    public static implicit operator RenderJobId(string value) => new(value);
    public int CompareTo(RenderJobId other) => string.Compare(Value, other.Value, StringComparison.Ordinal);
    public override string ToString() => Value;

    [GeneratedRegex(@"^[a-z0-9_\-]+$")]
    private static partial Regex ValidPattern();
}
