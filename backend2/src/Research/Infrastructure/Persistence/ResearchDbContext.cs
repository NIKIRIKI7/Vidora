using Kernel.Events;
using Kernel.Platform.Persistence;
using Microsoft.EntityFrameworkCore;
using Research.Domain.Entities;
using Research.Domain.ValueObjects;

namespace Research.Infrastructure.Persistence;

public class ResearchDbContext : SqliteDbContextBase
{
    public DbSet<ResearchRun> ResearchRuns => Set<ResearchRun>();
    public DbSet<VideoCandidate> Candidates => Set<VideoCandidate>();
    public DbSet<EarlySignal> Signals => Set<EarlySignal>();
    public DbSet<Opportunity> Opportunities => Set<Opportunity>();

    public ResearchDbContext(DbContextOptions<ResearchDbContext> options, IEventBus? eventBus = null)
        : base(options, eventBus) { }

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        modelBuilder.Entity<ResearchRun>(b =>
        {
            b.ToTable("research_runs");
            b.HasKey(r => r.Id);
            b.Ignore(r => r.DomainEvents);

            b.Property(r => r.Id)
                .HasConversion(id => id.Value, str => new ResearchRunId(str))
                .HasMaxLength(ResearchRunId.MaxLength)
                .IsRequired();

            b.Property(r => r.TopicQuery).HasMaxLength(ResearchRun.MaxQueryLength).IsRequired();
            b.Property(r => r.Niche).HasMaxLength(128).IsRequired();
            b.Property(r => r.Status).HasConversion<string>().HasMaxLength(32).IsRequired();
            b.Property(r => r.ErrorMessage).HasMaxLength(2048);
            b.Property(r => r.CompletedAt);
            b.Property(r => r.CreatedAt).IsRequired();
            b.Property(r => r.UpdatedAt).IsRequired();

            b.HasMany(r => r.Candidates)
                .WithOne()
                .HasForeignKey(c => c.ResearchRunId)
                .OnDelete(DeleteBehavior.Cascade);

            b.HasMany(r => r.Signals)
                .WithOne()
                .HasForeignKey(s => s.ResearchRunId)
                .OnDelete(DeleteBehavior.Cascade);

            b.HasMany(r => r.Opportunities)
                .WithOne()
                .HasForeignKey(o => o.ResearchRunId)
                .OnDelete(DeleteBehavior.Cascade);

            b.Navigation(r => r.Candidates).UsePropertyAccessMode(PropertyAccessMode.Field);
            b.Navigation(r => r.Signals).UsePropertyAccessMode(PropertyAccessMode.Field);
            b.Navigation(r => r.Opportunities).UsePropertyAccessMode(PropertyAccessMode.Field);

            b.HasIndex(r => r.Status);
            b.HasIndex(r => r.CreatedAt);
        });

        modelBuilder.Entity<VideoCandidate>(b =>
        {
            b.ToTable("research_video_candidates");
            b.HasKey(c => c.Id);
            b.Ignore(c => c.DomainEvents);

            b.Property(c => c.Id).HasMaxLength(128).IsRequired();
            b.Property(c => c.ResearchRunId)
                .HasConversion(id => id.Value, str => new ResearchRunId(str))
                .HasMaxLength(ResearchRunId.MaxLength)
                .IsRequired();

            b.Property(c => c.VideoId).HasMaxLength(64).IsRequired();
            b.Property(c => c.Title).HasMaxLength(512).IsRequired();
            b.Property(c => c.ChannelTitle).HasMaxLength(256).IsRequired();
            b.Property(c => c.ChannelId).HasMaxLength(128).IsRequired();
            b.Property(c => c.ChannelSubscriberCount).IsRequired();
            b.Property(c => c.ViewCount).IsRequired();
            b.Property(c => c.PublishedAt).IsRequired();
            b.Property(c => c.DurationSeconds).IsRequired();

            b.ComplexProperty(c => c.Momentum, mp =>
            {
                mp.Property(m => m.ViewsPerHour).HasColumnName("views_per_hour").IsRequired();
                mp.Property(m => m.OutlierMultiplier).HasColumnName("outlier_multiplier").IsRequired();
                mp.Property(m => m.Score).HasColumnName("momentum_score").IsRequired();
            });

            b.Property(c => c.ThumbnailUrl).HasMaxLength(1024);
            b.Property(c => c.TopCommentsJson).HasColumnType("TEXT").IsRequired();
            b.Property(c => c.CreatedAt).IsRequired();
            b.Property(c => c.UpdatedAt).IsRequired();

            b.HasIndex(c => c.ResearchRunId);
            b.HasIndex(c => c.VideoId);
        });

