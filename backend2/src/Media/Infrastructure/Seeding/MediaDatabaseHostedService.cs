using MediaContext.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace MediaContext.Infrastructure.Seeding;

public sealed class MediaDatabaseHostedService : IHostedService
{
    private readonly IServiceProvider _serviceProvider;
    private readonly ILogger<MediaDatabaseHostedService> _logger;

    public MediaDatabaseHostedService(
        IServiceProvider serviceProvider,
        ILogger<MediaDatabaseHostedService> logger)
    {
        _serviceProvider = serviceProvider;
        _logger = logger;
    }

    public async Task StartAsync(CancellationToken cancellationToken)
    {
        _logger.LogInformation("[Media] Применение миграций media.db и настройка WAL...");
        using var scope = _serviceProvider.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<MediaDbContext>();

        await db.ResetMigrationLocksAsync(cancellationToken);
        await db.Database.MigrateAsync(cancellationToken);
        await db.ConfigureSqlitePragmasAsync(cancellationToken);

        _logger.LogInformation("[Media] База данных media.db инициализирована.");
    }

    public Task StopAsync(CancellationToken cancellationToken) => Task.CompletedTask;
}
