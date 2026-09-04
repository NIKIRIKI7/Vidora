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
        services.AddDbContext<MediaDbContext>(options =>
            options.UseSqlite(configuration.GetConnectionString("MediaDb")
                ?? "Data Source=data_storage/media.db"));

        services.AddScoped<IMediaAssetRepository, EfMediaAssetRepository>();
        services.AddSingleton<IMediaStorageService, LocalMediaStorageService>();
        services.AddSingleton<IBrollNormalizer, FfmpegBrollNormalizer>();
        services.AddSingleton<IMusicCatalogProvider, LocalMusicCatalogProvider>();
        services.AddScoped<IMediaModule, MediaModule>();
        services.AddHostedService<MediaDatabaseHostedService>();

        return services;
    }
}
