using Kernel.Platform.Config;
using MediaContext.Application.Services;
using MediaContext.Contracts;
using MediaContext.Domain.Ports;
using MediaContext.Infrastructure.Catalog;
using MediaContext.Infrastructure.Normalization;
using MediaContext.Infrastructure.Persistence;
using MediaContext.Infrastructure.Seeding;
using MediaContext.Infrastructure.Storage;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace MediaContext;

public static class MediaServiceExtensions
{
    public static IServiceCollection AddMediaContext(this IServiceCollection services, IConfiguration configuration)
    {
        var storage = configuration.GetSection(AppStorageConfig.SectionName).Get<AppStorageConfig>()
            ?? throw new InvalidOperationException("Секция 'Storage' не найдена в appsettings.json.");

        services.AddDbContext<MediaDbContext>(options =>
            options.UseSqlite(configuration.GetConnectionString("MediaDb")
                ?? $"Data Source={Path.GetFullPath(storage.GetDatabasePath("media"))}"));

        services.AddScoped<IMediaAssetRepository, EfMediaAssetRepository>();
        services.AddSingleton<IMediaStorageService, LocalMediaStorageService>();
        services.AddSingleton<IBrollNormalizer, FfmpegBrollNormalizer>();
        services.AddSingleton<IMusicCatalogProvider, LocalMusicCatalogProvider>();
        services.AddScoped<IYouTubeBrollCatalog, YouTubeBrollCatalog>();
        services.AddScoped<IMediaModule, MediaModule>();
        services.AddOptions<BrollNormalizationOptions>()
            .Bind(configuration.GetSection(BrollNormalizationOptions.SectionName));
        // services.AddHostedService<MediaDatabaseHostedService>(); // migrated to CLI: dotnet run -- --migrate

        return services;
    }
}
