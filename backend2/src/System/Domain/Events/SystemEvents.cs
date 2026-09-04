using Kernel.Events;

namespace SystemContext.Domain.Events;

public sealed record SystemSettingChangedEvent(string AggregateId, string Value)
    : DomainEvent(AggregateId);

public sealed record AiModelDownloadStartedEvent(string AggregateId, string ModelName)
    : DomainEvent(AggregateId);

public sealed record AiModelReadyEvent(string AggregateId, string ModelName, long SizeBytes)
    : DomainEvent(AggregateId);

public sealed record AiModelDownloadFailedEvent(string AggregateId, string ModelName, string Reason)
    : DomainEvent(AggregateId);
