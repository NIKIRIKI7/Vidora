using Kernel.Events;

namespace ProductionContext.Domain.Events;

public sealed record ProjectCreatedEvent(
    string AggregateId,
    string Title,
    string Slug) : DomainEvent(AggregateId);

public sealed record ScenarioParsedEvent(
    string AggregateId,
    int SceneCount,
    int FragmentCount) : DomainEvent(AggregateId);

public sealed record SceneTimingsRecalculatedEvent(
    string AggregateId,
    double TotalDurationSeconds) : DomainEvent(AggregateId);

public sealed record PipelineStepChangedEvent(
    string AggregateId,
    PipelineStep Step) : DomainEvent(AggregateId);

public sealed record ProjectExportedEvent(
    string AggregateId,
    double DurationSeconds) : DomainEvent(AggregateId);

public sealed record ProjectBuildFailedEvent(
    string AggregateId,
    PipelineStep Step,
    string Reason) : DomainEvent(AggregateId);

public sealed record ProjectBuildStartedEvent(
    string AggregateId,
    int SceneCount) : DomainEvent(AggregateId);

public sealed record ProjectBuildCompletedEvent(
    string AggregateId,
    int SceneCount,
    double DurationSeconds) : DomainEvent(AggregateId);
