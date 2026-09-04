using System.Text.Json.Serialization;

namespace Integrations.YouTube.Contracts;

public sealed record YouTubeDownloadResult
{
    [JsonPropertyName("video_id")]
    public required string VideoId { get; init; }

    [JsonPropertyName("file_path")]
    public required string FilePath { get; init; }

    [JsonPropertyName("file_size_bytes")]
    public long FileSizeBytes { get; init; }

    [JsonPropertyName("format")]
    public required string Format { get; init; }

    [JsonPropertyName("is_audio_only")]
    public bool IsAudioOnly { get; init; }

    [JsonPropertyName("downloaded_at")]
    public DateTimeOffset DownloadedAt { get; init; } = DateTimeOffset.UtcNow;
}
