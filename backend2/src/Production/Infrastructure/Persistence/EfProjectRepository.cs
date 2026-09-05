using Microsoft.EntityFrameworkCore;
using ProductionContext.Domain.Entities;
using ProductionContext.Domain.Ports;
using ProductionContext.Domain.ValueObjects;

namespace ProductionContext.Infrastructure.Persistence;

public sealed class EfProjectRepository : IProjectRepository
{
    private readonly ProductionDbContext _context;

    public EfProjectRepository(ProductionDbContext context)
    {
        _context = context;
    }

    public async Task<Project?> GetByIdAsync(ProjectId id, CancellationToken ct = default) =>
        await _context.Projects
            .Include(p => p.Scenes)
            .ThenInclude(s => s.Fragments)
            .FirstOrDefaultAsync(p => p.Id == id, ct);

    public async Task<Project?> GetBySlugAsync(string slug, CancellationToken ct = default) =>
        await _context.Projects
            .Include(p => p.Scenes)
            .ThenInclude(s => s.Fragments)
            .FirstOrDefaultAsync(p => p.Slug == new ProjectSlug(slug), ct);

    public async Task<IReadOnlyList<Project>> GetAllAsync(CancellationToken ct = default) =>
        await _context.Projects
            .Include(p => p.Scenes)
            .OrderByDescending(p => p.CreatedAt)
            .ToListAsync(ct);

    public async Task<IReadOnlyList<Project>> GetPagedAsync(int skip, int take, CancellationToken ct = default) =>
        await _context.Projects
            .Include(p => p.Scenes)
            .OrderByDescending(p => p.CreatedAt)
            .Skip(skip)
            .Take(take)
            .ToListAsync(ct);

    public Task<int> CountAsync(CancellationToken ct = default) =>
        _context.Projects.CountAsync(ct);

    public async Task AddAsync(Project project, CancellationToken ct = default) =>
        await _context.Projects.AddAsync(project, ct);

    public Task UpdateAsync(Project project, CancellationToken ct = default)
    {
        _context.Projects.Update(project);
        return Task.CompletedTask;
    }

    public Task DeleteAsync(Project project, CancellationToken ct = default)
    {
        _context.Projects.Remove(project);
        return Task.CompletedTask;
    }

    public Task<bool> ExistsAsync(ProjectId id, CancellationToken ct = default) =>
        _context.Projects.AnyAsync(p => p.Id == id, ct);

    public Task SaveChangesAsync(CancellationToken ct = default) =>
        _context.SaveChangesAsync(ct);
}
