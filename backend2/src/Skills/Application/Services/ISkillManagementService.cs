using Skills.Application.Commands;
using Skills.Application.Queries;
using Skills.Contracts;
using Skills.Domain;

namespace Skills.Application.Services;

public interface ISkillManagementService
{
    Task<IReadOnlyList<SkillDto>> GetAllSkillsAsync(CancellationToken ct = default);
    Task<IReadOnlyList<SkillDto>> GetAllSkillsAsync(GetAllSkillsQuery query, CancellationToken ct = default);
    Task<IReadOnlyList<SkillDto>> GetSkillsByStageAsync(SkillStage stage, bool onlyEnabled = false, CancellationToken ct = default);
    Task<IReadOnlyList<SkillDto>> GetSkillsByStageAsync(GetSkillsByStageQuery query, CancellationToken ct = default);
    Task<SkillDto> GetSkillByIdAsync(string id, CancellationToken ct = default);
    Task<SkillDto> GetSkillByIdAsync(GetSkillByIdQuery query, CancellationToken ct = default);
    Task<SkillDto> CreateCustomSkillAsync(CreateCustomSkillCommand command, CancellationToken ct = default);
    Task<SkillDto> UpdateSkillAsync(UpdateSkillCommand command, CancellationToken ct = default);
    Task<SkillDto> ResetSkillToDefaultAsync(ResetSkillToDefaultCommand command, CancellationToken ct = default);
    Task DeleteSkillAsync(DeleteSkillCommand command, CancellationToken ct = default);
}
