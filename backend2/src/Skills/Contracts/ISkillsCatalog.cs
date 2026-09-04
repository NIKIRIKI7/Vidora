using Skills.Domain;

namespace Skills.Contracts;

/// <summary>
/// Публичный фасад каталога скилов. Единственная точка взаимодействия других Bounded Contexts с модулем Skills.
/// </summary>
public interface ISkillsCatalog
{
    Task<SkillBundleDto> GetSkillBundleForStageAsync(
        SkillStage stage,
        int? maxTokenLimit = null,
        string? customHeaderInstructions = null,
        CancellationToken cancellationToken = default);

    Task<IReadOnlyList<SkillDto>> GetSkillsByStageAsync(
        SkillStage stage,
        bool onlyEnabled = true,
        CancellationToken cancellationToken = default);

    Task<SkillDto?> GetSkillByIdAsync(
        string id,
        CancellationToken cancellationToken = default);
}
