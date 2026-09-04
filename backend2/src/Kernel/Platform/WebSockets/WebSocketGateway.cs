using System.Collections.Concurrent;
using System.Net.WebSockets;
using System.Text;
using System.Text.Json;
using Microsoft.Extensions.Logging;

namespace Kernel.Platform.WebSockets;

public sealed class WebSocketGateway : IWebSocketGateway, IAsyncDisposable
{
    private static readonly TimeSpan DefaultCloseTimeout = TimeSpan.FromSeconds(2);
    private readonly ConcurrentDictionary<string, ConnectedClient> _clients = new();
    private readonly ILogger<WebSocketGateway> _logger;

    public WebSocketGateway(ILogger<WebSocketGateway> logger)
    {
        _logger = logger;
    }

    public Task RegisterClientAsync(string connectionId, WebSocket webSocket, CancellationToken cancellationToken = default)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(connectionId);
        ArgumentNullException.ThrowIfNull(webSocket);

        var client = new ConnectedClient(connectionId, webSocket);
        _clients.AddOrUpdate(
            connectionId,
            client,
            (key, existing) =>
            {
                // Фоновое закрытие вытесненного соединения без блокировки словаря.
                Task.Run(() => existing.CloseAndDisposeAsync(_logger));
                return client;
            });

        _logger.LogInformation("Клиент WS подключен: {ConnectionId}. Активных клиентов: {Count}", connectionId, _clients.Count);
        return Task.CompletedTask;
    }

    public async Task UnregisterClientAsync(string connectionId)
    {
        if (_clients.TryRemove(connectionId, out var client))
        {
            await client.CloseAndDisposeAsync(_logger);
            _logger.LogInformation("Клиент WS отключен: {ConnectionId}", connectionId);
        }
    }

    public async Task BroadcastAsync(string eventType, object payload, CancellationToken cancellationToken = default)
    {
        if (_clients.IsEmpty) return;

        var message = JsonSerializer.Serialize(new
        {
            @event = eventType,
            data = payload,
            timestamp = DateTimeOffset.UtcNow
        });

        var bytes = Encoding.UTF8.GetBytes(message);

        // Параллельная рассылка всем клиентам
        var sendTasks = _clients.Select(async kvp =>
        {
            var (id, client) = kvp;
            try
            {
                await client.SendAsync(bytes, cancellationToken);
                return (Id: id, IsFaulted: false);
            }
            catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
            {
                // Отмена самого процесса Broadcast: клиенты живы, отключать их нельзя!
                return (Id: id, IsFaulted: false);
            }
            catch (WebSocketException ex)
            {
                _logger.LogWarning(ex, "Сетевой сбой сокета клиента {ConnectionId}. Будет отключен.", id);
                return (Id: id, IsFaulted: true);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Непредвиденная ошибка отправки WS клиенту {ConnectionId}. Будет отключен.", id);
                return (Id: id, IsFaulted: true);
            }
        });

        var results = await Task.WhenAll(sendTasks);

        // Удаляем только реально сломанные клиенты
        foreach (var result in results)
        {
            if (result.IsFaulted)
            {
                await UnregisterClientAsync(result.Id);
            }
        }

        // Если операция была отменена извне — соблюдаем контракт Task и пробрасываем OCE
        cancellationToken.ThrowIfCancellationRequested();
    }

    public async ValueTask DisposeAsync()
    {
        foreach (var connectionId in _clients.Keys)
        {
            await UnregisterClientAsync(connectionId);
        }
    }

    private sealed class ConnectedClient
    {
        public string Id { get; }
        public WebSocket Socket { get; }
        private readonly SemaphoreSlim _sendLock = new(1, 1);

        public ConnectedClient(string id, WebSocket socket)
        {
            Id = id;
            Socket = socket;
        }

        public async Task SendAsync(byte[] bytes, CancellationToken ct)
        {
            if (Socket.State != WebSocketState.Open)
            {
                throw new WebSocketException($"Сокет {Id} не открыт (Статус: {Socket.State})");
            }

            await _sendLock.WaitAsync(ct);
            try
            {
                if (Socket.State == WebSocketState.Open)
                {
                    await Socket.SendAsync(new ArraySegment<byte>(bytes), WebSocketMessageType.Text, true, ct);
                }
            }
            finally
            {
                _sendLock.Release();
            }
        }

        public async Task CloseAndDisposeAsync(ILogger logger)
        {
            using var cts = new CancellationTokenSource(DefaultCloseTimeout);
            try
            {
                await _sendLock.WaitAsync(cts.Token);
            }
            catch (OperationCanceledException)
            {
                // Не успели захватить лок за таймаут — продолжаем принудительный диспоуз.
            }

            try
            {
                if (Socket.State is WebSocketState.Open or WebSocketState.CloseReceived)
                {
                    await Socket.CloseAsync(WebSocketCloseStatus.NormalClosure, "Closed by server", cts.Token);
                }
            }
            catch (Exception ex)
            {
                logger.LogWarning(ex, "Ошибка при штатном закрытии сокета {ConnectionId}", Id);
            }
            finally
            {
                Socket.Dispose();
                _sendLock.Dispose();
            }
        }
    }
}
