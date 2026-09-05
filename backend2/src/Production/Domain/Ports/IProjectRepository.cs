using ProductionContext.Domain.Entities;
using ProductionContext.Domain.ValueObjects;

namespace ProductionContext.Domain.Ports;

public interface IProjectRepository
{
    Task<Project?> GetByIdAsync(ProjectId id, CancellationToken ct = default);
    Task<Project?> GetBySlugAsync(string slug, CancellationToken ct = default);
    Task<IReadOnlyList<Project>> GetAllAsync(CancellationToken ct = default);
    Task<IReadOnlyList<Project>> GetPagedAsync(int skip, int take, CancellationToken ct = default);
    Task<int> CountAsync(CancellationToken ct = default);
    Task AddAsync(Project project, CancellationToken ct = default);
    Task UpdateAsync(Project project, CancellationToken ct = default);
    Task DeleteAsync(Project project, CancellationToken ct = default);
    Task<bool> ExistsAsync(ProjectId id, CancellationToken ct = default);
    Task SaveChangesAsync(CancellationToken ct = default);
}
