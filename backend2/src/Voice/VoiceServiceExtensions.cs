using Kernel.Platform.Config;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Voice.Application.Services;
using Voice.Domain.Ports;
using Voice.Infrastructure.Adapters;
using Voice.Infrastructure.Alignment;
using Voice.Infrastructure.Audio;
using Voice.Infrastructure.Persistence;
using Voice.Infrastructure.Providers;
using Voice.Infrastructure.Providers.Cloud;
using Voice.Infrastructure.Seeding;

namespace Voice;

public static class VoiceServiceExtensions
{
    public static IServiceCollection AddVoiceContext(this IServiceCollection services, IConfiguration configuration)
    {
        var storage = configuration.GetSection(AppStorageConfig.SectionName).Get<AppStorageConfig>()
            ?? throw new InvalidOperationException("Секция 'Storage' не найдена в appsettings.json.");
        var fullDataDir = Path.GetFullPath(storage.DataStorageDir);
        if (!Directory.Exists(fullDataDir)) Directory.CreateDirectory(fullDataDir);

        var connectionString = $"Data Source={Path.GetFullPath(storage.GetDatabasePath("voice"))}";
        services.AddDbContext<VoiceDbContext>(options => options.UseSqlite(connectionString));

        services.AddScoped<ITtsJobRepository, EfTtsJobRepository>();
        services.AddScoped<ISpeakerProfileRepository, EfSpeakerProfileRepository>();

        // Движки TTS
        services.AddHttpClient<ITtsEngineProvider, OpenAiSpeechProvider>();
        services.AddHttpClient<ITtsEngineProvider, MiniMaxSpeechProvider>();
        services.AddScoped<TtsProviderRegistry>();

        // Чистые движки принудительного выравнивания речи (Forced Alignment)
        services.AddScoped<IForcedAlignmentProvider, WhisperAlignmentProvider>();
        services.AddScoped<IForcedAlignmentProvider, NativeFallbackAlignmentProvider>();
        services.AddScoped<AlignmentProviderRegistry>();

        // Клонирование голоса (облачный MiniMax)
        services.AddHttpClient<IVoiceCloneProvider, MiniMaxCloneProvider>();
        services.AddScoped<VoiceCloneProviderRegistry>();

        // Самоописывающиеся дескрипторы движков + каталог
        services.AddScoped<IVoiceEngineDescriptor, MiniMaxEngineDescriptor>();
        services.AddScoped<IVoiceEngineDescriptor, OpenAiEngineDescriptor>();
        services.AddScoped<IVoiceEngineCatalog, VoiceEngineCatalog>();

        // DSP и обработка звука
        services.AddSingleton<IAudioDuckingService, FfmpegAudioDuckingService>();

        // Адаптер интеграции между контекстами Voice и Media
        services.AddScoped<IVoiceMediaRegistrar, VoiceMediaRegistrar>();

        // Главный фасад
        services.AddScoped<IVoiceModule, VoiceModule>();
        // services.AddHostedService<VoiceDatabaseHostedService>(); // migrated to CLI: dotnet run -- --migrate

        return services;
    }
}
