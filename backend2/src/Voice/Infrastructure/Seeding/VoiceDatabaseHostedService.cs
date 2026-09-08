using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Voice.Domain;
using Voice.Domain.Entities;
using Voice.Domain.ValueObjects;
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

        await SeedDefaultSpeakersAsync(db, cancellationToken);

        _logger.LogInformation("[VoiceDbHosted] База данных voice.db готова к работе.");
    }

    public Task StopAsync(CancellationToken cancellationToken) => Task.CompletedTask;

    private async Task SeedDefaultSpeakersAsync(VoiceDbContext db, CancellationToken ct)
    {
        if (await db.SpeakerProfiles.AnyAsync(ct))
            return;

        _logger.LogInformation("[VoiceDbHosted] Сидинг дефолтных дикторов...");

        var defaults = new[]
        {
            SpeakerProfile.CreateBuiltIn(
                new SpeakerId("alloy"),
                "Alloy (OpenAI Speech)",
                VoiceEngineType.CloudOpenAi,
                "multilingual", "Neutral", "Нейтральный мультиязычный голос OpenAI"),
            SpeakerProfile.CreateBuiltIn(
                new SpeakerId("echo"),
                "Echo (OpenAI Speech)",
                VoiceEngineType.CloudOpenAi,
                "multilingual", "Male", "Мужской мультиязычный голос OpenAI"),
            SpeakerProfile.CreateBuiltIn(
                new SpeakerId("shimmer"),
                "Shimmer (OpenAI Speech)",
                VoiceEngineType.CloudOpenAi,
                "multilingual", "Female", "Женский мультиязычный голос OpenAI"),
            SpeakerProfile.CreateBuiltIn(
                new SpeakerId("male-qn-qingse"),
                "QingSe (MiniMax T2A)",
                VoiceEngineType.CloudMiniMax,
                "multilingual", "Male", "Мужской голос MiniMax")
        };

        await db.SpeakerProfiles.AddRangeAsync(defaults, ct);
        await db.SaveChangesAsync(ct);

        _logger.LogInformation("[VoiceDbHosted] Засеяно {Count} дефолтных дикторов.", defaults.Length);
    }
}
