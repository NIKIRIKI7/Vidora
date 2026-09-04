using Kernel.Events;
using Skills.Domain;

namespace Skills.Domain.Events;

public sealed record SkillCreatedEvent(string AggregateId, string Name, SkillStage Stage)
    : DomainEvent(AggregateId);

public sealed record SkillUpdatedEvent(string AggregateId, int NewVersion)
    : DomainEvent(AggregateId);

public sealed record SkillResetEvent(string AggregateId)
    : DomainEvent(AggregateId);

public sealed record SkillDeletedEvent(string AggregateId)
    : DomainEvent(AggregateId);
