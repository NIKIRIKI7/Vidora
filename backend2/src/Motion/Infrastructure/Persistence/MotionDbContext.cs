using Kernel.Events;
using Kernel.Platform.Persistence;
using Microsoft.EntityFrameworkCore;
using MotionContext.Domain.Entities;
using MotionContext.Domain.ValueObjects;

namespace MotionContext.Infrastructure.Persistence;

public class MotionDbContext : SqliteDbContextBase
{
    public DbSet<SceneCode> SceneCodes => Set<SceneCode>();
    public DbSet<SceneRevision> SceneRevisions => Set<SceneRevision>();
    public DbSet<RenderJob> RenderJobs => Set<RenderJob>();

    public MotionDbContext(DbContextOptions<MotionDbContext> options, IEventBus? eventBus = null)
        : base(options, eventBus) { }

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        modelBuilder.Entity<SceneCode>(b =>
        {
            b.ToTable("motion_scene_codes");
            b.HasKey(s => s.Id);
            b.Ignore(s => s.DomainEvents);

            b.Property(s => s.Id)
                .HasConversion(id => id.Value, str => new SceneCodeId(str))
                .HasMaxLength(SceneCodeId.MaxLength)
                .IsRequired();

            b.Property(s => s.ProjectId).HasMaxLength(64).IsRequired();
            b.Property(s => s.SceneId).HasMaxLength(64).IsRequired();

            b.Property(s => s.CurrentRevisionNumber)
                .HasConversion(r => r.Value, val => new RevisionNumber(val))
                .IsRequired();

            b.ComplexProperty(s => s.Composition, cp =>
            {
                cp.Property(c => c.Width).HasColumnName("width").IsRequired();
                cp.Property(c => c.Height).HasColumnName("height").IsRequired();
                cp.Property(c => c.Fps).HasColumnName("fps").IsRequired();
                cp.Property(c => c.DurationInFrames).HasColumnName("duration_in_frames").IsRequired();
            });

            b.Property(s => s.CreatedAt).IsRequired();
            b.Property(s => s.UpdatedAt).IsRequired();

            b.HasMany(s => s.Revisions)
                .WithOne()
                .HasForeignKey(r => r.SceneCodeId)
                .OnDelete(DeleteBehavior.Cascade);

            b.HasIndex(s => new { s.ProjectId, s.SceneId }).IsUnique();
        });

        modelBuilder.Entity<SceneRevision>(b =>
        {
            b.ToTable("motion_scene_revisions");
            b.HasKey(r => r.Id);
            b.Ignore(r => r.DomainEvents);

            b.Property(r => r.Id).ValueGeneratedOnAdd();

            b.Property(r => r.SceneCodeId)
                .HasConversion(id => id.Value, str => new SceneCodeId(str))
                .HasMaxLength(SceneCodeId.MaxLength)
                .IsRequired();

            b.Property(r => r.RevisionNumber)
                .HasConversion(rn => rn.Value, val => new RevisionNumber(val))
                .IsRequired();

            b.Property(r => r.SourceCode)
                .HasConversion(c => c.Value, str => new TsxCode(str))
                .IsRequired();

            b.Property(r => r.SourceHash).HasMaxLength(64).IsRequired();
            b.Property(r => r.Origin).HasConversion<string>().HasMaxLength(32).IsRequired();
            b.Property(r => r.CreatedAt).IsRequired();
            b.Property(r => r.UpdatedAt).IsRequired();

            b.HasIndex(r => new { r.SceneCodeId, r.RevisionNumber }).IsUnique();
        });

        modelBuilder.Entity<RenderJob>(b =>
        {
            b.ToTable("motion_render_jobs");
            b.HasKey(j => j.Id);
            b.Ignore(j => j.DomainEvents);

            b.Property(j => j.Id)
                .HasConversion(id => id.Value, str => new RenderJobId(str))
                .HasMaxLength(RenderJobId.MaxLength)
                .IsRequired();

            b.Property(j => j.SceneCodeId)
                .HasConversion(id => id.Value, str => new SceneCodeId(str))
                .HasMaxLength(SceneCodeId.MaxLength)
                .IsRequired();

            b.Property(j => j.TargetRevisionNumber)
                .HasConversion(rn => rn.Value, val => new RevisionNumber(val))
                .IsRequired();

            b.Property(j => j.Status).HasConversion<string>().HasMaxLength(32).IsRequired();

            b.ComplexProperty(j => j.Progress, pp =>
            {
                pp.Property(p => p.RenderedFrames).HasColumnName("rendered_frames").IsRequired();
                pp.Property(p => p.TotalFrames).HasColumnName("total_frames").IsRequired();
                pp.Property(p => p.CurrentFps).HasColumnName("current_fps").IsRequired();
            });

            b.Property(j => j.OutputPath).HasMaxLength(512);
            b.Property(j => j.ErrorMessage).HasMaxLength(2048);
            b.Property(j => j.StartedAt);
            b.Property(j => j.CompletedAt);
            b.Property(j => j.CreatedAt).IsRequired();
            b.Property(j => j.UpdatedAt).IsRequired();

            b.HasIndex(j => j.Status);
            b.HasIndex(j => j.SceneCodeId);
        });
    }
}
