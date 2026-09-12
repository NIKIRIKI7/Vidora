using System.Text.Json.Serialization;

namespace Kernel.Contracts;

/// <summary>
/// Набор API-ключей внешних провайдеров, передаваемый с фронтенда.
/// Типизирован, чтобы Swagger/openapi-typescript отдавали конкретную схему,
/// а не <c>unknown</c>.
/// </summary>
public sealed record ApiKeysDto(
    [property: JsonPropertyName("elevenlabs")] string? ElevenLabs = null,
    [property: JsonPropertyName("anthropic")] string? Anthropic = null,
    [property: JsonPropertyName("openai")] string? OpenAi = null,
    [property: JsonPropertyName("routerai")] string? RouterAi = null,
    [property: JsonPropertyName("aitunnel")] string? AiTunnel = null,
    [property: JsonPropertyName("youtube")] string? YouTube = null,
    [property: JsonPropertyName("pexels")] string? Pexels = null);
