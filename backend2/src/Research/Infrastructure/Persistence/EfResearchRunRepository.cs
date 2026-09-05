using Microsoft.EntityFrameworkCore;
using Research.Domain.Entities;
using Research.Domain.Ports;
using Research.Domain.ValueObjects;

namespace Research.Infrastructure.Persistence;

public sealed class EfResearchRunRepository : IResearchRunRepository
{
    private readonly ResearchDbContext _context;

    public EfResearchRunRepository(ResearchDbContext context) => _context = context;

    public async Task<ResearchRun?> GetByIdAsync(ResearchRunId id, CancellationToken ct = default) =>
        await _context.ResearchRuns
            .Include(r => r.Candidates)
            .Include(r => r.Signals)
            .Include(r => r.Opportunities)
            .FirstOrDefaultAsync(r => r.Id == id, ct);

    public async Task<IReadOnlyList<ResearchRun>> GetAllAsync(int skip = 0, int take = 20, CancellationToken ct = default) =>
        await _context.ResearchRuns
            .Include(r => r.Candidates)
            .Include(r => r.Signals)
            .Include(r => r.Opportunities)
            .OrderByDescending(r => r.CreatedAt)
            .Skip(skip)
            .Take(take)
            .ToListAsync(ct);

    public Task<int> CountAsync(CancellationToken ct = default) =>
        _context.ResearchRuns.CountAsync(ct);

    public async Task AddAsync(ResearchRun run, CancellationToken ct = default) =>
        await _context.ResearchRuns.AddAsync(run, ct);

    public Task UpdateAsync(ResearchRun run, CancellationToken ct = default)
    {
        _context.ResearchRuns.Update(run);
        return Task.CompletedTask;
    }

    public Task DeleteAsync(ResearchRun run, CancellationToken ct = default)
    {
        _context.ResearchRuns.Remove(run);
        return Task.CompletedTask;
    }

    public Task SaveChangesAsync(CancellationToken ct = default) =>
        _context.SaveChangesAsync(ct);
}
