using System.Data.Common;
using Kernel.Platform.Persistence;
using MediaContext.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using MotionContext.Infrastructure.Persistence;
using ProductionContext.Infrastructure.Persistence;
using Research.Infrastructure.Persistence;
using Skills.Infrastructure.Persistence;
using Skills.Infrastructure.Seeding;
using SystemContext.Infrastructure.Persistence;
using SystemContext.Infrastructure.Seeding;
using Voice.Domain;
using Voice.Domain.Entities;
using Voice.Domain.ValueObjects;
using Voice.Infrastructure.Persistence;

namespace Kernel.Platform.Persistence;

public sealed class DatabaseMigrationManager
{
    private readonly SkillsDbContext _skillsDb;
    private readonly SystemDbContext _systemDb;
    private readonly MediaDbContext _mediaDb;
    private readonly VoiceDbContext _voiceDb;
    private readonly MotionDbContext _motionDb;
    private readonly ProductionDbContext _productionDb;
    private readonly ResearchDbContext _researchDb;
    private readonly SkillsSeeder _skillsSeeder;
    private readonly SystemDatabaseSeeder _systemSeeder;
    private readonly ILogger<DatabaseMigrationManager> _logger;

    public DatabaseMigrationManager(
        SkillsDbContext skillsDb,
        SystemDbContext systemDb,
        MediaDbContext mediaDb,
        VoiceDbContext voiceDb,
        MotionDbContext motionDb,
        ProductionDbContext productionDb,
        ResearchDbContext researchDb,
        SkillsSeeder skillsSeeder,
        SystemDatabaseSeeder systemSeeder,
        ILogger<DatabaseMigrationManager> logger)
    {
        _skillsDb = skillsDb;
        _systemDb = systemDb;
        _mediaDb = mediaDb;
        _voiceDb = voiceDb;
        _motionDb = motionDb;
        _productionDb = productionDb;
        _researchDb = researchDb;
        _skillsSeeder = skillsSeeder;
        _systemSeeder = systemSeeder;
        _logger = logger;
    }

    public async Task ApplyAllMigrationsAsync(CancellationToken ct = default)
    {
        _logger.LogInformation("==================================================");
        _logger.LogInformation("[CLI Migration] Старт применения миграций и схем БД...");
        _logger.LogInformation("==================================================");

        // 1. Skills DB (has legacy normalization logic)
        _logger.LogInformation("[1/7] Миграция skills.db...");
        await _skillsDb.ResetMigrationLocksAsync(ct);
        await EnsureMigrationsHistoryForLegacyDbAsync(_skillsDb, ct);
        await _skillsDb.Database.MigrateAsync(ct);
        await _skillsDb.ConfigureSqlitePragmasAsync(ct);
        await NormalizeLegacyStageValuesAsync(_skillsDb, ct);
        await _skillsSeeder.SeedAsync(cancellationToken: ct);

        // 2. System DB
        _logger.LogInformation("[2/7] Миграция system.db...");
        await _systemDb.ResetMigrationLocksAsync(ct);
        await _systemDb.Database.MigrateAsync(ct);
        await _systemDb.ConfigureSqlitePragmasAsync(ct);
        await _systemSeeder.SeedAsync(ct);

        // 3. Media DB
        _logger.LogInformation("[3/7] Миграция media.db...");
        await _mediaDb.ResetMigrationLocksAsync(ct);
        await _mediaDb.Database.MigrateAsync(ct);
        await _mediaDb.ConfigureSqlitePragmasAsync(ct);

        // 4. Voice DB
        _logger.LogInformation("[4/7] Применение схемы voice.db...");
        await _voiceDb.ResetMigrationLocksAsync(ct);
        await _voiceDb.Database.EnsureCreatedAsync(ct);
        await _voiceDb.ConfigureSqlitePragmasAsync(ct);
        await SeedVoiceDefaultsAsync(_voiceDb, ct);

        // 5. Motion DB
        _logger.LogInformation("[5/7] Применение схемы motion.db...");
        await _motionDb.ResetMigrationLocksAsync(ct);
        await _motionDb.Database.EnsureCreatedAsync(ct);
        await _motionDb.ConfigureSqlitePragmasAsync(ct);

        // 6. Production DB
        _logger.LogInformation("[6/7] Применение схемы production.db...");
        await _productionDb.ResetMigrationLocksAsync(ct);
        await _productionDb.Database.EnsureCreatedAsync(ct);
        await _productionDb.ConfigureSqlitePragmasAsync(ct);
        await EnsureProductionScenarioEngineColumnsAsync(_productionDb, ct);

        // 7. Research DB
        _logger.LogInformation("[7/7] Применение схемы research.db...");
        await _researchDb.ResetMigrationLocksAsync(ct);
        await _researchDb.Database.EnsureCreatedAsync(ct);
        await _researchDb.ConfigureSqlitePragmasAsync(ct);

        _logger.LogInformation("==================================================");
        _logger.LogInformation("[CLI Migration] Все базы данных успешно подготовлены!");
        _logger.LogInformation("==================================================");
    }

