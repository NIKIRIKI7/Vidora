using System.Text.Json.Serialization;

namespace Research.Domain.Ports;

public sealed record HeatmapPointDto(
    [property: JsonPropertyName("startSeconds")] double StartSeconds,
    [property: JsonPropertyName("endSeconds")] double EndSeconds,
    [property: JsonPropertyName("intensity")] double Intensity);

public sealed record VideoChapterDto(
    [property: JsonPropertyName("startSeconds")] int StartSeconds,
    [property: JsonPropertyName("endSeconds")] int EndSeconds,
    [property: JsonPropertyName("title")] string Title,
    [property: JsonPropertyName("thumbnailUrl")] string ThumbnailUrl);

public sealed record DetailedCommentDto(
    [property: JsonPropertyName("commentId")] string CommentId,
    [property: JsonPropertyName("authorName")] string AuthorName,
    [property: JsonPropertyName("authorChannelId")] string AuthorChannelId,
    [property: JsonPropertyName("text")] string Text,
    [property: JsonPropertyName("likeCount")] int LikeCount,
    [property: JsonPropertyName("publishedTime")] string PublishedTime,
    [property: JsonPropertyName("category")] string Category);

public sealed record VideoMetadataSummaryDto(string Title, string ChannelTitle, string Description);

/// <summary>
/// Типизированный слепок метаданных видео (зеркало Integrations.YouTube.YouTubeVideoMetadata),
/// отдаваемый в /youtube/video/{id}/deep-dive. Integrations не протекает в Api напрямую.
/// </summary>
public sealed record VideoCandidateMetaDto
{
    [JsonPropertyName("video_id")] public string? VideoId { get; init; }
    [JsonPropertyName("title")] public string? Title { get; init; }
    [JsonPropertyName("description")] public string? Description { get; init; }
    [JsonPropertyName("channel_title")] public string? ChannelTitle { get; init; }
    [JsonPropertyName("channel_id")] public string? ChannelId { get; init; }
    [JsonPropertyName("subscriber_count")] public long? SubscriberCount { get; init; }
    [JsonPropertyName("view_count")] public long? ViewCount { get; init; }
    [JsonPropertyName("duration")] public string? Duration { get; init; }
    [JsonPropertyName("upload_date")] public string? UploadDate { get; init; }
    [JsonPropertyName("published_at")] public DateTimeOffset? PublishedAt { get; init; }
    [JsonPropertyName("keywords")] public IReadOnlyList<string>? Keywords { get; init; }
    [JsonPropertyName("thumbnail_url")] public string? ThumbnailUrl { get; init; }
    [JsonPropertyName("comments")] public IReadOnlyList<string>? Comments { get; init; }
}

public sealed record VideoDeepDiveDto(
    [property: JsonPropertyName("video_id")] string VideoId,
    [property: JsonPropertyName("metadata")] VideoCandidateMetaDto? Metadata,
    [property: JsonPropertyName("heatmap")] IReadOnlyList<HeatmapPointDto> Heatmap,
    [property: JsonPropertyName("chapters")] IReadOnlyList<VideoChapterDto> Chapters,
    [property: JsonPropertyName("comments")] IReadOnlyList<DetailedCommentDto> Comments);

/// <summary>
/// Порт инспектора YouTube-видео (heatmap удержания, главы, комментарии, метаданные, транскрипт).
/// Реализуется адаптером Research.Infrastructure поверх Integrations.YouTube.
/// </summary>
public interface IYouTubeVideoInspector
{
    Task<string?> GetTranscriptAsync(string videoUrlOrId, string[]? preferredLangs = null, CancellationToken ct = default);
    Task<IReadOnlyList<HeatmapPointDto>> GetHeatmapAsync(string videoUrlOrId, CancellationToken ct = default);
    Task<IReadOnlyList<VideoChapterDto>> GetChaptersAsync(string videoUrlOrId, CancellationToken ct = default);
    Task<IReadOnlyList<DetailedCommentDto>> GetCommentsDetailedAsync(string videoUrlOrId, int maxComments = 50, CancellationToken ct = default);
    Task<VideoMetadataSummaryDto> GetMetadataSummaryAsync(string videoUrlOrId, CancellationToken ct = default);
    Task<VideoCandidateMetaDto?> GetMetadataAsync(string videoUrlOrId, CancellationToken ct = default);
}
