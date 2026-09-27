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
