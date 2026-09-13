namespace Integrations.YouTube.Innertube.Config;

public sealed class InnerTubeOptions
{
    public const string SectionName = "YouTube:InnerTube";

    public InnerTubeSchemaConfig Schema { get; set; } = new();
    public List<InnerTubeClientProfile> ClientProfiles { get; set; } = [];
    public InnerTubeEndpointsConfig Endpoints { get; set; } = new();
    public InnerTubeTimeoutsConfig Timeouts { get; set; } = new();
    public InnerTubeDefaultsConfig Defaults { get; set; } = new();
    public InnerTubeBrowseIdsConfig BrowseIds { get; set; } = new();
    public InnerTubeUrlTemplatesConfig UrlTemplates { get; set; } = new();
    public InnerTubeSubtitlesConfig Subtitles { get; set; } = new();
    public InnerTubeDiagnosticsConfig Diagnostics { get; set; } = new();
    public InnerTubeMetadataConfig Metadata { get; set; } = new();
    public InnerTubeRateLimitConfig RateLimit { get; set; } = new();
}

public sealed class InnerTubeSchemaConfig
{
    public string VideoRendererKey { get; set; } = "videoRenderer";
    public string CompactVideoRendererKey { get; set; } = "compactVideoRenderer";
    public string RichItemRendererKey { get; set; } = "richItemRenderer";
    public string ItemSectionRendererKey { get; set; } = "itemSectionRenderer";
    public string SectionListRendererKey { get; set; } = "sectionListRenderer";
    public string TabRendererKey { get; set; } = "tabRenderer";
    public string TwoColumnSearchResultsKey { get; set; } = "twoColumnSearchResultsRenderer";
    public string TwoColumnBrowseResultsKey { get; set; } = "twoColumnBrowseResultsRenderer";
    public string TwoColumnWatchNextResultsKey { get; set; } = "twoColumnWatchNextResults";
    public string PrimaryContentsKey { get; set; } = "primaryContents";
    public string SecondaryResultsKey { get; set; } = "secondaryResults";
    public string RichGridRendererKey { get; set; } = "richGridRenderer";
    public string VideoDetailsKey { get; set; } = "videoDetails";
    public string CaptionsKey { get; set; } = "captions";
    public string PlayerCaptionsTracklistRendererKey { get; set; } = "playerCaptionsTracklistRenderer";
    public string CaptionTracksKey { get; set; } = "captionTracks";
    public string C4TabbedHeaderRendererKey { get; set; } = "c4TabbedHeaderRenderer";
    public string SubscriberCountTextKey { get; set; } = "subscriberCountText";
    public string ContentsKey { get; set; } = "contents";
    public string HeaderKey { get; set; } = "header";
    public string TabsKey { get; set; } = "tabs";
}

public sealed class InnerTubeClientProfile
{
    public string ClientName { get; set; } = string.Empty;
    public string ClientVersion { get; set; } = string.Empty;
    public string? ApiKey { get; set; }
    public int? AndroidSdkVersion { get; set; }
    public string? OsName { get; set; }
    public string? OsVersion { get; set; }
    public string? UserAgent { get; set; }
    public string[]? AcceptContentTypes { get; set; }
    public bool IsDefault { get; set; }
    public int Priority { get; set; }
}

public sealed class InnerTubeEndpointsConfig
{
    public string BaseUrl { get; set; } = "https://www.youtube.com/youtubei/v1";
    public string Search { get; set; } = "search";
    public string Player { get; set; } = "player";
    public string Browse { get; set; } = "browse";
    public string Next { get; set; } = "next";
}

public sealed class InnerTubeTimeoutsConfig
{
    public int SearchSeconds { get; set; } = 15;
    public int PlayerSeconds { get; set; } = 10;
    public int BrowseSeconds { get; set; } = 12;
    public int NextSeconds { get; set; } = 12;
    public int SubtitleFetchSeconds { get; set; } = 10;
}

public sealed class InnerTubeDefaultsConfig
{
    public string DefaultLanguage { get; set; } = "en";
    public string DefaultRegion { get; set; } = "US";
    public string FallbackUserAgent { get; set; } = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";
}

public sealed class InnerTubeBrowseIdsConfig
{
    public string Trending { get; set; } = "FEtrending";
    public string HomeFeed { get; set; } = "FEwhat_to_watch";
}

public sealed class InnerTubeUrlTemplatesConfig
{
    public string VideoUrl { get; set; } = "https://youtu.be/{videoId}";
    public string ChannelUrl { get; set; } = "https://www.youtube.com/channel/{channelId}";
    public string ThumbnailUrl { get; set; } = "https://i.ytimg.com/vi/{videoId}/hqdefault.jpg";
}

public sealed class InnerTubeSubtitlesConfig
{
    public string[] PreferredLanguages { get; set; } = ["ru", "en", "es"];
    public int MinLength { get; set; } = 40;
    public string SubtitleFormat { get; set; } = "json3";
}

public sealed class InnerTubeDiagnosticsConfig
{
    public bool EnableSchemaDriftDetection { get; set; } = true;
    public int MaxDriftWarningCount { get; set; } = 100;
}

public sealed class InnerTubeMetadataConfig
{
    public string[] SupportedUrlPatterns { get; set; } =
    [
        @"(?:youtube\.com/watch\?v=|youtu\.be/|youtube\.com/embed/)([a-zA-Z0-9_-]{11})",
        @"^([a-zA-Z0-9_-]{11})$"
    ];
    public string ChannelIdPrefix { get; set; } = "UC";
}

public sealed class InnerTubeRateLimitConfig
{
    public int MaxConcurrentRequests { get; set; } = 3;
    public int MinDelayBetweenRequestsMs { get; set; } = 200;
}
