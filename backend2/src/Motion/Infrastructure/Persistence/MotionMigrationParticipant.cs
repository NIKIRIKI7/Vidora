using Kernel.Platform.Persistence;

namespace MotionContext.Infrastructure.Persistence;

public sealed class MotionMigrationParticipant : IDatabaseMigrationParticipant
{
    private readonly MotionDbContext _db;

    public MotionMigrationParticipant(MotionDbContext db) => _db = db;

    public int Order => 5;
    public string ContextName => "Motion";

    public Task MigrateAsync(CancellationToken ct = default) =>
        _db.MigrateWithShimAsync("motion_scene_codes", ct: ct);
}