        modelBuilder.Entity<EarlySignal>(b =>
        {
            b.ToTable("research_early_signals");
            b.HasKey(s => s.Id);
            b.Ignore(s => s.DomainEvents);

            b.Property(s => s.Id).HasMaxLength(128).IsRequired();
            b.Property(s => s.ResearchRunId)
                .HasConversion(id => id.Value, str => new ResearchRunId(str))
                .HasMaxLength(ResearchRunId.MaxLength)
                .IsRequired();

            b.Property(s => s.Topic).HasMaxLength(256).IsRequired();
            b.Property(s => s.KeywordClusterJson).HasColumnType("TEXT").IsRequired();
            b.Property(s => s.GrowthVelocityPercent).IsRequired();
            b.Property(s => s.SupportingVideoCount).IsRequired();
            b.Property(s => s.AggregateVph).IsRequired();
            b.Property(s => s.Confidence).IsRequired();
            b.Property(s => s.SourceUrl).HasMaxLength(512).HasDefaultValue(string.Empty);
            b.Property(s => s.SourcePlatform).HasMaxLength(64).HasDefaultValue(string.Empty);
            b.Property(s => s.GrowthPct).HasMaxLength(64).HasDefaultValue(string.Empty);
            b.Property(s => s.CreatedAt).IsRequired();
            b.Property(s => s.UpdatedAt).IsRequired();

            b.HasIndex(s => s.ResearchRunId);
        });

        modelBuilder.Entity<Opportunity>(b =>
        {
            b.ToTable("research_opportunities");
            b.HasKey(o => o.Id);
            b.Ignore(o => o.DomainEvents);

            b.Property(o => o.Id).HasMaxLength(128).IsRequired();
            b.Property(o => o.ResearchRunId)
                .HasConversion(id => id.Value, str => new ResearchRunId(str))
                .HasMaxLength(ResearchRunId.MaxLength)
                .IsRequired();

            b.Property(o => o.AngleTitle).HasMaxLength(512).IsRequired();
            b.Property(o => o.HookHypothesis).HasMaxLength(1024).IsRequired();
            b.Property(o => o.TargetAudience).HasMaxLength(256).IsRequired();
            b.Property(o => o.RecommendedFormat).HasMaxLength(64).IsRequired();

            b.ComplexProperty(o => o.Score, sp =>
            {
                sp.Property(s => s.Value).HasColumnName("opportunity_score").IsRequired();
                sp.Property(s => s.DemandVelocity).HasColumnName("demand_velocity").IsRequired();
                sp.Property(s => s.CompetitionIndex).HasColumnName("competition_index").IsRequired();
                sp.Property(s => s.ViralConfidence).HasColumnName("viral_confidence").IsRequired();
            });

            b.Property(o => o.FrictionPoint).HasMaxLength(512).IsRequired();
            b.Property(o => o.WhyItWorks).HasMaxLength(1024).IsRequired();
            b.Property(o => o.ReferenceVideoIdsJson).HasColumnType("TEXT").IsRequired();
            b.Property(o => o.CreatedAt).IsRequired();
            b.Property(o => o.UpdatedAt).IsRequired();

            b.HasIndex(o => o.ResearchRunId);
        });
    }
}
