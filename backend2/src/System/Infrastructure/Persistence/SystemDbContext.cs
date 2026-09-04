using Kernel.Events;
using Kernel.Platform.Persistence;
using Microsoft.EntityFrameworkCore;
using SystemContext.Domain.Entities;

namespace SystemContext.Infrastructure.Persistence;

public class SystemDbContext : SqliteDbContextBase
{
    public DbSet<SystemSetting> Settings => Set<SystemSetting>();
    public DbSet<AiModelArtifact> AiModels => Set<AiModelArtifact>();
    public DbSet<SystemMaintenanceLog> MaintenanceLogs => Set<SystemMaintenanceLog>();

    public SystemDbContext(DbContextOptions<SystemDbContext> options, IEventBus? eventBus = null)
        : base(options, eventBus) { }

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        modelBuilder.Entity<SystemSetting>(b =>
        {
            b.ToTable("system_settings");
            b.HasKey(s => s.Id);
            b.Property(s => s.Id).HasMaxLength(SystemSetting.MaxKeyLength).IsRequired();
            b.Property(s => s.Value).HasMaxLength(SystemSetting.MaxValueLength).IsRequired();
            b.Property(s => s.Description).HasMaxLength(512);
            b.Property(s => s.DataType).HasMaxLength(32).IsRequired();
            b.Property(s => s.IsReadOnly).IsRequired();
            b.Property(s => s.CreatedAt).IsRequired();
            b.Property(s => s.UpdatedAt).IsRequired();
        });

        modelBuilder.Entity<AiModelArtifact>(b =>
        {
            b.ToTable("ai_models");
            b.HasKey(m => m.Id);
            b.Property(m => m.Id).HasMaxLength(AiModelArtifact.MaxIdLength).IsRequired();
            b.Property(m => m.Name).HasMaxLength(AiModelArtifact.MaxNameLength).IsRequired();
            b.Property(m => m.Category).HasConversion<string>().HasMaxLength(32).IsRequired();
            b.Property(m => m.TargetDirectory).HasMaxLength(256).IsRequired();
            b.Property(m => m.DownloadUrl).HasMaxLength(1024);
            b.Property(m => m.ExpectedSizeBytes).IsRequired();
            b.Property(m => m.DownloadedSizeBytes).IsRequired();
            b.Property(m => m.Status).HasConversion<string>().HasMaxLength(32).IsRequired();
            b.Property(m => m.ErrorMessage).HasMaxLength(1024);
            b.Property(m => m.Sha256Checksum).HasMaxLength(128);
            b.Property(m => m.Version).HasMaxLength(32).IsRequired();
            b.Property(m => m.IsRequired).IsRequired();
            b.Property(m => m.CreatedAt).IsRequired();
            b.Property(m => m.UpdatedAt).IsRequired();

            b.HasIndex(m => m.Status);
            b.HasIndex(m => m.Category);
        });

        modelBuilder.Entity<SystemMaintenanceLog>(b =>
        {
            b.ToTable("system_maintenance_logs");
            b.HasKey(l => l.Id);
            b.Property(l => l.Id).ValueGeneratedOnAdd();
            b.Property(l => l.Operation).HasMaxLength(128).IsRequired();
            b.Property(l => l.DurationMs).IsRequired();
            b.Property(l => l.IsSuccess).IsRequired();
            b.Property(l => l.Details);
            b.Property(l => l.CreatedAt).IsRequired();
            b.Property(l => l.UpdatedAt).IsRequired();

            b.HasIndex(l => l.CreatedAt);
        });
    }
}
