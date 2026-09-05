using System.Text.RegularExpressions;
using Kernel.Exceptions;

namespace ProductionContext.Domain.ValueObjects;

public readonly partial record struct ProjectSlug
{
    public const int MaxLength = 80;
    public string Value { get; }

    public ProjectSlug(string value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            throw new ValidationException("slug", "Slug проекта не может быть пустым.");
        }

        var normalized = SlugRegex().Replace(value.Trim().ToLowerInvariant(), "-").Trim('-');
        if (string.IsNullOrWhiteSpace(normalized))
        {
            normalized = "project";
        }

        if (normalized.Length > MaxLength)
        {
            normalized = normalized[..MaxLength].TrimEnd('-');
        }

        Value = normalized;
    }

    public static ProjectSlug FromTitle(string title) => new(title);

    public static implicit operator string(ProjectSlug slug) => slug.Value;
    public static implicit operator ProjectSlug(string value) => new(value);

    public override string ToString() => Value;

    [GeneratedRegex(@"[^a-z0-9]+")]
    private static partial Regex SlugRegex();
}
