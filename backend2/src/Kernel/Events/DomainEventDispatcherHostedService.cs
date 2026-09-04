using System.Collections.Concurrent;
using System.Diagnostics;
using System.Linq.Expressions;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace Kernel.Events;

public sealed class DomainEventDispatcherHostedService : BackgroundService
{
    private static readonly ConcurrentDictionary<(Type HandlerType, Type EventType), Func<object, IDomainEvent, CancellationToken, Task>> InvokerCache = new();

    private readonly InMemoryEventBus _eventBus;
    private readonly IEventDeadLetterQueue _deadLetterQueue;
    private readonly IServiceProvider _serviceProvider;
    private readonly ILogger<DomainEventDispatcherHostedService> _logger;

    public DomainEventDispatcherHostedService(
        InMemoryEventBus eventBus,
        IEventDeadLetterQueue deadLetterQueue,
        IServiceProvider serviceProvider,
        ILogger<DomainEventDispatcherHostedService> logger)
    {
        _eventBus = eventBus;
        _deadLetterQueue = deadLetterQueue;
        _serviceProvider = serviceProvider;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _logger.LogInformation("[EventDispatcher] Сервис диспетчеризации запущен.");

        while (await _eventBus.Reader.WaitToReadAsync(stoppingToken))
        {
            while (_eventBus.Reader.TryRead(out var domainEvent))
            {
                await DispatchAsync(domainEvent, stoppingToken);
            }
        }
    }

    private async Task DispatchAsync(IDomainEvent domainEvent, CancellationToken cancellationToken)
    {
        var sw = Stopwatch.StartNew();
        using var scope = _serviceProvider.CreateScope();

        var eventType = domainEvent.GetType();
        var handlerInterfaceType = typeof(IDomainEventHandler<>).MakeGenericType(eventType);
        var handlers = scope.ServiceProvider.GetServices(handlerInterfaceType).ToList();

        if (handlers.Count == 0)
        {
            _logger.LogDebug("[EventDispatcher] Нет подписчиков для {EventType}", domainEvent.EventType);
            return;
        }

        foreach (var handler in handlers)
        {
            if (handler == null) continue;

            var handlerType = handler.GetType();
            var handlerName = handlerType.Name;
            var invoker = InvokerCache.GetOrAdd((handlerType, eventType), CreateCompiledInvoker);

            try
            {
                await invoker(handler, domainEvent, cancellationToken);
            }
            catch (Exception ex)
            {
                _logger.LogCritical(ex, "[EventDispatcher] Ошибка в {Handler} при обработке {EventType}",
                    handlerName, domainEvent.EventType);
                _deadLetterQueue.RecordFailure(domainEvent, handlerName, ex);
            }
        }

        sw.Stop();
        _logger.LogInformation("[EventDispatcher] Событие {EventType} обработано {Count} подписчиками за {ElapsedMs} мс",
            domainEvent.EventType, handlers.Count, sw.ElapsedMilliseconds);
    }

    private static Func<object, IDomainEvent, CancellationToken, Task> CreateCompiledInvoker((Type HandlerType, Type EventType) key)
    {
        var (handlerType, eventType) = key;
        var handlerParam = Expression.Parameter(typeof(object), "handler");
        var eventParam = Expression.Parameter(typeof(IDomainEvent), "domainEvent");
        var tokenParam = Expression.Parameter(typeof(CancellationToken), "token");

        var typedHandler = Expression.Convert(handlerParam, handlerType);
        var typedEvent = Expression.Convert(eventParam, eventType);

        var method = handlerType.GetMethod(nameof(IDomainEventHandler<IDomainEvent>.HandleAsync), [eventType, typeof(CancellationToken)])
            ?? throw new InvalidOperationException($"Метод HandleAsync не найден в {handlerType.Name}");

        var call = Expression.Call(typedHandler, method, typedEvent, tokenParam);
        return Expression.Lambda<Func<object, IDomainEvent, CancellationToken, Task>>(call, handlerParam, eventParam, tokenParam).Compile();
    }
}
