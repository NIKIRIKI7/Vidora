using System.Collections.Concurrent;
using System.Threading.Channels;
using Microsoft.Extensions.Logging;

namespace Kernel.Platform.Logging;

public sealed class JsonLinesFileLoggerProvider : ILoggerProvider, IAsyncDisposable
{
    private static readonly TimeSpan ShutdownTimeout = TimeSpan.FromSeconds(5);
    private const int BoundedQueueCapacity = 20_000;

    private readonly string _filePath;
    private readonly Channel<string> _channel;
    private readonly Task _outputTask;
    private readonly ConcurrentDictionary<string, JsonLinesFileLogger> _loggers = new();

    public JsonLinesFileLoggerProvider(string filePath)
    {
        _filePath = filePath;
        var directory = Path.GetDirectoryName(_filePath);
        if (!string.IsNullOrEmpty(directory) && !Directory.Exists(directory))
        {
            Directory.CreateDirectory(directory);
        }

        // Bounded-очередь с вытеснением старых логов защищает от OutOfMemory.
        _channel = Channel.CreateBounded<string>(new BoundedChannelOptions(BoundedQueueCapacity)
        {
            SingleReader = true,
            SingleWriter = false,
            FullMode = BoundedChannelFullMode.DropOldest
        });

        _outputTask = Task.Run(ProcessLogQueueAsync);
    }

    public ILogger CreateLogger(string categoryName)
    {
        return _loggers.GetOrAdd(categoryName, name => new JsonLinesFileLogger(name, _channel.Writer));
    }

    private async Task ProcessLogQueueAsync()
    {
        try
        {
            await using var stream = new FileStream(_filePath, FileMode.Append, FileAccess.Write, FileShare.ReadWrite);
            await using var writer = new StreamWriter(stream) { AutoFlush = true };

            while (await _channel.Reader.WaitToReadAsync())
            {
                while (_channel.Reader.TryRead(out var logLine))
                {
                    await writer.WriteLineAsync(logLine);
                }
            }
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"[JsonLinesLoggerProvider] Ошибка записи логов: {ex.Message}");
        }
    }

    public void Dispose()
    {
        _channel.Writer.TryComplete();
        try
        {
            // Синхронный дожим буфера (ILoggerFactory диспозит провайдеры строго синхронно).
            _outputTask.Wait(ShutdownTimeout);
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"[JsonLinesLoggerProvider] Ошибка синхронного завершения логгера: {ex.Message}");
        }
    }

    public async ValueTask DisposeAsync()
    {
        _channel.Writer.TryComplete();
        try
        {
            using var cts = new CancellationTokenSource(ShutdownTimeout);
            await _outputTask.WaitAsync(cts.Token);
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"[JsonLinesLoggerProvider] Ошибка асинхронного завершения логгера: {ex.Message}");
        }
    }
}
