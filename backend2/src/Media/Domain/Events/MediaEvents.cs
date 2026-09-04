using Kernel.Events;
using MediaContext.Domain;

namespace MediaContext.Domain.Events;

public sealed record MediaAssetUploadedEvent(
    string AggregateId,
    string Title,
    MediaType Type,
    string StoragePath) : DomainEvent(AggregateId);

public sealed record MediaAssetNormalizedEvent(
    string AggregateId,
    string NormalizedPath,
    int Width,
    int Height,
    double Fps) : DomainEvent(AggregateId);

public sealed record MediaAssetMetadataUpdatedEvent(
    string AggregateId,
    string Title) : DomainEvent(AggregateId);

public sealed record MediaAssetDeletedEvent(
    string AggregateId,
    string StoragePath) : DomainEvent(AggregateId);
