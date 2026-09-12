using Kernel.Platform.Persistence;

namespace Research.Infrastructure.Persistence;

public sealed class ResearchMigrationParticipant : IDatabaseMigrationParticipant
{
    private readonly ResearchDbContext _db;

    public ResearchMigrationParticipant(ResearchDbContext db) => _db = db;

    public int Order => 7;
    public string ContextName => "Research";

    public Task MigrateAsync(CancellationToken ct = default) =>
        _db.MigrateWithShimAsync("research_runs", ct: ct);
}
