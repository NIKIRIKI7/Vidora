using System.Text.Json;
using System.Text.Json.Serialization;
using Kernel.Platform.Config;
using Microsoft.Extensions.Options;

namespace Integrations.OmniVoice.Diagnostics;

/// <summary>
/// Структурированный JSONL-журнал событий синтеза OmniVoice (data_storage/app_events.jsonl).
/// Каждая строка — JSON-объект вида { ts, engine, event, data }. События пайплайна:
/// synthesis_ingress -> pre_inference -> diffusion_step (per step) -> pitch_dsp -> synthesis_summary.
/// </summary>
public sealed class OmniVoiceEventLogger
{
    private readonly string _filePath;
    private readonly object _sync = new();

    public OmniVoiceEventLogger(IOptions<AppStorageConfig> storageConfig)
    {
        _filePath = storageConfig.Value.GetLogFilePath();
    }

    public string FilePath => _filePath;

    public void Write(string @event, object? data = null)
    {
        try
        {
            var dir = Path.GetDirectoryName(_filePath);
            if (!string.IsNullOrEmpty(dir)) Directory.CreateDirectory(dir);

            var line = JsonSerializer.Serialize(
                new OmniVoiceEvent(@event, DateTimeOffset.UtcNow, data),
                SerializerOptions);

            lock (_sync)
            {
                File.AppendAllText(_filePath, line + Environment.NewLine);
            }
        }
        catch
        {
            // Логирование не должно ломать пайплайн синтеза
        }
    }

    private static readonly JsonSerializerOptions SerializerOptions = new()
    {
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull
    };

    private sealed record OmniVoiceEvent(
        [property: JsonPropertyName("event")] string Event,
        [property: JsonPropertyName("ts")] DateTimeOffset Ts,
        [property: JsonPropertyName("engine")] string Engine,
        [property: JsonPropertyName("data")] object? Data)
    {
        public OmniVoiceEvent(string @event, DateTimeOffset ts, object? data)
            : this(@event, ts, "omnivoice", data) { }
    }
}