namespace Integrations.YouTube.Contracts;

public sealed record YouTubeHeatmapPoint(
    double StartSeconds,
    double EndSeconds,
    double Intensity);

public sealed record YouTubeVideoChapter(
    int StartSeconds,
    int EndSeconds,
    string Title,
    string ThumbnailUrl);

public sealed record YouTubeWordTimestamp(
    double StartMs,
    double EndMs,
    string Word);

public sealed record YouTubeChannelUpload(
    string VideoId,
    string Title,
    string ThumbnailUrl,
    int ViewCount,
    string PublishedText,
    int DurationSeconds);

public sealed record YouTubeChannelStats(
    long SubscriberCount,
    long TotalViewCount,
    int VideoCount,
    string Description);

public sealed record YouTubeCommentItem(
    string AuthorName,
    string AuthorChannelId,
    string Text,
    int LikeCount,
    string PublishedTime,
    string CommentId);

public sealed class YouTubeSearchFilter
{
    public string? UploadDate { get; set; }
    public string? Type { get; set; }
    public string? Duration { get; set; }
    public string? SortBy { get; set; }
    public string? Features { get; set; }
}
