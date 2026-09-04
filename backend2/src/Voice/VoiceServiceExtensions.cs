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
using Voice.Infrastructure.Providers.Local;
using Voice.Infrastructure.Seeding;

namespace Voice;

public static class VoiceServiceExtensions
{
    public static IServiceCollection AddVoiceContext(this IServiceCollection services, IConfiguration configuration)
    {
        var storageSection = configuration.GetSection(AppStorageConfig.SectionName);
        var storage = storageSection.Get<AppStorageConfig>() ?? new AppStorageConfig();
        var dataDir = string.IsNullOrWhiteSpace(storage.DataStorageDir) ? "data_storage" : storage.DataStorageDir;
        var fullDataDir = Path.GetFullPath(dataDir);
        if (!Directory.Exists(fullDataDir)) Directory.CreateDirectory(fullDataDir);

        var connectionString = $"Data Source={Path.Combine(fullDataDir, "voice.db")}";
        services.AddDbContext<VoiceDbContext>(options => options.UseSqlite(connectionString));

        services.AddScoped<ITtsJobRepository, EfTtsJobRepository>();

        // Движки TTS
        services.AddScoped<ITtsEngineProvider, OmniVoiceTtsProvider>();
        services.AddScoped<ITtsEngineProvider, CosyVoiceTtsProvider>();
        services.AddScoped<ITtsEngineProvider, FishAudioLocalTtsProvider>();
        services.AddHttpClient<ITtsEngineProvider, OpenAiSpeechProvider>();
        services.AddHttpClient<ITtsEngineProvider, MiniMaxSpeechProvider>();
        services.AddScoped<TtsProviderRegistry>();

        // Движки выравнивания (Alignment)
        services.AddScoped<IForcedAlignmentProvider, WhisperAlignmentProvider>();
        services.AddScoped<IForcedAlignmentProvider, NativeFallbackAlignmentProvider>();
        services.AddScoped<AlignmentProviderRegistry>();

        // DSP и обработка звука
        services.AddSingleton<IAudioDuckingService, FfmpegAudioDuckingService>();

        // Адаптер интеграции между контекстами Voice и Media
        services.AddScoped<IVoiceMediaRegistrar, VoiceMediaRegistrar>();

        // Главный фасад
        services.AddScoped<IVoiceModule, VoiceModule>();
        services.AddHostedService<VoiceDatabaseHostedService>();

        return services;
    }
}
