using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Voice.Domain.Entities;
using Voice.Domain.Ports;
using Voice.Domain.ValueObjects;

namespace Voice.Infrastructure.Persistence;

public sealed class EfSpeakerProfileRepository : ISpeakerProfileRepository
{
    private readonly VoiceDbContext _context;
    private readonly ILogger<EfSpeakerProfileRepository> _logger;

    public EfSpeakerProfileRepository(VoiceDbContext context, ILogger<EfSpeakerProfileRepository> logger)
    {
        _context = context;
        _logger = logger;
    }

    public async Task<SpeakerProfile?> GetByIdAsync(string id, CancellationToken ct = default)
    {
        _logger.LogDebug("[SpeakerRepo] Поиск по ID: {Id}", id);
        return await _context.SpeakerProfiles.FirstOrDefaultAsync(s => s.Id == id, ct);
    }

    public async Task<SpeakerProfile?> GetBySpeakerIdAsync(SpeakerId speakerId, CancellationToken ct = default)
    {
        _logger.LogDebug("[SpeakerRepo] Поиск по SpeakerId: {SpeakerId}", speakerId.Value);
        var entityId = $"spk_{speakerId.Value}";
        return await _context.SpeakerProfiles.FirstOrDefaultAsync(s => s.Id == entityId, ct);
    }

    public async Task<IReadOnlyList<SpeakerProfile>> GetAllAsync(CancellationToken ct = default)
    {
        _logger.LogDebug("[SpeakerRepo] Загрузка всех профилей...");
        return await _context.SpeakerProfiles.AsNoTracking().ToListAsync(ct);
    }

    public async Task<IReadOnlyList<SpeakerProfile>> GetActiveAsync(CancellationToken ct = default)
    {
        _logger.LogDebug("[SpeakerRepo] Загрузка активных профилей...");
        return await _context.SpeakerProfiles.AsNoTracking()
            .Where(s => s.IsActive)
            .ToListAsync(ct);
    }

    public async Task AddAsync(SpeakerProfile profile, CancellationToken ct = default)
    {
        _logger.LogInformation("[SpeakerRepo] Добавление профиля: {Id} ({Name})", profile.Id, profile.Name);
        await _context.SpeakerProfiles.AddAsync(profile, ct);
    }

    public Task UpdateAsync(SpeakerProfile profile, CancellationToken ct = default)
    {
        _logger.LogDebug("[SpeakerRepo] Обновление профиля: {Id}", profile.Id);
        _context.SpeakerProfiles.Update(profile);
        return Task.CompletedTask;
    }

    public Task DeleteAsync(SpeakerProfile profile, CancellationToken ct = default)
    {
        _logger.LogInformation("[SpeakerRepo] Удаление профиля: {Id}", profile.Id);
        _context.SpeakerProfiles.Remove(profile);
        return Task.CompletedTask;
    }

    public async Task SaveChangesAsync(CancellationToken ct = default)
    {
        await _context.SaveChangesAsync(ct);
    }
}
