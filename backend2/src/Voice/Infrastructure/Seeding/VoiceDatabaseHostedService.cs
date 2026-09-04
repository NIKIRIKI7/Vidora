using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Voice.Infrastructure.Persistence;

namespace Voice.Infrastructure.Seeding;

public sealed class VoiceDatabaseHostedService : IHostedService
{
    private readonly IServiceProvider _serviceProvider;
    private readonly ILogger<VoiceDatabaseHostedService> _logger;

    public VoiceDatabaseHostedService(
        IServiceProvider serviceProvider,
        ILogger<VoiceDatabaseHostedService> logger)
    {
        _serviceProvider = serviceProvider;
        _logger = logger;
    }

    public async Task StartAsync(CancellationToken cancellationToken)
    {
        _logger.LogInformation("[VoiceDbHosted] Применение миграций voice.db и настройка WAL...");
        using var scope = _serviceProvider.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<VoiceDbContext>();
        await db.Database.EnsureCreatedAsync(cancellationToken);
        await db.ConfigureSqlitePragmasAsync(cancellationToken);
        _logger.LogInformation("[VoiceDbHosted] База данных voice.db готова к работе.");
    }

    public Task StopAsync(CancellationToken cancellationToken) => Task.CompletedTask;
}
