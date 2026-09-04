using Kernel.Platform.Config;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Skills.Application.Services;
using Skills.Contracts;
using Skills.Domain.Ports;
using Skills.Domain.Services;
using Skills.Infrastructure.Persistence;
using Skills.Infrastructure.Seeding;

namespace Skills;

public static class SkillsServiceExtensions
{
    public static IServiceCollection AddSkillsContext(
        this IServiceCollection services,
        IConfiguration configuration)
    {
        // 1. Определение директории хранения SQLite базы данных
        var storageSection = configuration.GetSection(AppStorageConfig.SectionName);
        var storage = storageSection.Get<AppStorageConfig>() ?? new AppStorageConfig();
        var dataDir = string.IsNullOrWhiteSpace(storage.DataStorageDir) ? "data_storage" : storage.DataStorageDir;
        var fullDataDir = Path.GetFullPath(dataDir);

        if (!Directory.Exists(fullDataDir))
        {
            Directory.CreateDirectory(fullDataDir);
        }

        var dbPath = Path.Combine(fullDataDir, "skills.db");
        var connectionString = $"Data Source={dbPath}";

        // 2. Регистрация DbContext
        services.AddDbContext<SkillsDbContext>(options =>
        {
            options.UseSqlite(connectionString);
        });

        // 3. Регистрация репозиториев и доменных сервисов
        services.AddScoped<ISkillRepository, EfSkillRepository>();
        services.AddSingleton<PromptBuilder>();

        // 4. Регистрация Application Use Cases и публичного фасада ISkillsCatalog
        services.AddScoped<ISkillManagementService, SkillManagementService>();
        services.AddScoped<ISkillsCatalog, SkillsCatalog>();

        // 5. Сидинг при старте
        services.AddScoped<SkillsSeeder>();
        services.AddHostedService<SkillsSeederHostedService>();

        return services;
    }
}
