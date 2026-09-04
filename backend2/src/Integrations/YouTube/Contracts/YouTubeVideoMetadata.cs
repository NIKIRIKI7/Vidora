using System.Text.Json.Serialization;

namespace Integrations.YouTube.Contracts;

public sealed record YouTubeVideoMetadata
{
    [JsonPropertyName("video_id")]
    public required string VideoId { get; init; }

    [JsonPropertyName("title")]
    public string Title { get; init; } = string.Empty;

    [JsonPropertyName("description")]
    public string Description { get; init; } = string.Empty;

    [JsonPropertyName("channel_title")]
    public string ChannelTitle { get; init; } = string.Empty;

    [JsonPropertyName("channel_id")]
    public string ChannelId { get; init; } = string.Empty;

    [JsonPropertyName("view_count")]
    public long ViewCount { get; init; }

    [JsonPropertyName("duration")]
    public TimeSpan Duration { get; init; }

    [JsonPropertyName("upload_date")]
    public string? UploadDate { get; init; }

    [JsonPropertyName("keywords")]
    public IReadOnlyList<string> Keywords { get; init; } = [];

    [JsonPropertyName("thumbnail_url")]
    public string? ThumbnailUrl { get; init; }

    [JsonPropertyName("raw_details")]
    public IReadOnlyDictionary<string, object?>? RawDetails { get; init; }
}
