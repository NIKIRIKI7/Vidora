using MediaContext.Domain;
using MediaContext.Domain.Entities;
using MediaContext.Domain.Ports;
using MediaContext.Domain.ValueObjects;
using Microsoft.EntityFrameworkCore;

namespace MediaContext.Infrastructure.Persistence;

public sealed class EfMediaAssetRepository : IMediaAssetRepository
{
    private readonly MediaDbContext _context;

    public EfMediaAssetRepository(MediaDbContext context)
    {
        _context = context;
    }

    public async Task<MediaAsset?> GetByIdAsync(MediaAssetId id, CancellationToken ct = default) =>
        await _context.MediaAssets.FirstOrDefaultAsync(m => m.Id == id, ct);

    public async Task<IReadOnlyList<MediaAsset>> GetAllAsync(MediaType? filterType = null, CancellationToken ct = default)
    {
        var query = _context.MediaAssets.AsQueryable();
        if (filterType.HasValue)
        {
            query = query.Where(m => m.Type == filterType.Value);
        }

        return await query.OrderByDescending(m => m.CreatedAt).ToListAsync(ct);
    }

    public async Task<IReadOnlyList<MediaAsset>> GetPagedAsync(MediaType? filterType, int skip, int take, CancellationToken ct = default)
    {
        var query = _context.MediaAssets.AsQueryable();
        if (filterType.HasValue)
        {
            query = query.Where(m => m.Type == filterType.Value);
        }

        return await query
            .OrderByDescending(m => m.CreatedAt)
            .Skip(skip)
            .Take(take)
            .ToListAsync(ct);
    }

    public async Task<int> CountAsync(MediaType? filterType, CancellationToken ct = default)
    {
        var query = _context.MediaAssets.AsQueryable();
        if (filterType.HasValue)
        {
            query = query.Where(m => m.Type == filterType.Value);
        }

        return await query.CountAsync(ct);
    }

    public async Task AddAsync(MediaAsset asset, CancellationToken ct = default) =>
        await _context.MediaAssets.AddAsync(asset, ct);

    public Task UpdateAsync(MediaAsset asset, CancellationToken ct = default)
    {
        _context.MediaAssets.Update(asset);
        return Task.CompletedTask;
    }

    public Task DeleteAsync(MediaAsset asset, CancellationToken ct = default)
    {
        _context.MediaAssets.Remove(asset);
        return Task.CompletedTask;
    }

    public async Task<bool> ExistsAsync(MediaAssetId id, CancellationToken ct = default) =>
        await _context.MediaAssets.AnyAsync(m => m.Id == id, ct);

    public async Task SaveChangesAsync(CancellationToken ct = default) =>
        await _context.SaveChangesAsync(ct);
}
