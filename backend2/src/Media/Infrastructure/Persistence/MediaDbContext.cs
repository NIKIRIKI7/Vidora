using Kernel.Events;
using Kernel.Platform.Persistence;
using MediaContext.Domain.Entities;
using MediaContext.Domain.ValueObjects;
using Microsoft.EntityFrameworkCore;

namespace MediaContext.Infrastructure.Persistence;

public class MediaDbContext : SqliteDbContextBase
{
    public DbSet<MediaAsset> MediaAssets => Set<MediaAsset>();

    public MediaDbContext(DbContextOptions<MediaDbContext> options, IEventBus? eventBus = null)
        : base(options, eventBus)
    {
    }

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        modelBuilder.Entity<MediaAsset>(b =>
        {
            b.ToTable("media_assets");
            b.HasKey(m => m.Id);

            b.Ignore(m => m.DomainEvents);

            b.Property(m => m.Id)
                .HasConversion(id => id.Value, str => new MediaAssetId(str))
                .HasMaxLength(MediaAssetId.MaxLength)
                .IsRequired();

            b.Property(m => m.Title)
                .HasMaxLength(MediaAsset.MaxTitleLength)
                .IsRequired();

            b.Property(m => m.Type)
                .HasConversion<string>()
                .HasMaxLength(32)
                .IsRequired();

            b.Property(m => m.Source)
                .HasConversion<string>()
                .HasMaxLength(32)
                .IsRequired();

            b.Property(m => m.StoragePath)
                .HasMaxLength(512)
                .IsRequired();

            b.Property(m => m.NormalizedStoragePath)
                .HasMaxLength(512);

            b.Property(m => m.Extension)
                .HasMaxLength(16)
                .IsRequired();

            b.Property(m => m.FileSizeBytes)
                .IsRequired();

            b.Property(m => m.Dimensions)
                .HasConversion(
                    d => d.HasValue ? $"{d.Value.Width}x{d.Value.Height}" : null,
                    s => ParseDimensions(s))
                .HasMaxLength(32);

            b.Property(m => m.Duration)
                .HasConversion(
                    d => d.HasValue ? d.Value.TotalSeconds : (double?)null,
                    s => s.HasValue ? MediaDuration.FromSeconds(s.Value) : (MediaDuration?)null);

            b.Property(m => m.Fps);
            b.Property(m => m.IsNormalized).IsRequired();
            b.Property(m => m.Sha256Hash).HasMaxLength(128);

            b.Property(m => m.CreatedAt).IsRequired();
            b.Property(m => m.UpdatedAt).IsRequired();

            b.HasIndex(m => m.Type);
            b.HasIndex(m => m.Source);
            b.HasIndex(m => m.IsNormalized);
        });
    }

    private static MediaDimensions? ParseDimensions(string? raw)
    {
        if (string.IsNullOrWhiteSpace(raw)) return null;
        var parts = raw.Split('x', 'X');
        if (parts.Length == 2 && int.TryParse(parts[0], out int w) && int.TryParse(parts[1], out int h))
        {
            return new MediaDimensions(w, h);
        }
        return null;
    }
}
