using System.Text.Json.Serialization;

namespace Skills.Infrastructure.Seeding;

public sealed record SkillSeedModel
{
    [JsonPropertyName("id")]
    public required string Id { get; init; }

    [JsonPropertyName("name")]
    public required string Name { get; init; }

    [JsonPropertyName("description")]
    public string Description { get; init; } = string.Empty;

    [JsonPropertyName("stage")]
    public required string Stage { get; init; }

    [JsonPropertyName("content")]
    public required string Content { get; init; }

    [JsonPropertyName("priority")]
    public int Priority { get; init; } = 100;

    [JsonPropertyName("tags")]
    public List<string> Tags { get; init; } = [];
}
