namespace Kernel.Platform.Persistence;

/// <summary>
/// SPI для bounded context'ов: каждый контекст сам применяет свои EF-миграции и сидинг.
/// Позволяет Kernel-композитору не знать ни об одном предметном контексте.
/// </summary>
public interface IDatabaseMigrationParticipant
{
    int Order { get; }
    string ContextName { get; }
    Task MigrateAsync(CancellationToken ct = default);
}
