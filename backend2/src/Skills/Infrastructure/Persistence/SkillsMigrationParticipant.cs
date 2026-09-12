using Kernel.Platform.Persistence;
using Microsoft.EntityFrameworkCore;
using Skills.Infrastructure.Seeding;

namespace Skills.Infrastructure.Persistence;

public sealed class SkillsMigrationParticipant : IDatabaseMigrationParticipant
{
    private readonly SkillsDbContext _db;
    private readonly SkillsSeeder _seeder;

    public SkillsMigrationParticipant(SkillsDbContext db, SkillsSeeder seeder)
    {
        _db = db;
        _seeder = seeder;
    }

    public int Order => 1;
    public string ContextName => "Skills";

    public async Task MigrateAsync(CancellationToken ct = default)
    {
        await _db.MigrateWithShimAsync("skills", ct: ct);
        await NormalizeLegacyStageValuesAsync(_db, ct);
        await _seeder.SeedAsync(cancellationToken: ct);
    }

    private static async Task NormalizeLegacyStageValuesAsync(SkillsDbContext db, CancellationToken ct)
    {
        var connection = db.Database.GetDbConnection();
        if (connection.State != System.Data.ConnectionState.Open)
        {
            await db.Database.OpenConnectionAsync(ct);
        }

        using var normalizeCmd = connection.CreateCommand();
        normalizeCmd.CommandText = """
            UPDATE skills SET Stage = 'scene_generation' WHERE Stage = 'SceneGeneration';
            UPDATE skills SET Stage = 'hook_analysis' WHERE Stage = 'HookAnalysis';
            UPDATE skills SET Stage = 'script_drafting' WHERE Stage = 'ScriptDrafting';
            UPDATE skills SET Stage = 'visual_analysis' WHERE Stage = 'VisualAnalysis';
            UPDATE skills SET Stage = 'trend_research' WHERE Stage = 'TrendResearch';
            """;
        await normalizeCmd.ExecuteNonQueryAsync(ct);
    }
}
