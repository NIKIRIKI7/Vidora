using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using MotionContext.Infrastructure.Persistence;

namespace MotionContext.Infrastructure.Seeding;

public sealed class MotionDatabaseHostedService : IHostedService
{
    private readonly IServiceProvider _serviceProvider;
    private readonly ILogger<MotionDatabaseHostedService> _logger;

    public MotionDatabaseHostedService(
        IServiceProvider serviceProvider,
        ILogger<MotionDatabaseHostedService> logger)
    {
        _serviceProvider = serviceProvider;
        _logger = logger;
    }

    public async Task StartAsync(CancellationToken cancellationToken)
    {
        _logger.LogInformation("[Motion] Применение схемы motion.db...");
        using var scope = _serviceProvider.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<MotionDbContext>();

        await db.ResetMigrationLocksAsync(cancellationToken);
        await db.Database.EnsureCreatedAsync(cancellationToken);
        await db.ConfigureSqlitePragmasAsync(cancellationToken);

        _logger.LogInformation("[Motion] База данных motion.db готова.");
    }

    public Task StopAsync(CancellationToken cancellationToken) => Task.CompletedTask;
}
