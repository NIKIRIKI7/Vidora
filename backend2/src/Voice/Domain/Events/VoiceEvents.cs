using Kernel.Events;
using Voice.Domain.ValueObjects;

namespace Voice.Domain.Events;

public sealed record TtsJobCreatedEvent(
    string AggregateId,
    VoiceEngineType Engine,
    string SpeakerId) : DomainEvent(AggregateId);

public sealed record TtsSynthesisCompletedEvent(
    string AggregateId,
    string AudioPath,
    double DurationSeconds) : DomainEvent(AggregateId);

public sealed record AlignmentProducedEvent(
    string AggregateId,
    int WordCount,
    long DurationMs) : DomainEvent(AggregateId);

public sealed record VoiceJobReadyEvent(
    string AggregateId,
    string StoragePath,
    string? MediaAssetId,
    long DurationMs) : DomainEvent(AggregateId);

public sealed record VoiceJobFailedEvent(
    string AggregateId,
    string Reason) : DomainEvent(AggregateId);

public sealed record BatchVoiceCompletedEvent(
    string AggregateId,
    int TotalJobs,
    double TotalDurationSeconds) : DomainEvent(AggregateId);
