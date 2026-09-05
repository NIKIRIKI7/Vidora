using Kernel.Platform.Persistence;
using Research.Domain.ValueObjects;

namespace Research.Domain.Entities;

public class VideoCandidate : BaseEntity<string>
{
    public ResearchRunId ResearchRunId { get; private set; }
    public string VideoId { get; private set; } = string.Empty;
    public string Title { get; private set; } = string.Empty;
    public string ChannelTitle { get; private set; } = string.Empty;
    public string ChannelId { get; private set; } = string.Empty;
    public long ChannelSubscriberCount { get; private set; }
    public long ViewCount { get; private set; }
    public DateTimeOffset PublishedAt { get; private set; }
    public double DurationSeconds { get; private set; }
    public MomentumScore Momentum { get; private set; }
    public string ThumbnailUrl { get; private set; } = string.Empty;
    public string TopCommentsJson { get; private set; } = "[]";

    protected VideoCandidate() { }

    public static VideoCandidate Create(
        ResearchRunId runId,
        string videoId,
        string title,
        string channelTitle,
        string channelId,
        long subscriberCount,
        long viewCount,
        DateTimeOffset publishedAt,
        double durationSeconds,
        MomentumScore momentum,
        string? thumbnailUrl = null,
        string? topCommentsJson = null)
    {
        return new VideoCandidate
        {
            Id = $"{runId.Value}_{videoId.Trim()}",
            ResearchRunId = runId,
            VideoId = videoId.Trim(),
            Title = title.Trim(),
            ChannelTitle = channelTitle.Trim(),
            ChannelId = channelId.Trim(),
            ChannelSubscriberCount = Math.Max(0, subscriberCount),
            ViewCount = Math.Max(0, viewCount),
            PublishedAt = publishedAt,
            DurationSeconds = Math.Max(0, durationSeconds),
            Momentum = momentum,
            ThumbnailUrl = thumbnailUrl?.Trim() ?? string.Empty,
            TopCommentsJson = string.IsNullOrWhiteSpace(topCommentsJson) ? "[]" : topCommentsJson.Trim(),
            CreatedAt = DateTimeOffset.UtcNow,
            UpdatedAt = DateTimeOffset.UtcNow
        };
    }
}
