using System.Net.WebSockets;
using Kernel.Platform.WebSockets;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace Api.WebSockets;

public static class WebSocketEndpoints
{
    public static IEndpointRouteBuilder MapWebSocketEndpoints(this IEndpointRouteBuilder endpoints)
    {
        endpoints.MapGet("/ws/events/{clientId}", async (
            string clientId,
            HttpContext context,
            IWebSocketGateway gateway,
            CancellationToken ct) =>
        {
            if (!context.WebSockets.IsWebSocketRequest)
            {
                return Results.BadRequest(new { error = "Ожидался WebSocket-запрос." });
            }

            using var webSocket = await context.WebSockets.AcceptWebSocketAsync();
            await gateway.RegisterClientAsync(clientId, webSocket, ct);

            var buffer = new byte[1024 * 4];

            try
            {
                while (webSocket.State == WebSocketState.Open && !ct.IsCancellationRequested)
                {
                    var result = await webSocket.ReceiveAsync(new ArraySegment<byte>(buffer), ct);
                    if (result.MessageType == WebSocketMessageType.Close)
                    {
                        break;
                    }
                }
            }
            finally
            {
                await gateway.UnregisterClientAsync(clientId);
            }

            return Results.Empty;
        }).ExcludeFromDescription();

        return endpoints;
    }
}
