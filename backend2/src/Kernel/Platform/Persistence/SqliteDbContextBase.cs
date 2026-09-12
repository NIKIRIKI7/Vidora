using Kernel.Events;
using Microsoft.EntityFrameworkCore;

namespace Kernel.Platform.Persistence;

/// <summary>
/// Базовый DbContext для всех ограниченных контекстов (Bounded Contexts) платформы.
/// Настраивает оптимизации SQLite (WAL, timeouts), автоматический аудит и публикацию событий.
/// </summary>
public abstract class SqliteDbContextBase : DbContext
{
    private readonly IEventBus? _eventBus;

    protected SqliteDbContextBase(DbContextOptions options, IEventBus? eventBus = null)
        : base(options)
    {
        _eventBus = eventBus;
    }

    public override int SaveChanges(bool acceptAllChangesOnSuccess)
    {
        ApplyAuditTimestamps();
        return base.SaveChanges(acceptAllChangesOnSuccess);
    }

    public override async Task<int> SaveChangesAsync(
        bool acceptAllChangesOnSuccess,
        CancellationToken cancellationToken = default)
    {
        ApplyAuditTimestamps();

        var eventsToDispatch = CollectDomainEvents();

        var result = await base.SaveChangesAsync(acceptAllChangesOnSuccess, cancellationToken);

        if (_eventBus != null && eventsToDispatch.Count > 0)
        {
            foreach (var domainEvent in eventsToDispatch)
            {
                await _eventBus.PublishAsync(domainEvent, cancellationToken);
            }
        }

        return result;
    }

    /// <summary>
    /// Очищает «зомби»-блокировки миграций EF Core 9+, остающиеся в SQLite при аварийном завершении процесса.
    /// </summary>
    public async Task ResetMigrationLocksAsync(CancellationToken cancellationToken = default)
    {
        var connection = Database.GetDbConnection();
        if (connection.State != System.Data.ConnectionState.Open)
        {
            await Database.OpenConnectionAsync(cancellationToken);
        }

        using var cmd = connection.CreateCommand();
        cmd.CommandText = "DROP TABLE IF EXISTS __EFMigrationsLock;";
        await cmd.ExecuteNonQueryAsync(cancellationToken);
    }

    /// <summary>
    /// Оптимизирует SQLite для высоконагруженного многопоточного доступа (WAL-режим).
    /// </summary>
    public async Task ConfigureSqlitePragmasAsync(CancellationToken cancellationToken = default)
    {
        var connection = Database.GetDbConnection();
        if (connection.State != System.Data.ConnectionState.Open)
        {
            await Database.OpenConnectionAsync(cancellationToken);
        }

        using var cmd = connection.CreateCommand();
        cmd.CommandText = """
            PRAGMA journal_mode = WAL;
            PRAGMA synchronous = NORMAL;
            PRAGMA busy_timeout = 5000;
            PRAGMA foreign_keys = ON;
        """;
        await cmd.ExecuteNonQueryAsync(cancellationToken);
    }

    private void ApplyAuditTimestamps()
    {
        var entries = ChangeTracker.Entries<IAuditableEntity>();
        var now = DateTimeOffset.UtcNow;

        foreach (var entry in entries)
        {
            if (entry.State == EntityState.Added)
            {
                entry.Entity.CreatedAt = now;
                entry.Entity.UpdatedAt = now;
            }
            else if (entry.State == EntityState.Modified)
            {
                entry.Entity.UpdatedAt = now;
            }
        }
    }

    private List<IDomainEvent> CollectDomainEvents()
    {
        var domainEntities = ChangeTracker.Entries<IHasDomainEvents>()
            .Select(e => e.Entity)
            .Where(e => e.DomainEvents.Count > 0)
            .ToList();

        var events = domainEntities.SelectMany(e => e.DomainEvents).ToList();

        foreach (var entity in domainEntities)
        {
            entity.ClearDomainEvents();
        }

        return events;
    }

    /// <summary>
    /// Применяет EF-миграции. Перед этим безопасно переводит легаси-БД (созданные ранее
    /// через EnsureCreated, без __EFMigrationsHistory) на версионирование: базовая миграция
    /// помечается как применённая, существующие данные и схема не затрагиваются.
    /// </summary>
    public async Task MigrateWithShimAsync(string primaryProbeTable, string efProductVersion = "9.0.2", CancellationToken ct = default)
    {
        await ResetMigrationLocksAsync(ct);

        var connection = Database.GetDbConnection();
        if (connection.State != System.Data.ConnectionState.Open)
        {
            await Database.OpenConnectionAsync(ct);
        }

        bool hasPrimaryTable = false;
        bool hasMigrationHistory = false;

        using (var checkCmd = connection.CreateCommand())
        {
            checkCmd.CommandText = $"SELECT name FROM sqlite_master WHERE type='table' AND name IN ('{primaryProbeTable}', '__EFMigrationsHistory');";
            using var reader = await checkCmd.ExecuteReaderAsync(ct);
            while (await reader.ReadAsync(ct))
            {
                var name = reader.GetString(0);
                if (string.Equals(name, primaryProbeTable, StringComparison.OrdinalIgnoreCase)) hasPrimaryTable = true;
                if (string.Equals(name, "__EFMigrationsHistory", StringComparison.OrdinalIgnoreCase)) hasMigrationHistory = true;
            }
        }

        if (hasPrimaryTable && !hasMigrationHistory)
        {
            var initialMigrationId = Database.GetMigrations()
                .OrderBy(id => id, StringComparer.Ordinal)
                .FirstOrDefault()
                ?? throw new InvalidOperationException($"Для контекста '{GetType().Name}' не найдено ни одной EF-миграции.");

            using (var createHistoryCmd = connection.CreateCommand())
            {
                createHistoryCmd.CommandText = """
                    CREATE TABLE IF NOT EXISTS "__EFMigrationsHistory" (
                        "MigrationId" TEXT NOT NULL CONSTRAINT "PK___EFMigrationsHistory" PRIMARY KEY,
                        "ProductVersion" TEXT NOT NULL
                    );
                    """;
                await createHistoryCmd.ExecuteNonQueryAsync(ct);
            }

            using (var insertHistoryCmd = connection.CreateCommand())
            {
                insertHistoryCmd.CommandText = """
                    INSERT OR IGNORE INTO "__EFMigrationsHistory" ("MigrationId", "ProductVersion")
                    VALUES ($id, $version);
                    """;
                var idParam = insertHistoryCmd.CreateParameter();
                idParam.ParameterName = "$id";
                idParam.Value = initialMigrationId;
                insertHistoryCmd.Parameters.Add(idParam);

                var versionParam = insertHistoryCmd.CreateParameter();
                versionParam.ParameterName = "$version";
                versionParam.Value = efProductVersion;
                insertHistoryCmd.Parameters.Add(versionParam);

                await insertHistoryCmd.ExecuteNonQueryAsync(ct);
            }
        }

        await Database.MigrateAsync(ct);
        await ConfigureSqlitePragmasAsync(ct);
    }
}
