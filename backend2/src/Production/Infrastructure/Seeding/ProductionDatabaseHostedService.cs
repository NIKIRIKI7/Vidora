using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using ProductionContext.Infrastructure.Persistence;

namespace ProductionContext.Infrastructure.Seeding;

public sealed class ProductionDatabaseHostedService : IHostedService
{
    private readonly IServiceProvider _serviceProvider;
    private readonly ILogger<ProductionDatabaseHostedService> _logger;

    public ProductionDatabaseHostedService(
        IServiceProvider serviceProvider,
        ILogger<ProductionDatabaseHostedService> logger)
    {
        _serviceProvider = serviceProvider;
        _logger = logger;
    }

    public async Task StartAsync(CancellationToken cancellationToken)
    {
        _logger.LogInformation("[Production] Применение схемы базы данных production.db и активация WAL...");
        using var scope = _serviceProvider.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ProductionDbContext>();

        await db.ResetMigrationLocksAsync(cancellationToken);
        await db.Database.MigrateAsync(cancellationToken);
        await db.ConfigureSqlitePragmasAsync(cancellationToken);

        _logger.LogInformation("[Production] База данных production.db готова к работе.");
    }

    public Task StopAsync(CancellationToken cancellationToken) => Task.CompletedTask;
}
