using Kernel.Events;
using Kernel.Platform.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.ChangeTracking;
using Skills.Domain;
using Skills.Domain.Entities;
using Skills.Domain.ValueObjects;

namespace Skills.Infrastructure.Persistence;

public class SkillsDbContext : SqliteDbContextBase
{
    public DbSet<Skill> Skills => Set<Skill>();

    public SkillsDbContext(DbContextOptions<SkillsDbContext> options, IEventBus? eventBus = null)
        : base(options, eventBus) { }

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        var tagsComparer = new ValueComparer<SkillTags>(
            (c1, c2) => (c1 == null && c2 == null) || (c1 != null && c2 != null && c1.SequenceEqual(c2)),
            c => c.Aggregate(0, (a, v) => HashCode.Combine(a, v.GetHashCode())),
            c => new SkillTags(c));

        modelBuilder.Entity<Skill>(b =>
        {
            b.ToTable("skills");
            b.HasKey(s => s.Id);

            // Игнорируем коллекцию событий сущности от попытки маппинга в колонку БД
            b.Ignore(s => s.DomainEvents);

            b.Property(s => s.Id)
                .HasConversion(id => id.Value, str => new SkillId(str))
                .HasMaxLength(SkillId.MaxLength)
                .IsRequired();

            b.Property(s => s.Name)
                .HasConversion(name => name.Value, str => new SkillName(str))
                .HasMaxLength(SkillName.MaxLength)
                .IsRequired();

            b.Property(s => s.Description)
                .HasMaxLength(Skill.MaxDescriptionLength);

            b.Property(s => s.Stage)
                .HasConversion(
                    stage => stage.ToSnakeCase(),
                    dbStr => SkillStageExtensions.ParseStage(dbStr))
                .HasMaxLength(64)
                .IsRequired();

            b.Property(s => s.Content)
                .HasConversion(c => c.Value, str => new PromptContent(str))
                .HasMaxLength(PromptContent.MaxLength)
                .IsRequired();

            b.Property(s => s.DefaultContent)
                .HasConversion(
                    c => c != null ? c.Value : null,
                    str => str != null ? new PromptContent(str) : null)
                .HasMaxLength(PromptContent.MaxLength);

            b.Property(s => s.Priority)
                .HasConversion(p => p.Value, val => new SkillPriority(val))
                .IsRequired();

            b.Property(s => s.Version)
                .HasConversion(v => v.Value, val => new SkillVersion(val))
                .IsRequired();

            b.Property(s => s.IsDefault).IsRequired();
            b.Property(s => s.IsEnabled).IsRequired();
            b.Property(s => s.CreatedAt).IsRequired();
            b.Property(s => s.UpdatedAt).IsRequired();

            b.Property(s => s.Tags)
                .HasConversion(
                    tags => tags.ToJson(),
                    json => SkillTags.FromJson(json))
                .Metadata.SetValueComparer(tagsComparer);

            b.HasIndex(s => s.Stage);
            b.HasIndex(s => s.IsEnabled);
            b.HasIndex(s => s.Priority);
        });
    }
}
