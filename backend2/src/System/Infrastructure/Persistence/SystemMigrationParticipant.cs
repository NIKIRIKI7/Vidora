using Kernel.Platform.Persistence;
using SystemContext.Infrastructure.Seeding;

namespace SystemContext.Infrastructure.Persistence;

public sealed class SystemMigrationParticipant : IDatabaseMigrationParticipant
{
    private readonly SystemDbContext _db;
    private readonly SystemDatabaseSeeder _seeder;

    public SystemMigrationParticipant(SystemDbContext db, SystemDatabaseSeeder seeder)
    {
        _db = db;
        _seeder = seeder;
    }

    public int Order => 2;
    public string ContextName => "System";

    public async Task MigrateAsync(CancellationToken ct = default)
    {
        await _db.MigrateWithShimAsync("system_settings", ct: ct);
        await _seeder.SeedAsync(ct);
    }
}
