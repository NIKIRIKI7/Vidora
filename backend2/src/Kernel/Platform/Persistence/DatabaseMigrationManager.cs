using Microsoft.Extensions.Logging;

namespace Kernel.Platform.Persistence;

/// <summary>
/// Композитный координатор миграций. Зависит только от SPI-участников, зарегистрированных
/// bounded context'ами, и ничего не знает об их внутреннем устройстве.
/// </summary>
public sealed class DatabaseMigrationManager
{
    private readonly IEnumerable<IDatabaseMigrationParticipant> _participants;
    private readonly ILogger<DatabaseMigrationManager> _logger;

    public DatabaseMigrationManager(
        IEnumerable<IDatabaseMigrationParticipant> participants,
        ILogger<DatabaseMigrationManager> logger)
    {
        _participants = participants;
        _logger = logger;
    }

    public async Task ApplyAllMigrationsAsync(CancellationToken ct = default)
    {
        _logger.LogInformation("==================================================");
        _logger.LogInformation("[CLI Migration] Старт применения EF-миграций для всех зарегистрированных контекстов...");
        _logger.LogInformation("==================================================");

        var ordered = _participants.OrderBy(p => p.Order).ToList();
        var step = 1;

        foreach (var participant in ordered)
        {
            _logger.LogInformation("[{Step}/{Total}] Миграция контекста {Name}...", step++, ordered.Count, participant.ContextName);
            await participant.MigrateAsync(ct);
        }

        _logger.LogInformation("==================================================");
        _logger.LogInformation("[CLI Migration] Все базы данных переведены на версионирование EF Migrations!");
        _logger.LogInformation("==================================================");
    }
}
