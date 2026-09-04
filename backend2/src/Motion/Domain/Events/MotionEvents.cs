using Kernel.Events;
using MotionContext.Domain.ValueObjects;

namespace MotionContext.Domain.Events;

public sealed record SceneCodeGeneratedEvent(
    string AggregateId,
    string ProjectId,
    string SceneId,
    int RevisionNumber,
    string SourceHash) : DomainEvent(AggregateId);

public sealed record SceneRevisionCreatedEvent(
    string AggregateId,
    int RevisionNumber,
    RevisionOrigin Origin,
    string SourceHash) : DomainEvent(AggregateId);

public sealed record SceneRolledBackEvent(
    string AggregateId,
    int TargetRevision,
    int NewRevision) : DomainEvent(AggregateId);

public sealed record RenderJobEnqueuedEvent(
    string AggregateId,
    string SceneCodeId,
    int RevisionNumber) : DomainEvent(AggregateId);

public sealed record RenderJobStartedEvent(
    string AggregateId,
    string SceneCodeId) : DomainEvent(AggregateId);

public sealed record RenderProgressUpdatedEvent(
    string AggregateId,
    int RenderedFrames,
    int TotalFrames,
    double Percentage,
    double CurrentFps) : DomainEvent(AggregateId);

public sealed record RenderJobCompletedEvent(
    string AggregateId,
    string OutputFilePath,
    long FileSizeBytes,
    double DurationSeconds) : DomainEvent(AggregateId);

public sealed record RenderJobFailedEvent(
    string AggregateId,
    string Reason) : DomainEvent(AggregateId);

public sealed record RenderJobCancelledEvent(
    string AggregateId) : DomainEvent(AggregateId);
