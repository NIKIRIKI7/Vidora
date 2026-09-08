using System.Text.Json.Serialization;
using Kernel.Exceptions;

namespace Voice.Domain.ValueObjects;

public sealed record VoiceDesignSpec
{
    [JsonPropertyName("prompt")]
    public string Prompt { get; init; } = string.Empty;

    [JsonPropertyName("local_engine_id")]
    public string? LocalEngineId { get; init; }

    public VoiceDesignSpec(string prompt, string? localEngineId = null)
    {
        if (string.IsNullOrWhiteSpace(prompt))
            throw new ValidationException("prompt", "Промпт для генерации голоса обязателен.");

        if (prompt.Length > 2000)
            throw new ValidationException("prompt", "Промпт не должен превышать 2000 символов.");

        Prompt = prompt.Trim();
        LocalEngineId = localEngineId?.Trim();
    }

    /// <summary>
    /// C# не знает о словарных ограничениях конкретной модели — отдаём свободный текст
    /// как есть. Адаптер в Python-воркере (ACL) сам вырежет только поддерживаемые атрибуты.
    /// </summary>
    public string ToInstructString() => Prompt;
}
