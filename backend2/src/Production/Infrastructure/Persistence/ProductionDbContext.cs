using System.Text.Json;
using Kernel.Contracts;
using Kernel.Events;
using Kernel.Platform.Persistence;
using Microsoft.EntityFrameworkCore;
using ProductionContext.Domain.Entities;
using ProductionContext.Domain.ValueObjects;

namespace ProductionContext.Infrastructure.Persistence;

public class ProductionDbContext : SqliteDbContextBase
{
    public DbSet<Project> Projects => Set<Project>();
    public DbSet<Scene> Scenes => Set<Scene>();
    public DbSet<SceneFragment> Fragments => Set<SceneFragment>();

    public ProductionDbContext(DbContextOptions<ProductionDbContext> options, IEventBus? eventBus = null)
        : base(options, eventBus) { }

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        modelBuilder.Entity<Project>(b =>
        {
            b.ToTable("production_projects");
            b.HasKey(p => p.Id);
            b.Ignore(p => p.DomainEvents);

            b.Property(p => p.Id)
                .HasConversion(id => id.Value, str => new ProjectId(str))
                .HasMaxLength(ProjectId.MaxLength)
                .IsRequired();

            b.Property(p => p.Title).HasMaxLength(Project.MaxTitleLength).IsRequired();
            b.Property(p => p.Slug)
                .HasConversion(slug => slug.Value, str => new ProjectSlug(str))
                .HasMaxLength(ProjectSlug.MaxLength)
                .IsRequired();

            b.Property(p => p.RelativePath).HasMaxLength(256).IsRequired();
            b.Property(p => p.Status).HasConversion<string>().HasMaxLength(32).IsRequired();
            b.Property(p => p.CurrentStep).HasConversion<string>().HasMaxLength(32).IsRequired();

            b.Property(p => p.MontageSettings)
                .HasConversion(
                    m => JsonSerializer.Serialize(m, (JsonSerializerOptions?)null),
                    json => JsonSerializer.Deserialize<MontageSettingsDto>(json, (JsonSerializerOptions?)null) ?? new MontageSettingsDto())
                .HasColumnType("TEXT")
                .IsRequired();

            b.Property(p => p.FinalVideoPath).HasMaxLength(512);
            b.Property(p => p.FinalDurationSeconds);
            b.Property(p => p.FinalFileSizeBytes);
            b.Property(p => p.ErrorMessage).HasMaxLength(2048);

            b.Property(p => p.CreatedAt).IsRequired();
            b.Property(p => p.UpdatedAt).IsRequired();

            b.HasMany(p => p.Scenes)
                .WithOne()
                .HasForeignKey(s => s.ProjectId)
                .OnDelete(DeleteBehavior.Cascade);

            b.Navigation(p => p.Scenes).UsePropertyAccessMode(PropertyAccessMode.Field);

            b.HasIndex(p => p.Status);
            b.HasIndex(p => p.Slug);
        });

        modelBuilder.Entity<Scene>(b =>
        {
            b.ToTable("production_scenes");
            b.HasKey(s => s.Id);
            b.Ignore(s => s.DomainEvents);

            b.Property(s => s.Id).HasMaxLength(128).IsRequired();

            b.Property(s => s.ProjectId)
                .HasConversion(id => id.Value, str => new ProjectId(str))
                .HasMaxLength(ProjectId.MaxLength)
                .IsRequired();

            b.Property(s => s.SceneId)
                .HasConversion(id => id.Value, str => new SceneId(str))
                .HasMaxLength(SceneId.MaxLength)
                .IsRequired();

            b.Property(s => s.Index).IsRequired();
            b.Property(s => s.Title).HasMaxLength(128).IsRequired();
            b.Property(s => s.VisualNote).HasMaxLength(1024);
            b.Property(s => s.StartSeconds).IsRequired();
            b.Property(s => s.EndSeconds).IsRequired();
            b.Property(s => s.SceneCodeId).HasMaxLength(64);
            b.Property(s => s.RenderedVideoAssetId).HasMaxLength(64);

            b.Property(s => s.CreatedAt).IsRequired();
            b.Property(s => s.UpdatedAt).IsRequired();

            b.HasMany(s => s.Fragments)
                .WithOne()
                .HasForeignKey(f => f.SceneEntityId)
                .OnDelete(DeleteBehavior.Cascade);

            b.Navigation(s => s.Fragments).UsePropertyAccessMode(PropertyAccessMode.Field);

            b.HasIndex(s => new { s.ProjectId, s.SceneId }).IsUnique();
            b.HasIndex(s => s.Index);
        });

        modelBuilder.Entity<SceneFragment>(b =>
        {
            b.ToTable("production_scene_fragments");
            b.HasKey(f => f.Id);
            b.Ignore(f => f.DomainEvents);

            b.Property(f => f.Id).HasMaxLength(64).IsRequired();
            b.Property(f => f.SceneEntityId).HasMaxLength(128).IsRequired();

            b.Property(f => f.FragmentId)
                .HasConversion(id => id.Value, str => new FragmentId(str))
                .HasMaxLength(FragmentId.MaxLength)
                .IsRequired();

            b.Property(f => f.Index).IsRequired();
            b.Property(f => f.Text).HasMaxLength(4000).IsRequired();
            b.Property(f => f.VisualNote).HasMaxLength(1024);
            b.Property(f => f.StartSeconds).IsRequired();
            b.Property(f => f.EndSeconds).IsRequired();

            // Scenario Engine: кэш-хэш и разделение declared/computed таймкодов
            b.Property(f => f.ContentHash).HasMaxLength(64).IsRequired();
            b.Property(f => f.DeclaredStartSeconds).IsRequired();
            b.Property(f => f.DeclaredEndSeconds).IsRequired();
            b.Property(f => f.IsMediaMissing).IsRequired();
            b.Property(f => f.IsAnimationMissing).IsRequired();

            b.Property(f => f.VoiceAssetId).HasMaxLength(64);
            b.Property(f => f.BrollAssetId).HasMaxLength(64);

            b.Property(f => f.CreatedAt).IsRequired();
            b.Property(f => f.UpdatedAt).IsRequired();

            b.HasIndex(f => f.SceneEntityId);
            b.HasIndex(f => f.Index);
        });
    }
}
