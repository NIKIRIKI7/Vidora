using System.Threading.Channels;
using Microsoft.Extensions.Logging;

namespace Kernel.Events;

public sealed class InMemoryEventBus : IEventBus
{
    private readonly Channel<IDomainEvent> _channel;
    private readonly ILogger<InMemoryEventBus> _logger;

    public InMemoryEventBus(ILogger<InMemoryEventBus> logger, int capacity = 10_000)
    {
        _logger = logger;
        _channel = Channel.CreateBounded<IDomainEvent>(new BoundedChannelOptions(capacity)
        {
            SingleReader = true,
            SingleWriter = false,
            FullMode = BoundedChannelFullMode.Wait
        });
    }

    public ChannelReader<IDomainEvent> Reader => _channel.Reader;

    public async Task PublishAsync<TEvent>(TEvent domainEvent, CancellationToken cancellationToken = default)
        where TEvent : IDomainEvent
    {
        ArgumentNullException.ThrowIfNull(domainEvent);

        await _channel.Writer.WriteAsync(domainEvent, cancellationToken);

        _logger.LogInformation("[EventBus] Опубликовано: {EventType} (ID: {EventId}, Aggregate: {AggregateId})",
            domainEvent.EventType, domainEvent.EventId, domainEvent.AggregateId);
    }
}
