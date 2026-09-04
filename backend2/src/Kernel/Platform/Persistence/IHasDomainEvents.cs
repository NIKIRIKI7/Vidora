using Kernel.Events;

namespace Kernel.Platform.Persistence;

public interface IHasDomainEvents
{
    IReadOnlyList<IDomainEvent> DomainEvents { get; }
    void ClearDomainEvents();
}
