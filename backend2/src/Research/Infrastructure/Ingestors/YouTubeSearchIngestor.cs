using System.Globalization;
using System.Text.RegularExpressions;
using Integrations.YouTube.Contracts;
using Microsoft.Extensions.Logging;
using Research.Domain.Ports;

namespace Research.Infrastructure.Ingestors;

public sealed class YouTubeSearchIngestor : IYouTubeSearchIngestor
{
    private readonly IYouTubeClient _youTubeClient;
    private readonly IResearchCacheService _cache;
    private readonly ILogger<YouTubeSearchIngestor> _logger;

    public YouTubeSearchIngestor(
        IYouTubeClient youTubeClient,
        IResearchCacheService cache,
        ILogger<YouTubeSearchIngestor> logger)
    {
        _youTubeClient = youTubeClient;
        _cache = cache;
        _logger = logger;
    }

    public async Task<IReadOnlyList<RawVideoSearchResult>> SearchTopicCandidatesAsync(
        string query,
        int maxResults = 30,
        int daysBack = 0,
        string lang = "ru",
        CancellationToken ct = default)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(query);

        var cleanQuery = Regex.Replace(query, @"[,;]+", " ").Trim();
        cleanQuery = Regex.Replace(cleanQuery, @"\s+", " ");

        string cacheKey = $"yt_search_{cleanQuery.ToLowerInvariant()}_{maxResults}_{daysBack}_{lang}";
        var cached = await _cache.GetAsync<IReadOnlyList<RawVideoSearchResult>>(cacheKey, ct);
        if (cached != null && cached.Count > 0)
        {
            _logger.LogInformation("[YouTubeIngestor] Возврат {Count} кандидатов из кэша для '{Query}'", cached.Count, cleanQuery);
            return cached;
        }

        _logger.LogInformation("[YouTubeIngestor] Поиск кандидатов через IYouTubeClient: '{Query}' (daysBack: {Days}, lang: {Lang})", cleanQuery, daysBack, lang);
        var videos = await _youTubeClient.SearchAsync(cleanQuery, maxResults, daysBack, lang, ct);

        if (videos.Count == 0 && query.Contains(' '))
        {
            var parts = cleanQuery.Split(' ', StringSplitOptions.RemoveEmptyEntries);
            if (parts.Length >= 2)
            {
                var subQuery = $"{parts[0]} {parts[1]}";
                _logger.LogInformation("[YouTubeIngestor] Уточняющий поиск: '{SubQuery}'", subQuery);
                videos = await _youTubeClient.SearchAsync(subQuery, maxResults, daysBack, lang, ct);
            }
        }

        var results = MapToResults(videos, daysBack);
        if (results.Count > 0)
        {
            await _cache.SetAsync(cacheKey, (IReadOnlyList<RawVideoSearchResult>)results, TimeSpan.FromHours(2), ct);
        }

        return results;
    }

    public async Task<IReadOnlyList<RawVideoSearchResult>> GetRelatedCandidatesAsync(
        string videoId,
        int maxResults = 25,
        int daysBack = 0,
        string lang = "ru",
        CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(videoId)) return [];
        string cacheKey = $"yt_related_{videoId}_{maxResults}_{daysBack}_{lang}";

        var cached = await _cache.GetAsync<IReadOnlyList<RawVideoSearchResult>>(cacheKey, ct);
        if (cached != null && cached.Count > 0) return cached;

        _logger.LogInformation("[YouTubeIngestor] Сбор связанных рекомендаций для {VideoId}", videoId);
        var videos = await _youTubeClient.GetRelatedVideosAsync(videoId, maxResults, lang, ct);
        var results = MapToResults(videos, daysBack);

        if (results.Count > 0)
        {
            await _cache.SetAsync(cacheKey, (IReadOnlyList<RawVideoSearchResult>)results, TimeSpan.FromHours(3), ct);
        }

        return results;
    }

    public async Task<IReadOnlyList<RawVideoSearchResult>> GetTrendingCandidatesAsync(
        string lang = "ru",
        CancellationToken ct = default)
    {
        string cacheKey = $"yt_trending_feed_{lang}";
        var cached = await _cache.GetAsync<IReadOnlyList<RawVideoSearchResult>>(cacheKey, ct);
        if (cached != null && cached.Count > 0) return cached;

        var videos = await _youTubeClient.GetTrendingVideosAsync(lang, ct);
        var results = MapToResults(videos, 7);

        if (results.Count > 0)
        {
            await _cache.SetAsync(cacheKey, (IReadOnlyList<RawVideoSearchResult>)results, TimeSpan.FromHours(1), ct);
        }

        return results;
    }

    public async Task<IReadOnlyList<RawVideoSearchResult>> GetHomeFeedCandidatesAsync(
        string lang = "ru",
        CancellationToken ct = default)
    {
        string cacheKey = $"yt_home_feed_{lang}";
        var cached = await _cache.GetAsync<IReadOnlyList<RawVideoSearchResult>>(cacheKey, ct);
        if (cached != null && cached.Count > 0) return cached;

        var videos = await _youTubeClient.GetHomeFeedVideosAsync(lang, ct);
        var results = MapToResults(videos, 7);

        if (results.Count > 0)
        {
            await _cache.SetAsync(cacheKey, (IReadOnlyList<RawVideoSearchResult>)results, TimeSpan.FromMinutes(30), ct);
        }

        return results;
    }

    private static List<RawVideoSearchResult> MapToResults(IReadOnlyList<YouTubeVideoMetadata> videos, int daysBack)
    {
        var results = new List<RawVideoSearchResult>();
        foreach (var v in videos)
        {
            DateTimeOffset publishedAt;
            if (v.PublishedAt.HasValue && v.PublishedAt.Value > DateTimeOffset.MinValue)
            {
                publishedAt = v.PublishedAt.Value;
            }
            else
            {
                var fallback = ParseDateFallback(v.UploadDate);
                if (fallback.HasValue)
                {
                    publishedAt = fallback.Value;
                }
                else if (daysBack > 0)
                {
                    publishedAt = DateTimeOffset.UtcNow.AddDays(-Math.Max(1.0, daysBack * 0.7));
                }
                else
                {
                    publishedAt = DateTimeOffset.UtcNow.AddDays(-14);
                }
            }

            long subscribers = v.SubscriberCount.GetValueOrDefault(0);

            results.Add(new RawVideoSearchResult(
                VideoId: v.VideoId,
                Title: v.Title,
                ChannelTitle: v.ChannelTitle,
                ChannelId: v.ChannelId,
                SubscriberCount: subscribers,
                ViewCount: v.ViewCount,
                PublishedAt: publishedAt,
                DurationSeconds: v.Duration.TotalSeconds,
                ThumbnailUrl: v.ThumbnailUrl ?? $"https://i.ytimg.com/vi/{v.VideoId}/hqdefault.jpg",
                TopComments: v.Comments));
        }
        return results;
    }

    private static DateTimeOffset? ParseDateFallback(string? rawDate)
    {
        if (string.IsNullOrWhiteSpace(rawDate)) return null;
        if (rawDate.Length == 8 && DateTime.TryParseExact(rawDate, "yyyyMMdd", CultureInfo.InvariantCulture, DateTimeStyles.AssumeUniversal, out var dt))
        {
            return new DateTimeOffset(dt, TimeSpan.Zero);
        }
        if (DateTimeOffset.TryParse(rawDate, CultureInfo.InvariantCulture, DateTimeStyles.AssumeUniversal, out var dto))
        {
            return dto;
        }
        return null;
    }

}
