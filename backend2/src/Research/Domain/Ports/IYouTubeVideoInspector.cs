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

public sealed record VideoDeepDiveDto(
    [property: JsonPropertyName("video_id")] string VideoId,
    [property: JsonPropertyName("metadata")] object? Metadata,
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
    Task<object?> GetMetadataAsync(string videoUrlOrId, CancellationToken ct = default);
}
