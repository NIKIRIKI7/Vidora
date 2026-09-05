using Kernel.Events;
using Voice.Domain.ValueObjects;

namespace Voice.Domain.Events;

public sealed record SpeakerVoiceDesignedEvent(
    string AggregateId,
    string Description,
    VoiceEngineType Engine) : DomainEvent(AggregateId);

public sealed record SpeakerClonedEvent(
    string AggregateId,
    VoiceEngineType Engine,
    string ReferenceAudioPath) : DomainEvent(AggregateId);

public sealed record SpeakerUpdatedEvent(
    string AggregateId) : DomainEvent(AggregateId);

public sealed record SpeakerDeletedEvent(
    string AggregateId) : DomainEvent(AggregateId);
