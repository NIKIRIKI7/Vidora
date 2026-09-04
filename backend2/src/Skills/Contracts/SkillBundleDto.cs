using System.Text.Json.Serialization;
using Skills.Domain;

namespace Skills.Contracts;

public sealed record SkillBundleDto
{
    [JsonPropertyName("stage")]
    public SkillStage Stage { get; init; }

    [JsonPropertyName("system_prompt")]
    public string SystemPrompt { get; init; } = string.Empty;

    [JsonPropertyName("included_skills")]
    public IReadOnlyList<SkillDto> IncludedSkills { get; init; } = [];

    [JsonPropertyName("omitted_skills")]
    public IReadOnlyList<SkillDto> OmittedSkills { get; init; } = [];

    [JsonPropertyName("total_estimated_tokens")]
    public int TotalEstimatedTokens { get; init; }
}
