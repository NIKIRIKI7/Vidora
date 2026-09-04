using Kernel.Events;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using Xunit;

namespace Kernel.Tests;

public record TestSuccessEvent(string AggregateId, string Message) : DomainEvent(AggregateId);
public record TestFailEvent(string AggregateId) : DomainEvent(AggregateId);

public class TestSuccessEventHandler : IDomainEventHandler<TestSuccessEvent>
{
    public static TaskCompletionSource<bool> HandledSignal = new(TaskCreationOptions.RunContinuationsAsynchronously);

    public Task HandleAsync(TestSuccessEvent domainEvent, CancellationToken cancellationToken)
    {
        HandledSignal.TrySetResult(true);
        return Task.CompletedTask;
    }
}

public class TestFailingEventHandler : IDomainEventHandler<TestFailEvent>
{
    public static TaskCompletionSource<bool> FailedSignal = new(TaskCreationOptions.RunContinuationsAsynchronously);

    public Task HandleAsync(TestFailEvent domainEvent, CancellationToken cancellationToken)
    {
        FailedSignal.TrySetResult(true);
        throw new InvalidOperationException("Имитация критического сбоя в обработчике.");
    }
}

public class EventBusTests
{
    [Fact]
    public async Task EventBus_SuccessfulEvent_ShouldBeDispatchedWithoutSpinWait()
    {
        var services = new ServiceCollection();
        TestSuccessEventHandler.HandledSignal = new TaskCompletionSource<bool>(TaskCreationOptions.RunContinuationsAsynchronously);
        services.AddTransient<IDomainEventHandler<TestSuccessEvent>, TestSuccessEventHandler>();
        var sp = services.BuildServiceProvider();

        var dlq = new InMemoryDeadLetterQueue(NullLogger<InMemoryDeadLetterQueue>.Instance);
        var bus = new InMemoryEventBus(NullLogger<InMemoryEventBus>.Instance);
        var dispatcher = new DomainEventDispatcherHostedService(bus, dlq, sp, NullLogger<DomainEventDispatcherHostedService>.Instance);

        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(5));
        await dispatcher.StartAsync(cts.Token);

        await bus.PublishAsync(new TestSuccessEvent("scene-1", "Test Message"), cts.Token);

        // Ожидание сигнала через TaskCompletionSource вместо активного цикла
        var wasHandled = await TestSuccessEventHandler.HandledSignal.Task.WaitAsync(cts.Token);
        Assert.True(wasHandled);

        await dispatcher.StopAsync(CancellationToken.None);
    }

    [Fact]
    public async Task EventBus_HandlerFailure_ShouldBeRecordedInDeadLetterQueue()
    {
        var services = new ServiceCollection();
        TestFailingEventHandler.FailedSignal = new TaskCompletionSource<bool>(TaskCreationOptions.RunContinuationsAsynchronously);
        services.AddTransient<IDomainEventHandler<TestFailEvent>, TestFailingEventHandler>();
        var sp = services.BuildServiceProvider();

        var dlq = new InMemoryDeadLetterQueue(NullLogger<InMemoryDeadLetterQueue>.Instance);
        var bus = new InMemoryEventBus(NullLogger<InMemoryEventBus>.Instance);
        var dispatcher = new DomainEventDispatcherHostedService(bus, dlq, sp, NullLogger<DomainEventDispatcherHostedService>.Instance);

        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(5));
        await dispatcher.StartAsync(cts.Token);

        var failEvent = new TestFailEvent("scene-err-99");
        await bus.PublishAsync(failEvent, cts.Token);

        await TestFailingEventHandler.FailedSignal.Task.WaitAsync(cts.Token);

        var failures = dlq.GetFailures();
        Assert.Single(failures);
        var failure = failures.First();
        Assert.Equal(failEvent.EventId, failure.Event.EventId);
        Assert.Contains("Имитация критического сбоя", failure.Error.Message);

        await dispatcher.StopAsync(CancellationToken.None);
    }
}
