using Microsoft.EntityFrameworkCore;
using Skills.Domain;
using Skills.Domain.Entities;
using Skills.Domain.Ports;
using Skills.Domain.ValueObjects;

namespace Skills.Infrastructure.Persistence;

public sealed class EfSkillRepository : ISkillRepository
{
    private readonly SkillsDbContext _context;

    public EfSkillRepository(SkillsDbContext context)
    {
        _context = context;
    }

    public async Task<Skill?> GetByIdAsync(string id, CancellationToken cancellationToken = default)
    {
        if (!SkillId.TryParse(id, out var skillId))
        {
            return null;
        }

        return await _context.Skills.FirstOrDefaultAsync(s => s.Id == skillId, cancellationToken);
    }

    public async Task<IReadOnlyList<Skill>> GetByStageAsync(SkillStage stage, bool onlyEnabled = true, CancellationToken cancellationToken = default)
    {
        var query = _context.Skills.Where(s => s.Stage == stage);
        if (onlyEnabled)
        {
            query = query.Where(s => s.IsEnabled);
        }

        return await query.OrderByDescending(s => s.Priority).ToListAsync(cancellationToken);
    }

    public async Task<IReadOnlyList<Skill>> GetAllAsync(CancellationToken cancellationToken = default)
    {
        return await _context.Skills
            .OrderBy(s => s.Stage)
            .ThenByDescending(s => s.Priority)
            .ToListAsync(cancellationToken);
    }

    public async Task AddAsync(Skill skill, CancellationToken cancellationToken = default)
    {
        await _context.Skills.AddAsync(skill, cancellationToken);
    }

    public Task UpdateAsync(Skill skill, CancellationToken cancellationToken = default)
    {
        _context.Skills.Update(skill);
        return Task.CompletedTask;
    }

    public Task DeleteAsync(Skill skill, CancellationToken cancellationToken = default)
    {
        _context.Skills.Remove(skill);
        return Task.CompletedTask;
    }

    public async Task<bool> ExistsAsync(string id, CancellationToken cancellationToken = default)
    {
        if (!SkillId.TryParse(id, out var skillId))
        {
            return false;
        }

        return await _context.Skills.AnyAsync(s => s.Id == skillId, cancellationToken);
    }

    public async Task SaveChangesAsync(CancellationToken cancellationToken = default)
    {
        await _context.SaveChangesAsync(cancellationToken);
    }
}
