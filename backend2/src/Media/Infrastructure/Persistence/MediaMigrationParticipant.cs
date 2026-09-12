using Kernel.Platform.Persistence;

namespace MediaContext.Infrastructure.Persistence;

public sealed class MediaMigrationParticipant : IDatabaseMigrationParticipant
{
    private readonly MediaDbContext _db;

    public MediaMigrationParticipant(MediaDbContext db) => _db = db;

    public int Order => 3;
    public string ContextName => "Media";

    public Task MigrateAsync(CancellationToken ct = default) =>
        _db.MigrateWithShimAsync("media_assets", ct: ct);
}
