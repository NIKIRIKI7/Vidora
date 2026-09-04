using Kernel.Exceptions;
using Kernel.Platform.Persistence;
using Voice.Domain.Events;
using Voice.Domain.ValueObjects;

namespace Voice.Domain.Entities;

public class TtsJob : BaseEntity<TtsJobId>
{
    public const int MaxTextLength = 8000;

    public string Text { get; private set; } = string.Empty;
    public VoiceSpec Spec { get; private set; } = null!;
    public TtsJobStatus Status { get; private set; }
    public string? RawAudioPath { get; private set; }
    public string? ProcessedAudioPath { get; private set; }
    public string? RegisteredMediaAssetId { get; private set; }
    public double? DurationSeconds { get; private set; }
    public long? FileSizeBytes { get; private set; }
    public AlignmentData Alignment { get; private set; } = AlignmentData.Empty;
    public string? ErrorMessage { get; private set; }

    protected TtsJob() { }

    public static TtsJob Create(TtsJobId id, string text, VoiceSpec spec)
    {
        if (string.IsNullOrWhiteSpace(text))
        {
            throw new ValidationException("text", "Текст для синтеза не может быть пустым.");
        }
        if (text.Length > MaxTextLength)
        {
            throw new ValidationException("text", $"Длина текста ({text.Length}) превышает предел {MaxTextLength} знаков.");
        }

        var job = new TtsJob
        {
            Id = id,
            Text = text.Trim(),
            Spec = spec,
            Status = TtsJobStatus.Queued,
            CreatedAt = DateTimeOffset.UtcNow,
            UpdatedAt = DateTimeOffset.UtcNow
        };

        job.AddDomainEvent(new TtsJobCreatedEvent(job.Id.Value, spec.Engine, spec.SpeakerId));
        return job;
    }

    public void MarkSynthesizing()
    {
        Status = TtsJobStatus.Synthesizing;
        UpdatedAt = DateTimeOffset.UtcNow;
    }

    public void MarkSynthesized(string rawPath, double durationSeconds, long sizeBytes)
    {
        if (string.IsNullOrWhiteSpace(rawPath))
            throw new ValidationException("raw_path", "Путь к исходному аудиофайлу не может быть пустым.");

        RawAudioPath = rawPath.Trim();
        DurationSeconds = Math.Round(durationSeconds, 3);
        FileSizeBytes = sizeBytes;
        Status = TtsJobStatus.Aligning;
        UpdatedAt = DateTimeOffset.UtcNow;
        AddDomainEvent(new TtsSynthesisCompletedEvent(Id.Value, RawAudioPath, DurationSeconds.Value));
    }

    public void AttachAlignment(AlignmentData alignment)
    {
        ArgumentNullException.ThrowIfNull(alignment);
        Alignment = alignment;
        Status = TtsJobStatus.ProcessingAudio;
        UpdatedAt = DateTimeOffset.UtcNow;
        AddDomainEvent(new AlignmentProducedEvent(Id.Value, alignment.Words.Count, alignment.TotalDurationMs));
    }

    public void MarkReady(string processedPath, string? mediaAssetId)
    {
        if (string.IsNullOrWhiteSpace(processedPath))
            throw new ValidationException("processed_path", "Путь к обработанному аудиофайлу обязателен.");

        ProcessedAudioPath = processedPath.Trim();
        RegisteredMediaAssetId = mediaAssetId?.Trim();
        Status = TtsJobStatus.Ready;
        ErrorMessage = null;
        UpdatedAt = DateTimeOffset.UtcNow;

        var durationMs = (long)((DurationSeconds ?? 0) * 1000);
        AddDomainEvent(new VoiceJobReadyEvent(Id.Value, ProcessedAudioPath, RegisteredMediaAssetId, durationMs));
    }

    public void MarkFailed(string reason)
    {
        Status = TtsJobStatus.Failed;
        ErrorMessage = reason?.Trim();
        UpdatedAt = DateTimeOffset.UtcNow;
        AddDomainEvent(new VoiceJobFailedEvent(Id.Value, ErrorMessage ?? "Неизвестная ошибка"));
    }
}
