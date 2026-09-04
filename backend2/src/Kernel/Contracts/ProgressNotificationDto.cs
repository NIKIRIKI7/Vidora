using System.Text.Json.Serialization;

namespace Kernel.Contracts;

public sealed record ProgressNotificationDto
{
    [JsonPropertyName("task_id")]
    public required string TaskId { get; init; }

    [JsonPropertyName("stage")]
    public required string Stage { get; init; }

    [JsonPropertyName("current")]
    public int Current { get; init; }

    [JsonPropertyName("total")]
    public int Total { get; init; }

    [JsonPropertyName("percentage")]
    public double Percentage => Total > 0 ? Math.Clamp(Math.Round((double)Current / Total * 100.0, 2), 0.0, 100.0) : 0.0;

    [JsonPropertyName("status")]
    public JobStatus Status { get; init; } = JobStatus.Processing;

    [JsonPropertyName("message")]
    public string? Message { get; init; }

    [JsonPropertyName("error")]
    public string? Error { get; init; }

    [JsonPropertyName("updated_at")]
    public DateTimeOffset UpdatedAt { get; init; } = DateTimeOffset.UtcNow;
}