    /// <summary>
    /// Idempotently добавляет колонки Scenario Engine в существующую таблицу фрагментов
    /// (EnsureCreated не изменяет уже созданные SQLite-таблицы).
    /// </summary>
    private static async Task EnsureProductionScenarioEngineColumnsAsync(ProductionDbContext db, CancellationToken ct)
    {
        const string table = "production_scene_fragments";
        var connection = db.Database.GetDbConnection();
        if (connection.State != System.Data.ConnectionState.Open)
        {
            await db.Database.OpenConnectionAsync(ct);
        }

        var existing = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        using (var readCmd = connection.CreateCommand())
        {
            readCmd.CommandText = $"PRAGMA table_info({table});";
            using var reader = await readCmd.ExecuteReaderAsync(ct);
            while (await reader.ReadAsync(ct))
            {
                existing.Add(reader.GetString(1));
            }
        }

        (string Name, string Definition)[] columns =
        [
            ("ContentHash", "TEXT NOT NULL DEFAULT ''"),
            ("DeclaredStartSeconds", "REAL NOT NULL DEFAULT 0"),
            ("DeclaredEndSeconds", "REAL NOT NULL DEFAULT 0"),
            ("IsMediaMissing", "INTEGER NOT NULL DEFAULT 0"),
            ("IsAnimationMissing", "INTEGER NOT NULL DEFAULT 0")
        ];

        foreach (var column in columns)
        {
            if (existing.Contains(column.Name)) continue;

            await using var alterCmd = connection.CreateCommand();
            alterCmd.CommandText = $"ALTER TABLE {table} ADD COLUMN \"{column.Name}\" {column.Definition};";
            await alterCmd.ExecuteNonQueryAsync(ct);
        }
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

    // Skills legacy normalization (extracted from SkillsSeederHostedService)
    private static async Task EnsureMigrationsHistoryForLegacyDbAsync(SkillsDbContext db, CancellationToken ct)
    {
        var connection = db.Database.GetDbConnection();
        if (connection.State != System.Data.ConnectionState.Open)
        {
            await db.Database.OpenConnectionAsync(ct);
        }

        bool hasSkillsTable = false;
        bool hasMigrationsHistory = false;

        using (var checkCmd = connection.CreateCommand())
        {
            checkCmd.CommandText = "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('skills', '__EFMigrationsHistory');";
            using var reader = await checkCmd.ExecuteReaderAsync(ct);
            while (await reader.ReadAsync(ct))
            {
                var name = reader.GetString(0);
                if (string.Equals(name, "skills", StringComparison.OrdinalIgnoreCase)) hasSkillsTable = true;
                if (string.Equals(name, "__EFMigrationsHistory", StringComparison.OrdinalIgnoreCase)) hasMigrationsHistory = true;
            }
        }

        if (hasSkillsTable && !hasMigrationsHistory)
        {
            using var createHistoryCmd = connection.CreateCommand();
            createHistoryCmd.CommandText = """
                CREATE TABLE IF NOT EXISTS "__EFMigrationsHistory" (
                    "MigrationId" TEXT NOT NULL CONSTRAINT "PK___EFMigrationsHistory" PRIMARY KEY,
                    "ProductVersion" TEXT NOT NULL
                );
                INSERT OR IGNORE INTO "__EFMigrationsHistory" ("MigrationId", "ProductVersion")
                VALUES ('20260903000001_InitialSkills', '9.0.2');
                """;
            await createHistoryCmd.ExecuteNonQueryAsync(ct);
        }
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
