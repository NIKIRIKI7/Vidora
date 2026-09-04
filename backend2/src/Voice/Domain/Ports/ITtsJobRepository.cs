using Voice.Domain.Entities;
using Voice.Domain.ValueObjects;

namespace Voice.Domain.Ports;

public interface ITtsJobRepository
{
    Task<TtsJob?> GetByIdAsync(TtsJobId id, CancellationToken ct = default);
    Task<IReadOnlyList<TtsJob>> GetByIdsAsync(IEnumerable<TtsJobId> ids, CancellationToken ct = default);
    Task AddAsync(TtsJob job, CancellationToken ct = default);
    Task UpdateAsync(TtsJob job, CancellationToken ct = default);
    Task SaveChangesAsync(CancellationToken ct = default);
}
