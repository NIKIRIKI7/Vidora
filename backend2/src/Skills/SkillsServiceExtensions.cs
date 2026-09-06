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
        var storage = configuration.GetSection(AppStorageConfig.SectionName).Get<AppStorageConfig>()
            ?? throw new InvalidOperationException("Секция 'Storage' не найдена в appsettings.json.");
        var fullDataDir = Path.GetFullPath(storage.DataStorageDir);

        if (!Directory.Exists(fullDataDir))
        {
            Directory.CreateDirectory(fullDataDir);
        }

        var connectionString = $"Data Source={Path.GetFullPath(storage.GetDatabasePath("skills"))}";

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
        // services.AddHostedService<SkillsSeederHostedService>(); // migrated to CLI: dotnet run -- --migrate

        return services;
    }
}
