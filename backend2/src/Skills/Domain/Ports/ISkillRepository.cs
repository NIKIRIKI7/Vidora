using Skills.Domain.Entities;

namespace Skills.Domain.Ports;

public interface ISkillRepository
{
    Task<Skill?> GetByIdAsync(string id, CancellationToken cancellationToken = default);
    Task<IReadOnlyList<Skill>> GetByStageAsync(SkillStage stage, bool onlyEnabled = true, CancellationToken cancellationToken = default);
    Task<IReadOnlyList<Skill>> GetAllAsync(CancellationToken cancellationToken = default);
    Task AddAsync(Skill skill, CancellationToken cancellationToken = default);
    Task UpdateAsync(Skill skill, CancellationToken cancellationToken = default);
    Task DeleteAsync(Skill skill, CancellationToken cancellationToken = default);
    Task<bool> ExistsAsync(string id, CancellationToken cancellationToken = default);
    Task SaveChangesAsync(CancellationToken cancellationToken = default);
}
