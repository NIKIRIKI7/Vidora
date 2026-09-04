using MediaContext.Domain;
using MediaContext.Domain.Entities;
using MediaContext.Domain.ValueObjects;

namespace MediaContext.Domain.Ports;

public interface IMediaAssetRepository
{
    Task<MediaAsset?> GetByIdAsync(MediaAssetId id, CancellationToken ct = default);
    Task<IReadOnlyList<MediaAsset>> GetAllAsync(MediaType? filterType = null, CancellationToken ct = default);
    Task<IReadOnlyList<MediaAsset>> GetPagedAsync(MediaType? filterType, int skip, int take, CancellationToken ct = default);
    Task<int> CountAsync(MediaType? filterType, CancellationToken ct = default);
    Task AddAsync(MediaAsset asset, CancellationToken ct = default);
    Task UpdateAsync(MediaAsset asset, CancellationToken ct = default);
    Task DeleteAsync(MediaAsset asset, CancellationToken ct = default);
    Task<bool> ExistsAsync(MediaAssetId id, CancellationToken ct = default);
    Task SaveChangesAsync(CancellationToken ct = default);
}
