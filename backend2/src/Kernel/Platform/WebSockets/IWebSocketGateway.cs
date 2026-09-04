using System.Net.WebSockets;

namespace Kernel.Platform.WebSockets;

public interface IWebSocketGateway
{
    Task BroadcastAsync(string eventType, object payload, CancellationToken cancellationToken = default);
    Task RegisterClientAsync(string connectionId, WebSocket webSocket, CancellationToken cancellationToken = default);
    Task UnregisterClientAsync(string connectionId);
}
