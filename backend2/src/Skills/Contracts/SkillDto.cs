using System.Text.Json.Serialization;
using Skills.Domain;
using Skills.Domain.Entities;

namespace Skills.Contracts;

public sealed record SkillDto
{
    [JsonPropertyName("id")]
    public required string Id { get; init; }

    [JsonPropertyName("name")]
    public required string Name { get; init; }

    [JsonPropertyName("description")]
    public string Description { get; init; } = string.Empty;

    [JsonPropertyName("stage")]
    public SkillStage Stage { get; init; }

    [JsonPropertyName("content")]
    public required string Content { get; init; }

    [JsonPropertyName("priority")]
    public int Priority { get; init; }

    [JsonPropertyName("version")]
    public int Version { get; init; }

    [JsonPropertyName("is_default")]
    public bool IsDefault { get; init; }

    [JsonPropertyName("is_enabled")]
    public bool IsEnabled { get; init; }

    [JsonPropertyName("tags")]
    public IReadOnlyList<string> Tags { get; init; } = [];

    [JsonPropertyName("estimated_tokens")]
    public int EstimatedTokens { get; init; }

    [JsonPropertyName("updated_at")]
    public DateTimeOffset UpdatedAt { get; init; }

    public static SkillDto FromEntity(Skill entity, int estimatedTokens) => new()
    {
        Id = entity.Id,
        Name = entity.Name,
        Description = entity.Description,
        Stage = entity.Stage,
        Content = entity.Content,
        Priority = entity.Priority,
        Version = entity.Version,
        IsDefault = entity.IsDefault,
        IsEnabled = entity.IsEnabled,
        Tags = entity.Tags,
        EstimatedTokens = estimatedTokens,
        UpdatedAt = entity.UpdatedAt
    };
}
