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
    string OutputFilePath,
    double DurationSeconds,
    long FileSizeBytes) : DomainEvent(AggregateId);

public sealed record ProjectBuildFailedEvent(
    string AggregateId,
    PipelineStep Step,
    string Reason) : DomainEvent(AggregateId);
