using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using SystemContext.Infrastructure.Persistence;

namespace SystemContext.Infrastructure.Seeding;

public sealed class SystemDatabaseHostedService : IHostedService
{
    private readonly IServiceProvider _serviceProvider;
    private readonly ILogger<SystemDatabaseHostedService> _logger;

    public SystemDatabaseHostedService(
        IServiceProvider serviceProvider,
        ILogger<SystemDatabaseHostedService> logger)
    {
        _serviceProvider = serviceProvider;
        _logger = logger;
    }

    public async Task StartAsync(CancellationToken cancellationToken)
    {
        _logger.LogInformation("[System] Применение миграций system.db и настройка WAL...");

        using var scope = _serviceProvider.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SystemDbContext>();

        await db.ResetMigrationLocksAsync(cancellationToken);
        await db.Database.MigrateAsync(cancellationToken);
        await db.ConfigureSqlitePragmasAsync(cancellationToken);

        var seeder = scope.ServiceProvider.GetRequiredService<SystemDatabaseSeeder>();
        await seeder.SeedAsync(cancellationToken);
    }

    public Task StopAsync(CancellationToken cancellationToken) => Task.CompletedTask;
}
