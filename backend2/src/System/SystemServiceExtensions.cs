using Kernel.Platform.Config;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using SystemContext.Application.Services;
using SystemContext.Contracts;
using SystemContext.Domain.Ports;
using SystemContext.Infrastructure.Persistence;
using SystemContext.Infrastructure.Seeding;

namespace SystemContext;

public static class SystemServiceExtensions
{
    public static IServiceCollection AddSystemContext(
        this IServiceCollection services,
        IConfiguration configuration)
    {
        var storageSection = configuration.GetSection(AppStorageConfig.SectionName);
        var storage = storageSection.Get<AppStorageConfig>() ?? new AppStorageConfig();
        var dataDir = string.IsNullOrWhiteSpace(storage.DataStorageDir) ? "data_storage" : storage.DataStorageDir;
        var fullDataDir = Path.GetFullPath(dataDir);

        if (!Directory.Exists(fullDataDir))
        {
            Directory.CreateDirectory(fullDataDir);
        }

        var dbPath = Path.Combine(fullDataDir, "system.db");
        var connectionString = $"Data Source={dbPath}";

        services.AddDbContext<SystemDbContext>(options =>
        {
            options.UseSqlite(connectionString);
        });

        // Репозитории ORM
        services.AddScoped<ISystemSettingRepository, EfSystemSettingRepository>();
        services.AddScoped<IAiModelRepository, EfAiModelRepository>();
        services.AddScoped<ISystemMaintenanceRepository, EfSystemMaintenanceRepository>();

        // Сидинг и миграции
        services.AddScoped<SystemDatabaseSeeder>();
        // services.AddHostedService<SystemDatabaseHostedService>(); // migrated to CLI: dotnet run -- --migrate
        services.AddHostedService<ModelDiscoveryService>();

        // Модуль и сервисы мониторинга
        services.AddSingleton<HardwareMonitorService>();
        services.AddScoped<ISystemModule, SystemModule>();

        return services;
    }
}
