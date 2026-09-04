using System.Text.Json.Serialization;

namespace Kernel.Exceptions;

public sealed record ErrorEnvelope
{
    [JsonPropertyName("status")]
    public string Status { get; init; } = "error";

    [JsonPropertyName("error_code")]
    public string ErrorCode { get; init; } = "INTERNAL_SERVER_ERROR";

    [JsonPropertyName("detail")]
    public string Detail { get; init; } = string.Empty;

    [JsonPropertyName("details")]
    public object? Details { get; init; }

    [JsonPropertyName("timestamp")]
    public DateTimeOffset Timestamp { get; init; } = DateTimeOffset.UtcNow;

    public static ErrorEnvelope FromException(DomainException ex) => new()
    {
        ErrorCode = ex.ErrorCode,
        Detail = ex.Message,
        Details = ex.Details
    };

    public static ErrorEnvelope Internal(string message) => new()
    {
        ErrorCode = "INTERNAL_SERVER_ERROR",
        Detail = message
    };
}
