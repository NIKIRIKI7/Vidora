using System.Data.Common;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Skills.Infrastructure.Persistence;

namespace Skills.Infrastructure.Seeding;

public sealed class SkillsSeederHostedService : IHostedService
{
    private readonly IServiceProvider _serviceProvider;
    private readonly ILogger<SkillsSeederHostedService> _logger;

    public SkillsSeederHostedService(IServiceProvider serviceProvider, ILogger<SkillsSeederHostedService> logger)
    {
        _serviceProvider = serviceProvider;
        _logger = logger;
    }

    public async Task StartAsync(CancellationToken cancellationToken)
    {
        _logger.LogInformation("[Skills] Запуск миграций и валидации базы данных...");

        using var scope = _serviceProvider.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SkillsDbContext>();

        await MigrateAndNormalizeDatabaseAsync(db, cancellationToken);

        var seeder = scope.ServiceProvider.GetRequiredService<SkillsSeeder>();
        await seeder.SeedAsync(cancellationToken: cancellationToken);
    }

    public Task StopAsync(CancellationToken cancellationToken) => Task.CompletedTask;

    public async Task MigrateAndNormalizeDatabaseAsync(SkillsDbContext db, CancellationToken ct)
    {
        await db.ResetMigrationLocksAsync(ct);

        var connection = db.Database.GetDbConnection();
        if (connection.State != System.Data.ConnectionState.Open)
        {
            await db.Database.OpenConnectionAsync(ct);
        }

        await EnsureMigrationsHistoryForLegacyDbAsync(connection, ct);
        await db.Database.MigrateAsync(ct);
        await db.ConfigureSqlitePragmasAsync(ct);
        await NormalizeLegacyStageValuesAsync(connection, ct);
    }

    private async Task EnsureMigrationsHistoryForLegacyDbAsync(DbConnection connection, CancellationToken ct)
    {
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
            _logger.LogInformation("[Skills] Обнаружена существующая база dev-билда. Инициализируем __EFMigrationsHistory...");
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

    private async Task NormalizeLegacyStageValuesAsync(DbConnection connection, CancellationToken ct)
    {
        using var normalizeCmd = connection.CreateCommand();
        normalizeCmd.CommandText = """
            UPDATE skills SET Stage = 'scene_generation' WHERE Stage = 'SceneGeneration';
            UPDATE skills SET Stage = 'hook_analysis' WHERE Stage = 'HookAnalysis';
            UPDATE skills SET Stage = 'script_drafting' WHERE Stage = 'ScriptDrafting';
            UPDATE skills SET Stage = 'visual_analysis' WHERE Stage = 'VisualAnalysis';
            UPDATE skills SET Stage = 'trend_research' WHERE Stage = 'TrendResearch';
            """;
        int normalizedRows = await normalizeCmd.ExecuteNonQueryAsync(ct);
        if (normalizedRows > 0)
        {
            _logger.LogInformation("[Skills] Успешно нормализовано {Count} записей Stage (PascalCase -> snake_case).", normalizedRows);
        }
    }
}
