using System.Text.RegularExpressions;
using Integrations.YouTube.Innertube.Config;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace Integrations.YouTube.Innertube.Resolving;

public enum QueryKind
{
    VideoId,
    VideoUrl,
    ChannelUrl,
    SearchQuery,
    Unknown
}

public sealed record ResolvedQuery(
    QueryKind Kind,
    string RawInput,
    string? ExtractedId = null,
    string? ResolvedUrl = null);

public interface IYouTubeQueryResolver
{
    ResolvedQuery Resolve(string input);
}

public sealed partial class YouTubeQueryResolver : IYouTubeQueryResolver
{
    private readonly InnerTubeOptions _options;
    private readonly ILogger<YouTubeQueryResolver> _logger;

    public YouTubeQueryResolver(
        IOptions<InnerTubeOptions> options,
        ILogger<YouTubeQueryResolver> logger)
    {
        _options = options.Value;
        _logger = logger;
    }

    public ResolvedQuery Resolve(string input)
    {
        if (string.IsNullOrWhiteSpace(input))
            return new ResolvedQuery(QueryKind.Unknown, input ?? string.Empty);

        var trimmed = input.Trim();

        if (IsVideoId(trimmed))
        {
            _logger.LogDebug("Resolved as VideoId: {Id}", trimmed);
            return new ResolvedQuery(QueryKind.VideoId, trimmed, ExtractedId: trimmed);
        }

        foreach (var pattern in _options.Metadata.SupportedUrlPatterns)
        {
            var match = Regex.Match(trimmed, pattern, RegexOptions.IgnoreCase);
            if (match.Success)
            {
                if (pattern.Contains("channel"))
                {
                    var channelId = match.Groups.Count > 1 ? match.Groups[1].Value : trimmed;
                    _logger.LogDebug("Resolved as ChannelUrl: {ChannelId}", channelId);
                    return new ResolvedQuery(QueryKind.ChannelUrl, trimmed, ExtractedId: channelId);
                }

                var videoId = match.Groups.Count > 1 ? match.Groups[1].Value : trimmed;
                _logger.LogDebug("Resolved as VideoUrl: {VideoId}", videoId);
                return new ResolvedQuery(QueryKind.VideoUrl, trimmed, ExtractedId: videoId,
                    ResolvedUrl: $"https://www.youtube.com/watch?v={videoId}");
            }
        }

        _logger.LogDebug("Resolved as SearchQuery: {Query}", trimmed);
        return new ResolvedQuery(QueryKind.SearchQuery, trimmed);
    }

    private bool IsVideoId(string input)
    {
        return input.Length == 11 && VideoIdRegex().IsMatch(input);
    }

    [GeneratedRegex(@"^[a-zA-Z0-9_-]{11}$")]
    private static partial Regex VideoIdRegex();
}
