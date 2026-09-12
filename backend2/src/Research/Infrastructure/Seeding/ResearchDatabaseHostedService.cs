using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Research.Infrastructure.Persistence;

namespace Research.Infrastructure.Seeding;

public sealed class ResearchDatabaseHostedService : IHostedService
{
    private readonly IServiceProvider _serviceProvider;
    private readonly ILogger<ResearchDatabaseHostedService> _logger;

    public ResearchDatabaseHostedService(
        IServiceProvider serviceProvider,
        ILogger<ResearchDatabaseHostedService> logger)
    {
        _serviceProvider = serviceProvider;
        _logger = logger;
    }

    public async Task StartAsync(CancellationToken cancellationToken)
    {
        _logger.LogInformation("[Research] Применение схемы research.db и настройка WAL...");
        using var scope = _serviceProvider.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ResearchDbContext>();
        await db.ResetMigrationLocksAsync(cancellationToken);
        await db.Database.MigrateAsync(cancellationToken);
        await db.ConfigureSqlitePragmasAsync(cancellationToken);
        _logger.LogInformation("[Research] База данных research.db готова к работе.");
    }

    public Task StopAsync(CancellationToken cancellationToken) => Task.CompletedTask;
}
