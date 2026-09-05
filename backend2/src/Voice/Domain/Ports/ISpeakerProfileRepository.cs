using Voice.Domain.Entities;
using Voice.Domain.ValueObjects;

namespace Voice.Domain.Ports;

public interface ISpeakerProfileRepository
{
    Task<SpeakerProfile?> GetByIdAsync(string id, CancellationToken ct = default);
    Task<SpeakerProfile?> GetBySpeakerIdAsync(SpeakerId speakerId, CancellationToken ct = default);
    Task<IReadOnlyList<SpeakerProfile>> GetAllAsync(CancellationToken ct = default);
    Task<IReadOnlyList<SpeakerProfile>> GetActiveAsync(CancellationToken ct = default);
    Task AddAsync(SpeakerProfile profile, CancellationToken ct = default);
    Task UpdateAsync(SpeakerProfile profile, CancellationToken ct = default);
    Task DeleteAsync(SpeakerProfile profile, CancellationToken ct = default);
    Task SaveChangesAsync(CancellationToken ct = default);
}
