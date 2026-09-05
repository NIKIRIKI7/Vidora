using Kernel.Events;

namespace Research.Domain.Events;

public sealed record ResearchRunStartedEvent(
    string AggregateId,
    string TopicQuery,
    string Niche) : DomainEvent(AggregateId);

public sealed record ResearchStageChangedEvent(
    string AggregateId,
    ResearchStatus Stage) : DomainEvent(AggregateId);

public sealed record EarlySignalsIdentifiedEvent(
    string AggregateId,
    int SignalCount) : DomainEvent(AggregateId);

public sealed record OpportunitiesSynthesizedEvent(
    string AggregateId,
    int OpportunityCount) : DomainEvent(AggregateId);

public sealed record ResearchRunCompletedEvent(
    string AggregateId,
    int CandidateCount,
    int SignalCount,
    int OpportunityCount) : DomainEvent(AggregateId);

public sealed record ResearchRunFailedEvent(
    string AggregateId,
    string Reason) : DomainEvent(AggregateId);

public sealed record ResearchRunCancelledEvent(
    string AggregateId) : DomainEvent(AggregateId);
