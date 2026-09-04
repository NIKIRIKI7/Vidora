using System.Text.Encodings.Web;
using System.Text.Json;
using System.Threading.Channels;
using Microsoft.Extensions.Logging;

namespace Kernel.Platform.Logging;

public sealed class JsonLinesFileLogger : ILogger
{
    private readonly string _categoryName;
    private readonly ChannelWriter<string> _channelWriter;

    public JsonLinesFileLogger(string categoryName, ChannelWriter<string> channelWriter)
    {
        _categoryName = categoryName;
        _channelWriter = channelWriter;
    }

    public IDisposable? BeginScope<TState>(TState state) where TState : notnull => null;

    public bool IsEnabled(LogLevel logLevel) => logLevel != LogLevel.None;

    public void Log<TState>(
        LogLevel logLevel,
        EventId eventId,
        TState state,
        Exception? exception,
        Func<TState, Exception?, string> formatter)
    {
        if (!IsEnabled(logLevel)) return;

        var message = formatter(state, exception);

        var logEntry = new
        {
            timestamp = DateTimeOffset.UtcNow,
            level = logLevel.ToString().ToUpperInvariant(),
            category = _categoryName,
            event_id = eventId.Id,
            message,
            exception = exception != null ? new
            {
                type = exception.GetType().FullName,
                message = exception.Message,
                stack_trace = exception.StackTrace
            } : null
        };

        var json = JsonSerializer.Serialize(logEntry, new JsonSerializerOptions
        {
            Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping
        });

        _channelWriter.TryWrite(json);
    }
}
