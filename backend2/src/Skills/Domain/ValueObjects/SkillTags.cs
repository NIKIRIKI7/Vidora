using System.Collections;
using System.Text.Json;

namespace Skills.Domain.ValueObjects;

public sealed record SkillTags : IReadOnlyList<string>
{
    public static readonly SkillTags Empty = new([]);

    private readonly List<string> _tags;

    public SkillTags(IEnumerable<string>? tags)
    {
        _tags = tags?
            .Select(t => t.Trim().ToLowerInvariant())
            .Where(t => !string.IsNullOrWhiteSpace(t))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .OrderBy(t => t, StringComparer.Ordinal)
            .ToList() ?? [];
    }

    public int Count => _tags.Count;
    public string this[int index] => _tags[index];

    public bool Contains(string tag) =>
        !string.IsNullOrWhiteSpace(tag) && _tags.Contains(tag.Trim().ToLowerInvariant());

    public IEnumerator<string> GetEnumerator() => _tags.GetEnumerator();
    IEnumerator IEnumerable.GetEnumerator() => GetEnumerator();

    public static SkillTags FromCsv(string? csv)
    {
        if (string.IsNullOrWhiteSpace(csv)) return Empty;
        return new SkillTags(csv.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries));
    }

    public static SkillTags FromJson(string? json)
    {
        if (string.IsNullOrWhiteSpace(json)) return Empty;
        try
        {
            var list = JsonSerializer.Deserialize<List<string>>(json);
            return new SkillTags(list);
        }
        catch
        {
            return Empty;
        }
    }

    public string ToJson() => JsonSerializer.Serialize(_tags);

    public override string ToString() => string.Join(", ", _tags);

    public static implicit operator List<string>(SkillTags tags) => [.. tags._tags];
}
