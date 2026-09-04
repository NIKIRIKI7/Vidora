using Kernel.Exceptions;
using Kernel.Platform.Persistence;
using MotionContext.Domain.Events;
using MotionContext.Domain.ValueObjects;

namespace MotionContext.Domain.Entities;

public class RenderJob : BaseEntity<RenderJobId>
{
    public SceneCodeId SceneCodeId { get; private set; }
    public RevisionNumber TargetRevisionNumber { get; private set; }
    public RenderJobStatus Status { get; private set; }
    public RenderProgressInfo Progress { get; private set; }
    public string? OutputPath { get; private set; }
    public string? ErrorMessage { get; private set; }
    public DateTimeOffset? StartedAt { get; private set; }
    public DateTimeOffset? CompletedAt { get; private set; }

    protected RenderJob() { }

    public static RenderJob Enqueue(SceneCodeId sceneCodeId, RevisionNumber revisionNumber, int totalFrames)
    {
        var job = new RenderJob
        {
            Id = RenderJobId.New(),
            SceneCodeId = sceneCodeId,
            TargetRevisionNumber = revisionNumber,
            Status = RenderJobStatus.Queued,
            Progress = RenderProgressInfo.Initial(totalFrames),
            CreatedAt = DateTimeOffset.UtcNow,
            UpdatedAt = DateTimeOffset.UtcNow
        };

        job.AddDomainEvent(new RenderJobEnqueuedEvent(job.Id.Value, sceneCodeId.Value, revisionNumber.Value));
        return job;
    }

    public void MarkRendering()
    {
        if (Status != RenderJobStatus.Queued)
            throw new DomainConflictException($"Невозможно перевести задачу из статуса {Status} в Rendering.");

        Status = RenderJobStatus.Rendering;
        StartedAt = DateTimeOffset.UtcNow;
        UpdatedAt = DateTimeOffset.UtcNow;

        AddDomainEvent(new RenderJobStartedEvent(Id.Value, SceneCodeId.Value));
    }

    public void UpdateProgress(int renderedFrames, double currentFps = 0.0)
    {
        if (Status is not (RenderJobStatus.Rendering or RenderJobStatus.Muxing))
            return;

        if (renderedFrames < Progress.RenderedFrames)
            return;

        Progress = new RenderProgressInfo(renderedFrames, Progress.TotalFrames, currentFps);
        UpdatedAt = DateTimeOffset.UtcNow;

        AddDomainEvent(new RenderProgressUpdatedEvent(
            Id.Value,
            Progress.RenderedFrames,
            Progress.TotalFrames,
            Progress.Percentage,
            Progress.CurrentFps));
    }

    public void MarkMuxing()
    {
        if (Status != RenderJobStatus.Rendering)
            return;

        Status = RenderJobStatus.Muxing;
        UpdatedAt = DateTimeOffset.UtcNow;
    }

    public void MarkCompleted(string finalOutputPath, long fileSizeBytes, double durationSeconds)
    {
        if (Status is RenderJobStatus.Done or RenderJobStatus.Failed or RenderJobStatus.Cancelled)
            return;

        if (string.IsNullOrWhiteSpace(finalOutputPath))
            throw new ValidationException("output_path", "Финальный путь видеофайла обязателен.");

        Status = RenderJobStatus.Done;
        OutputPath = finalOutputPath.Trim();
        CompletedAt = DateTimeOffset.UtcNow;
        Progress = RenderProgressInfo.Completed(Progress.TotalFrames);
        UpdatedAt = DateTimeOffset.UtcNow;

        AddDomainEvent(new RenderJobCompletedEvent(Id.Value, OutputPath, fileSizeBytes, durationSeconds));
    }

    public void MarkFailed(string reason)
    {
        if (Status is RenderJobStatus.Done or RenderJobStatus.Cancelled)
            return;

        Status = RenderJobStatus.Failed;
        ErrorMessage = reason?.Trim() ?? "Неизвестная ошибка рендеринга";
        CompletedAt = DateTimeOffset.UtcNow;
        UpdatedAt = DateTimeOffset.UtcNow;

        AddDomainEvent(new RenderJobFailedEvent(Id.Value, ErrorMessage));
    }

    public void Cancel()
    {
        if (Status is RenderJobStatus.Done or RenderJobStatus.Failed or RenderJobStatus.Cancelled)
            return;

        Status = RenderJobStatus.Cancelled;
        CompletedAt = DateTimeOffset.UtcNow;
        UpdatedAt = DateTimeOffset.UtcNow;

        AddDomainEvent(new RenderJobCancelledEvent(Id.Value));
    }
}
