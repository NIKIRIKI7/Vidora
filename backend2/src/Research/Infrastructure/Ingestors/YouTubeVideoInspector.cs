using Integrations.YouTube.Contracts;
using Research.Domain.Ports;

namespace Research.Infrastructure.Ingestors;

public sealed class YouTubeVideoInspector : IYouTubeVideoInspector
{
    private readonly IYouTubeClient _client;

    public YouTubeVideoInspector(IYouTubeClient client) => _client = client;

    public Task<string?> GetTranscriptAsync(string videoUrlOrId, string[]? preferredLangs = null, CancellationToken ct = default)
        => _client.GetTranscriptAsync(videoUrlOrId, preferredLangs, ct);

    public async Task<IReadOnlyList<HeatmapPointDto>> GetHeatmapAsync(string videoUrlOrId, CancellationToken ct = default)
    {
        var points = await _client.GetHeatmapAsync(videoUrlOrId, ct);
        return points
            .Select(h => new HeatmapPointDto(h.StartSeconds, h.EndSeconds, h.Intensity))
            .ToList();
    }

    public async Task<IReadOnlyList<VideoChapterDto>> GetChaptersAsync(string videoUrlOrId, CancellationToken ct = default)
    {
        var chapters = await _client.GetChaptersAsync(videoUrlOrId, ct);
        return chapters
            .Select(c => new VideoChapterDto(c.StartSeconds, c.EndSeconds, c.Title, c.ThumbnailUrl))
            .ToList();
    }

    public async Task<IReadOnlyList<DetailedCommentDto>> GetCommentsDetailedAsync(string videoUrlOrId, int maxComments = 50, CancellationToken ct = default)
    {
        var comments = await _client.GetCommentsDetailedAsync(videoUrlOrId, maxComments, ct);
        return comments
            .Select(c => new DetailedCommentDto(c.CommentId, c.AuthorName, c.AuthorChannelId, c.Text, c.LikeCount, c.PublishedTime, c.Category))
            .ToList();
    }

    public async Task<VideoMetadataSummaryDto> GetMetadataSummaryAsync(string videoUrlOrId, CancellationToken ct = default)
    {
        var meta = await _client.GetMetadataAsync(videoUrlOrId, ct);
        return new VideoMetadataSummaryDto(meta.Title, meta.ChannelTitle, meta.Description);
    }

    public async Task<object?> GetMetadataAsync(string videoUrlOrId, CancellationToken ct = default)
        => await _client.GetMetadataAsync(videoUrlOrId, ct);
}
