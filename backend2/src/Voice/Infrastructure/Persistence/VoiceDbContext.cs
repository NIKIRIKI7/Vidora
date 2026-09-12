using System.Text.Json;
using Kernel.Events;
using Kernel.Platform.Persistence;
using Microsoft.EntityFrameworkCore;
using Voice.Domain;
using Voice.Domain.Entities;
using Voice.Domain.ValueObjects;

namespace Voice.Infrastructure.Persistence;

public class VoiceDbContext : SqliteDbContextBase
{
    public DbSet<TtsJob> TtsJobs => Set<TtsJob>();
    public DbSet<SpeakerProfile> SpeakerProfiles => Set<SpeakerProfile>();

    public VoiceDbContext(DbContextOptions<VoiceDbContext> options, IEventBus? eventBus = null)
        : base(options, eventBus) { }

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        modelBuilder.Entity<TtsJob>(b =>
        {
            b.ToTable("voice_tts_jobs");
            b.HasKey(j => j.Id);
            b.Ignore(j => j.DomainEvents);

            b.Property(j => j.Id)
                .HasConversion(id => id.Value, str => new TtsJobId(str))
                .HasMaxLength(TtsJobId.MaxLength)
                .IsRequired();

            b.Property(j => j.Text)
                .HasMaxLength(TtsJob.MaxTextLength)
                .IsRequired();

            b.Property(j => j.Status)
                .HasConversion<string>()
                .HasMaxLength(32)
                .IsRequired();

            b.Property(j => j.RawAudioPath).HasMaxLength(512);
            b.Property(j => j.ProcessedAudioPath).HasMaxLength(512);
            b.Property(j => j.RegisteredMediaAssetId).HasMaxLength(64);
            b.Property(j => j.DurationSeconds);
            b.Property(j => j.FileSizeBytes);
            b.Property(j => j.ErrorMessage).HasMaxLength(2048);

            b.Property(j => j.Spec)
                .HasConversion(
                    spec => JsonSerializer.Serialize(spec, (JsonSerializerOptions?)null),
                    json => JsonSerializer.Deserialize<VoiceSpec>(json.Replace("\"LocalOmniVoice\"", "\"LocalTts\""), (JsonSerializerOptions?)null)!)
                .HasColumnType("TEXT")
                .IsRequired();

            b.Property(j => j.Alignment)
                .HasConversion(
                    align => JsonSerializer.Serialize(align, (JsonSerializerOptions?)null),
                    json => JsonSerializer.Deserialize<AlignmentData>(json, (JsonSerializerOptions?)null) ?? AlignmentData.Empty)
                .HasColumnType("TEXT")
                .IsRequired();

            b.Property(j => j.CreatedAt).IsRequired();
            b.Property(j => j.UpdatedAt).IsRequired();

            b.HasIndex(j => j.Status);
            b.HasIndex(j => j.CreatedAt);
        });

        modelBuilder.Entity<SpeakerProfile>(b =>
        {
            b.ToTable("voice_speaker_profiles");
            b.HasKey(s => s.Id);
            b.Ignore(s => s.DomainEvents);

            b.Property(s => s.Id).HasMaxLength(80).IsRequired();

            b.Property(s => s.SpeakerId)
                .HasConversion(id => id.Value, str => new SpeakerId(str))
                .HasMaxLength(SpeakerId.MaxLength)
                .IsRequired();

            b.Property(s => s.Name)
                .HasMaxLength(SpeakerProfile.MaxNameLength)
                .IsRequired();

            b.Property(s => s.Description)
                .HasMaxLength(SpeakerProfile.MaxDescriptionLength);

            b.Property(s => s.SourceType)
                .HasConversion<string>()
                .HasMaxLength(16)
                .IsRequired();

            b.Property(s => s.Engine)
                .HasConversion(
                    v => v.ToString(),
                    v => v == "LocalOmniVoice" ? VoiceEngineType.LocalTts : Enum.Parse<VoiceEngineType>(v, true))
                .HasMaxLength(32)
                .IsRequired();

            b.Property(s => s.Language)
                .HasMaxLength(16)
                .IsRequired();

            b.Property(s => s.Gender).HasMaxLength(16);

            b.Property(s => s.IsDefault);
            b.Property(s => s.IsActive);

            b.Property(s => s.DesignedDescription).HasMaxLength(1000);
            b.Property(s => s.CloneReferenceAudioPath).HasMaxLength(512);
            b.Property(s => s.CloneReferenceText).HasMaxLength(2000);
            b.Property(s => s.PreviewAudioPath).HasMaxLength(512);
            b.Property(s => s.LocalEngineId).HasMaxLength(64);
            b.Property(s => s.LocalEmbeddingPath).HasMaxLength(512);

            b.Property(s => s.CreatedAt).IsRequired();
            b.Property(s => s.UpdatedAt).IsRequired();

            b.HasIndex(s => s.SourceType);
            b.HasIndex(s => s.IsActive);
        });
    }
}
