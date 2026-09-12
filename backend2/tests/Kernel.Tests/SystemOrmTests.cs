using Kernel.Events;
using Kernel.Exceptions;
using Kernel.Platform.Config;
using Kernel.Platform.FileSystem;
using Kernel.Platform.Gpu;
using Kernel.Platform.Process;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Moq;
using SystemContext.Application.Services;
using SystemContext.Domain;
using SystemContext.Domain.Entities;
using SystemContext.Infrastructure.Persistence;
using SystemContext.Infrastructure.Seeding;
using Xunit;

namespace Kernel.Tests;

public class SystemOrmTests
{
    [Fact]
    public async Task SystemDbContext_MigrationsAndSeeding_ShouldWorkInMemory()
    {
        var options = new DbContextOptionsBuilder<SystemDbContext>()
            .UseSqlite("Data Source=:memory:")
            .Options;

        using var dbContext = new SystemDbContext(options);
        await dbContext.Database.OpenConnectionAsync();
        await dbContext.Database.MigrateAsync();
        await dbContext.ConfigureSqlitePragmasAsync();

        var settingRepo = new EfSystemSettingRepository(dbContext);
        var modelRepo = new EfAiModelRepository(dbContext);
        var storageConfig = Options.Create(new AppStorageConfig());
        var seeder = new SystemDatabaseSeeder(settingRepo, modelRepo, storageConfig, NullLogger<SystemDatabaseSeeder>.Instance);

        await seeder.SeedAsync();

        var settings = await settingRepo.GetAllAsync();
        Assert.NotEmpty(settings);
        Assert.Contains(settings, s => s.Id == "system.app_name");

        var models = await modelRepo.GetAllAsync();
        Assert.NotEmpty(models);
        Assert.Contains(models, m => m.Id == "whisper-small-ct2");
        Assert.DoesNotContain(models, m => m.Id == "whisper-base");
    }

    [Fact]
    public void SystemSetting_UpdateReadOnly_ShouldThrowDomainConflict()
    {
        var readOnlySetting = SystemSetting.Create("ro.key", "Initial", isReadOnly: true);
        Assert.Throws<DomainConflictException>(() => readOnlySetting.UpdateValue("NewValue"));
    }

    [Fact]
    public async Task SystemModule_UpdateSetting_ShouldPersistAndPublish()
    {
        var options = new DbContextOptionsBuilder<SystemDbContext>()
            .UseSqlite("Data Source=:memory:")
            .Options;

        var eventBus = new InMemoryEventBus(NullLogger<InMemoryEventBus>.Instance);
        using var dbContext = new SystemDbContext(options, eventBus);
        await dbContext.Database.OpenConnectionAsync();
        await dbContext.Database.MigrateAsync();

        var settingRepo = new EfSystemSettingRepository(dbContext);
        var modelRepo = new EfAiModelRepository(dbContext);
        var maintRepo = new EfSystemMaintenanceRepository(dbContext);

        await settingRepo.AddAsync(SystemSetting.Create("motion.fps", "30"));
        await settingRepo.SaveChangesAsync();

        var storageOptions = Options.Create(new AppStorageConfig());
        var gpuManager = new GpuManager(NullLogger<GpuManager>.Instance);
        var supervisor = new Mock<IProcessSupervisor>().Object;
        var pathResolver = new Mock<IPathResolver>().Object;
        var hardware = new HardwareMonitorService(gpuManager, supervisor, storageOptions, NullLogger<HardwareMonitorService>.Instance);

        var module = new SystemModule(settingRepo, modelRepo, maintRepo, hardware, pathResolver, storageOptions, new Mock<IServiceProvider>().Object, NullLogger<SystemModule>.Instance);

        var updated = await module.SetSettingAsync("motion.fps", "60");

        Assert.Equal("60", updated.Value);
        var fromDb = await settingRepo.GetByKeyAsync("motion.fps");
        Assert.Equal("60", fromDb!.Value);
    }
}
