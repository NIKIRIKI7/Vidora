using Kernel.Platform.Persistence;
using Microsoft.EntityFrameworkCore;
using Voice.Domain;
using Voice.Domain.Entities;
using Voice.Domain.ValueObjects;

namespace Voice.Infrastructure.Persistence;

public sealed class VoiceMigrationParticipant : IDatabaseMigrationParticipant
{
    private readonly VoiceDbContext _db;

    public VoiceMigrationParticipant(VoiceDbContext db) => _db = db;

    public int Order => 4;
    public string ContextName => "Voice";

    public async Task MigrateAsync(CancellationToken ct = default)
    {
        await _db.MigrateWithShimAsync("voice_speaker_profiles", ct: ct);
        await SeedVoiceDefaultsAsync(_db, ct);
    }

    private static async Task SeedVoiceDefaultsAsync(VoiceDbContext db, CancellationToken ct)
    {
        if (await db.SpeakerProfiles.AnyAsync(ct)) return;

        var defaults = new[]
        {
            SpeakerProfile.CreateBuiltIn(new SpeakerId("alloy"), "Alloy", VoiceEngineType.CloudOpenAi, "multilingual", "Neutral"),
            SpeakerProfile.CreateBuiltIn(new SpeakerId("echo"), "Echo", VoiceEngineType.CloudOpenAi, "multilingual", "Male"),
            SpeakerProfile.CreateBuiltIn(new SpeakerId("shimmer"), "Shimmer", VoiceEngineType.CloudOpenAi, "multilingual", "Female"),
            SpeakerProfile.CreateBuiltIn(new SpeakerId("male-qn-qingse"), "QingSe", VoiceEngineType.CloudMiniMax, "multilingual", "Male")
        };

        await db.SpeakerProfiles.AddRangeAsync(defaults, ct);
        await db.SaveChangesAsync(ct);
    }
}
