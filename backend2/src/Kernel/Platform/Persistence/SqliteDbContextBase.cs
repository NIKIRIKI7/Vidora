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
}
