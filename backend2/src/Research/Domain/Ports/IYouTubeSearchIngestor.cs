namespace Research.Domain.Ports;

public sealed record RawVideoSearchResult(
    string VideoId,
    string Title,
    string ChannelTitle,
    string ChannelId,
    long SubscriberCount,
    long ViewCount,
    DateTimeOffset PublishedAt,
    double DurationSeconds,
    string ThumbnailUrl,
    IReadOnlyList<string> TopComments);

/// <summary>Разрешённый канал-конкурент (id + отображаемое имя).</summary>
public sealed record ChannelRef(string ChannelId, string ChannelTitle);

public interface IYouTubeSearchIngestor
{
    Task<IReadOnlyList<RawVideoSearchResult>> SearchTopicCandidatesAsync(
        string query,
        int maxResults = 30,
        int daysBack = 0,
        string lang = "ru",
        CancellationToken ct = default);

    Task<IReadOnlyList<RawVideoSearchResult>> GetRelatedCandidatesAsync(
        string videoId,
        int maxResults = 25,
        int daysBack = 0,
        string lang = "ru",
        CancellationToken ct = default);

    Task<IReadOnlyList<RawVideoSearchResult>> GetTrendingCandidatesAsync(
        string lang = "ru",
        CancellationToken ct = default);

    Task<IReadOnlyList<RawVideoSearchResult>> GetHomeFeedCandidatesAsync(
        string lang = "ru",
        CancellationToken ct = default);

    Task<long> GetChannelSubscribersAsync(string channelId, CancellationToken ct = default);

    /// <summary>
    /// Разрешает имя канала, @handle или URL в конкретный channelId.
    /// Возвращает null, если канал не удалось определить.
    /// </summary>
    Task<ChannelRef?> ResolveChannelAsync(
        string channelNameOrHandleOrUrl,
        string lang = "ru",
        CancellationToken ct = default);

    /// <summary>Забирает последние видео канала напрямую по channelId (точный режим конкурентов).</summary>
    Task<IReadOnlyList<RawVideoSearchResult>> GetChannelCandidatesAsync(
        ChannelRef channel,
        int maxResults = 25,
        int daysBack = 0,
        string lang = "ru",
        CancellationToken ct = default);
}
