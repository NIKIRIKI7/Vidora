using Research.Domain.Entities;
using Research.Domain.ValueObjects;

namespace Research.Domain.Ports;

public interface IResearchRunRepository
{
    Task<ResearchRun?> GetByIdAsync(ResearchRunId id, CancellationToken ct = default);
    Task<IReadOnlyList<ResearchRun>> GetAllAsync(int skip = 0, int take = 20, CancellationToken ct = default);
    Task<int> CountAsync(CancellationToken ct = default);
    Task AddAsync(ResearchRun run, CancellationToken ct = default);
    Task UpdateAsync(ResearchRun run, CancellationToken ct = default);
    Task DeleteAsync(ResearchRun run, CancellationToken ct = default);
    Task SaveChangesAsync(CancellationToken ct = default);
}
