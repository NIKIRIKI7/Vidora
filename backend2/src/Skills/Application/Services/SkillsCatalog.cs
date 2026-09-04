using Skills.Contracts;
using Skills.Domain;
using Skills.Domain.Entities;
using Skills.Domain.Ports;
using Skills.Domain.Services;

namespace Skills.Application.Services;

public sealed class SkillsCatalog : ISkillsCatalog
{
    private readonly ISkillRepository _repository;
    private readonly PromptBuilder _promptBuilder;

    public SkillsCatalog(ISkillRepository repository, PromptBuilder promptBuilder)
    {
        _repository = repository;
        _promptBuilder = promptBuilder;
    }

    public async Task<SkillBundleDto> GetSkillBundleForStageAsync(
        SkillStage stage,
        int? maxTokenLimit = null,
        string? customHeaderInstructions = null,
        CancellationToken cancellationToken = default)
    {
        var skills = await _repository.GetByStageAsync(stage, onlyEnabled: true, cancellationToken);
        var composition = _promptBuilder.BuildBundle(skills, maxTokenLimit, customHeaderInstructions);

        return new SkillBundleDto
        {
            Stage = stage,
            SystemPrompt = composition.ComposedPrompt,
            IncludedSkills = composition.IncludedSkills.Select(MapSkillDto).ToList(),
            OmittedSkills = composition.OmittedSkills.Select(MapSkillDto).ToList(),
            TotalEstimatedTokens = composition.TotalEstimatedTokens
        };
    }

    public async Task<IReadOnlyList<SkillDto>> GetSkillsByStageAsync(
        SkillStage stage,
        bool onlyEnabled = true,
        CancellationToken cancellationToken = default)
    {
        var skills = await _repository.GetByStageAsync(stage, onlyEnabled, cancellationToken);
        return skills.Select(MapSkillDto).ToList();
    }

    public async Task<SkillDto?> GetSkillByIdAsync(
        string id,
        CancellationToken cancellationToken = default)
    {
        var skill = await _repository.GetByIdAsync(id, cancellationToken);
        return skill == null ? null : MapSkillDto(skill);
    }

    private static SkillDto MapSkillDto(Skill s) => SkillDto.FromEntity(s, s.Content.EstimateTokens());
}
