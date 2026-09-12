using Kernel.Platform.Persistence;
using Microsoft.EntityFrameworkCore;

namespace ProductionContext.Infrastructure.Persistence;

public sealed class ProductionMigrationParticipant : IDatabaseMigrationParticipant
{
    private readonly ProductionDbContext _db;

    public ProductionMigrationParticipant(ProductionDbContext db) => _db = db;

    public int Order => 6;
    public string ContextName => "Production";

    public async Task MigrateAsync(CancellationToken ct = default)
    {
        await EnsureProductionScenarioEngineColumnsAsync(_db, ct);
        await _db.MigrateWithShimAsync("production_projects", ct: ct);
    }

    /// <summary>
    /// Idempotently добавляет колонки Scenario Engine в существующую таблицу фрагментов
    /// (нужно для БД, созданных старой схемой до перехода на миграции).
    /// </summary>
    private static async Task EnsureProductionScenarioEngineColumnsAsync(ProductionDbContext db, CancellationToken ct)
    {
        const string table = "production_scene_fragments";
        var connection = db.Database.GetDbConnection();
        if (connection.State != System.Data.ConnectionState.Open)
        {
            await db.Database.OpenConnectionAsync(ct);
        }

        bool tableExists;
        using (var checkCmd = connection.CreateCommand())
        {
            checkCmd.CommandText = $"SELECT 1 FROM sqlite_master WHERE type='table' AND name='{table}';";
            tableExists = await checkCmd.ExecuteScalarAsync(ct) is not null;
        }

        if (!tableExists) return;

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
}
