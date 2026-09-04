namespace Kernel.Events;

public sealed record DeadLetterEntry(
    IDomainEvent Event,
    string HandlerName,
    Exception Error,
    DateTimeOffset FailedAt);

public interface IEventDeadLetterQueue
{
    void RecordFailure(IDomainEvent domainEvent, string handlerName, Exception error);
    IReadOnlyCollection<DeadLetterEntry> GetFailures();
}
