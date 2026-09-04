using System.Collections.Concurrent;
using Microsoft.Extensions.Logging;

namespace Kernel.Events;

public sealed class InMemoryDeadLetterQueue : IEventDeadLetterQueue
{
    private const int DefaultMaxQueueSize = 500;
    private readonly ConcurrentQueue<DeadLetterEntry> _queue = new();
    private readonly int _maxSize;
    private readonly ILogger<InMemoryDeadLetterQueue> _logger;

    public InMemoryDeadLetterQueue(ILogger<InMemoryDeadLetterQueue> logger, int maxSize = DefaultMaxQueueSize)
    {
        _logger = logger;
        _maxSize = maxSize;
    }

    public void RecordFailure(IDomainEvent domainEvent, string handlerName, Exception error)
    {
        var entry = new DeadLetterEntry(domainEvent, handlerName, error, DateTimeOffset.UtcNow);
        _queue.Enqueue(entry);

        _logger.LogWarning("[DLQ] Событие {EventId} ({EventType}) добавлено в DLQ. Обработчик: {Handler}. Всего записей: {Count}",
            domainEvent.EventId, domainEvent.EventType, handlerName, _queue.Count);

        while (_queue.Count > _maxSize && _queue.TryDequeue(out _))
        {
        }
    }

    public IReadOnlyCollection<DeadLetterEntry> GetFailures() => _queue.ToArray();
}
