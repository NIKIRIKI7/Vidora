using System.Net;
using System.Text.Json;
using Integrations.YouTube.Innertube;
using Integrations.YouTube.Innertube.Config;
using Integrations.YouTube.Innertube.Contracts;
using Integrations.YouTube.Innertube.Diagnostics;
using Integrations.YouTube.Innertube.Extractors;
using Integrations.YouTube.Innertube.Resolving;
using Integrations.YouTube.Innertube.Transport;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Moq;
using Moq.Protected;
using Xunit;

namespace Kernel.Tests;

public sealed class InnerTubeModuleTests
{
    private static InnerTubeOptions CreateDefaultOptions() => new()
    {
        Schema = new InnerTubeSchemaConfig(),
        Endpoints = new InnerTubeEndpointsConfig(),
        Timeouts = new InnerTubeTimeoutsConfig(),
        Defaults = new InnerTubeDefaultsConfig(),
        BrowseIds = new InnerTubeBrowseIdsConfig(),
        UrlTemplates = new InnerTubeUrlTemplatesConfig(),
        Subtitles = new InnerTubeSubtitlesConfig(),
        Diagnostics = new InnerTubeDiagnosticsConfig { EnableSchemaDriftDetection = false },
        Metadata = new InnerTubeMetadataConfig
        {
            SupportedUrlPatterns =
            [
                @"(?:youtube\.com/watch\?v=|youtu\.be/|youtube\.com/embed/)([a-zA-Z0-9_-]{11})",
                @"^([a-zA-Z0-9_-]{11})$",
                @"youtube\.com/channel/([a-zA-Z0-9_-]+)"
            ]
        },
        RateLimit = new InnerTubeRateLimitConfig(),
        ClientProfiles =
        [
            new InnerTubeClientProfile
            {
                ClientName = "WEB",
                ClientVersion = "2.20240825.01.00",
                ApiKey = "AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8",
                IsDefault = true,
                Priority = 1
            },
            new InnerTubeClientProfile
            {
                ClientName = "ANDROID",
                ClientVersion = "20.10.38",
                AndroidSdkVersion = 34,
                OsName = "Android",
                OsVersion = "14",
                Priority = 3
            },
            new InnerTubeClientProfile
            {
                ClientName = "IOS",
                ClientVersion = "20.10.4",
                OsName = "iOS",
                OsVersion = "18.3.1.22D72",
                Priority = 2
            },
            new InnerTubeClientProfile
            {
                ClientName = "TVHTML5_SIMPLY_EMBEDDED_PLAYER",
                ClientVersion = "2.20240825.01.00",
                Priority = 4
            }
        ]
    };

    // ─── Parsers ───────────────────────────────────────────────────────────

    [Theory]
    [InlineData("1,234,567 views", 1234567)]
    [InlineData("1.5M views", 1500000)]
    [InlineData("500K views", 500000)]
    [InlineData("1.2B views", 1200000000)]
    [InlineData("1 234 подписчика", 1234)]
    [InlineData("500K подписчиков", 500000)]
    [InlineData("100K subscribers", 100000)]
    [InlineData("1,5 тыс. просмотров", 1500)]
    [InlineData("2,3 млн просмотров", 2300000)]
    [InlineData("1,2 млрд просмотров", 1200000000)]
    [InlineData("12,5K views", 12500)]
    [InlineData("1 234 просмотра", 1234)]
    [InlineData("", 0)]
    [InlineData(null, 0)]
    [InlineData("0", 0)]
    public void ParseCount_ShouldHandleVariousFormats(string? input, long expected)
    {
        Assert.Equal(expected, InnerTubeParsers.ParseCount(input ?? ""));
    }

    [Theory]
    [InlineData("1:30", 90)]
    [InlineData("12:45", 765)]
    [InlineData("1:02:30", 3750)]
    [InlineData("0:15", 15)]
    [InlineData("45", 45)]
    [InlineData("", 0)]
    [InlineData(null, 0)]
    [InlineData("abc", 0)]
    public void ParseDurationToSeconds_ShouldHandleVariousFormats(string? input, int expected)
    {
        Assert.Equal(expected, InnerTubeParsers.ParseDurationToSeconds(input ?? ""));
    }

    // ─── Query Resolver ────────────────────────────────────────────────────

    [Fact]
    public void QueryResolver_DetectsVideoId()
    {
        var resolver = CreateQueryResolver();
        var result = resolver.Resolve("dQw4w9WgXcQ");

        Assert.Equal(QueryKind.VideoId, result.Kind);
        Assert.Equal("dQw4w9WgXcQ", result.ExtractedId);
    }

    [Theory]
    [InlineData("https://www.youtube.com/watch?v=dQw4w9WgXcQ", "dQw4w9WgXcQ")]
    [InlineData("https://youtu.be/dQw4w9WgXcQ", "dQw4w9WgXcQ")]
    [InlineData("https://youtube.com/embed/dQw4w9WgXcQ", "dQw4w9WgXcQ")]
    public void QueryResolver_DetectsVideoUrl(string url, string expectedId)
    {
        var resolver = CreateQueryResolver();
        var result = resolver.Resolve(url);

        Assert.Equal(QueryKind.VideoUrl, result.Kind);
        Assert.Equal(expectedId, result.ExtractedId);
        Assert.Contains(expectedId, result.ResolvedUrl!);
    }

    [Fact]
    public void QueryResolver_DetectsSearchQuery()
    {
        var resolver = CreateQueryResolver();
        var result = resolver.Resolve("cute cat videos compilation");

        Assert.Equal(QueryKind.SearchQuery, result.Kind);
        Assert.Equal("cute cat videos compilation", result.RawInput);
        Assert.Null(result.ExtractedId);
    }

    [Fact]
    public void QueryResolver_DetectsChannelUrl()
    {
        var resolver = CreateQueryResolver();
        var result = resolver.Resolve("https://www.youtube.com/channel/UC4QobU6ST3648RPCrMaS5Ig");

        Assert.Equal(QueryKind.ChannelUrl, result.Kind);
        Assert.Equal("UC4QobU6ST3648RPCrMaS5Ig", result.ExtractedId);
    }

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    public void QueryResolver_ReturnsUnknownForEmptyInput(string input)
    {
        var resolver = CreateQueryResolver();
        var result = resolver.Resolve(input);

        Assert.Equal(QueryKind.Unknown, result.Kind);
    }

    // ─── Search Response Extractor ─────────────────────────────────────────

    [Fact]
    public void SearchExtractor_ParsesVideoRenderer()
    {
        var json = """
        {
          "contents": {
            "twoColumnSearchResultsRenderer": {
              "primaryContents": {
                "sectionListRenderer": {
                  "contents": [
                    {
                      "itemSectionRenderer": {
                        "contents": [
                          {
                            "videoRenderer": {
                              "videoId": "abc12345678",
                              "title": { "runs": [{ "text": "Test Video Title" }] },
                              "ownerText": { "runs": [{ "text": "TestChannel", "navigationEndpoint": { "browseEndpoint": { "browseId": "UCtest123" } } }] },
                              "viewCountText": { "simpleText": "1,234,567 views" },
                              "lengthText": { "simpleText": "12:34" },
                              "publishedTimeText": { "simpleText": "2 days ago" },
                              "ownerBadges": []
                            }
                          }
                        ]
                      }
                    }
                  ]
                }
              }
            }
          }
        }
        """;

        var doc = JsonDocument.Parse(json);
        var extractor = new SearchResponseExtractor(new InnerTubeSchemaConfig());

        var results = extractor.Extract(doc.RootElement, 10);

        Assert.Single(results);
        Assert.Equal("abc12345678", results[0].VideoId);
        Assert.Equal("Test Video Title", results[0].Title);
        Assert.Equal("TestChannel", results[0].ChannelTitle);
        Assert.Equal("UCtest123", results[0].ChannelId);
        Assert.Equal(1234567, results[0].ViewCount);
        Assert.Equal(754, results[0].DurationSeconds);
        Assert.Equal("2 days ago", results[0].PublishedText);
    }

    [Fact]
    public void SearchExtractor_ParsesShortBylineTextFallback()
    {
        var json = """
        {
          "contents": {
            "twoColumnSearchResultsRenderer": {
              "primaryContents": {
                "sectionListRenderer": {
                  "contents": [
                    {
                      "itemSectionRenderer": {
                        "contents": [
                          {
                            "videoRenderer": {
                              "videoId": "abc12345678",
                              "title": { "runs": [{ "text": "Test Video Title" }] },
                              "shortBylineText": { "runs": [{ "text": "ShortChannel", "navigationEndpoint": { "browseEndpoint": { "browseId": "UCshort123" } } }] },
                              "viewCountText": { "simpleText": "1,5 тыс. просмотров" },
                              "lengthText": { "simpleText": "12:34" },
                              "publishedTimeText": { "simpleText": "2 days ago" },
                              "ownerBadges": []
                            }
                          }
                        ]
                      }
                    }
                  ]
                }
              }
            }
          }
        }
        """;

        var doc = JsonDocument.Parse(json);
        var extractor = new SearchResponseExtractor(new InnerTubeSchemaConfig());

        var results = extractor.Extract(doc.RootElement, 10);

        Assert.Single(results);
        Assert.Equal("ShortChannel", results[0].ChannelTitle);
        Assert.Equal("UCshort123", results[0].ChannelId);
        Assert.Equal(1500, results[0].ViewCount);
    }

    [Fact]
    public void SearchExtractor_HandlesEmptyResponse()
    {
        var json = """{ "contents": {} }""";
        var doc = JsonDocument.Parse(json);
        var extractor = new SearchResponseExtractor(new InnerTubeSchemaConfig());

        var results = extractor.Extract(doc.RootElement, 10);

        Assert.Empty(results);
    }

    [Fact]
    public void SearchExtractor_RespectsMaxResults()
    {
        var renderers = string.Join(",", Enumerable.Range(1, 20).Select(i =>
            $$"""
            {
              "videoRenderer": {
                "videoId": "vid_{{i:D2}}xxxxxxxxx",
                "title": { "runs": [{ "text": "Video {{i}}" }] },
                "ownerText": { "runs": [{ "text": "Ch{{i}}" }] },
                "viewCountText": { "simpleText": "1000 views" },
                "lengthText": { "simpleText": "1:00" },
                "publishedTimeText": { "simpleText": "1 day ago" }
              }
            }
            """));

        var json = $$"""
        {
          "contents": {
            "twoColumnSearchResultsRenderer": {
              "primaryContents": {
                "sectionListRenderer": {
                  "contents": [{
                    "itemSectionRenderer": {
                      "contents": [{{renderers}}]
                    }
                  }]
                }
              }
            }
          }
        }
        """;

        var doc = JsonDocument.Parse(json);
        var extractor = new SearchResponseExtractor(new InnerTubeSchemaConfig());

        var results = extractor.Extract(doc.RootElement, 5);

        Assert.Equal(5, results.Count);
    }

    // ─── Watch Next Response Extractor ─────────────────────────────────────

    [Fact]
    public void WatchNextExtractor_ParsesRelatedVideos()
    {
        var json = """
        {
          "contents": {
            "twoColumnWatchNextResults": {
              "secondaryResults": {
                "secondaryResults": {
                  "results": [
                    {
                      "compactVideoRenderer": {
                        "videoId": "rel123456789",
                        "title": { "runs": [{ "text": "Related Video" }] },
                        "shortBylineText": { "runs": [{ "text": "RelChannel", "navigationEndpoint": { "browseEndpoint": { "browseId": "UCrel999" } } }] },
                        "viewCountText": { "simpleText": "500K views" },
                        "lengthText": { "simpleText": "8:22" },
                        "publishedTimeText": { "simpleText": "1 week ago" },
                        "ownerBadges": []
                      }
                    }
                  ]
                }
              }
            }
          }
        }
        """;

        var doc = JsonDocument.Parse(json);
        var extractor = new WatchNextResponseExtractor(new InnerTubeSchemaConfig());

        var results = extractor.ExtractRelatedVideos(doc.RootElement, 10);

        Assert.Single(results);
        Assert.Equal("rel123456789", results[0].VideoId);
        Assert.Equal("Related Video", results[0].Title);
        Assert.Equal("RelChannel", results[0].ChannelTitle);
        Assert.Equal(500000, results[0].ViewCount);
        Assert.Equal(502, results[0].DurationSeconds);
    }

    [Fact]
    public void WatchNextExtractor_HandlesEmptyResponse()
    {
        var json = """{ "contents": {} }""";
        var doc = JsonDocument.Parse(json);
        var extractor = new WatchNextResponseExtractor(new InnerTubeSchemaConfig());

        var results = extractor.ExtractRelatedVideos(doc.RootElement, 10);

        Assert.Empty(results);
    }

    // ─── Player Response Extractor ─────────────────────────────────────────

    [Fact]
    public void PlayerExtractor_ExtractsSubtitleTracks()
    {
        var json = """
        {
          "captions": {
            "playerCaptionsTracklistRenderer": {
              "captionTracks": [
                {
                  "languageCode": "en",
                  "name": { "simpleText": "English" },
                  "baseUrl": "https://www.youtube.com/api/timedtext?v=abc&lang=en",
                  "kind": "asr"
                },
                {
                  "languageCode": "ru",
                  "name": { "simpleText": "Russian" },
                  "baseUrl": "https://www.youtube.com/api/timedtext?v=abc&lang=ru"
                }
              ]
            }
          }
        }
        """;

        var doc = JsonDocument.Parse(json);
        var extractor = new PlayerResponseExtractor(new InnerTubeSchemaConfig());

        var tracks = extractor.ExtractSubtitleTracks(doc.RootElement);

        Assert.Equal(2, tracks.Count);
        Assert.Equal("en", tracks[0].LanguageCode);
        Assert.Equal("English", tracks[0].Name);
        Assert.True(tracks[0].IsAutoGenerated);
        Assert.Equal("ru", tracks[1].LanguageCode);
        Assert.False(tracks[1].IsAutoGenerated);
    }

    [Fact]
    public void PlayerExtractor_ExtractsVideoDetails()
    {
        var json = """
        {
          "videoDetails": {
            "videoId": "playerVid123",
            "title": "Player Test Video",
            "author": "PlayerChannel",
            "channelId": "UCplayer123",
            "viewCount": "9876543",
            "lengthSeconds": "300"
          }
        }
        """;

        var doc = JsonDocument.Parse(json);
        var extractor = new PlayerResponseExtractor(new InnerTubeSchemaConfig());

        Assert.Equal("playerVid123", extractor.ExtractVideoId(doc.RootElement));
        Assert.Equal("Player Test Video", extractor.ExtractTitle(doc.RootElement));
        Assert.Equal(9876543, extractor.ExtractViewCount(doc.RootElement));
        Assert.Equal(300, extractor.ExtractDurationSeconds(doc.RootElement));
    }

    [Fact]
    public void PlayerExtractor_HandlesMissingCaptions()
    {
        var json = """{ "videoDetails": { "videoId": "abc" } }""";
        var doc = JsonDocument.Parse(json);
        var extractor = new PlayerResponseExtractor(new InnerTubeSchemaConfig());

        var tracks = extractor.ExtractSubtitleTracks(doc.RootElement);

        Assert.Empty(tracks);
    }

    // ─── Diagnostics ───────────────────────────────────────────────────────

    [Fact]
    public void Diagnostics_BuildsTopologyTree()
    {
        var json = """{ "a": 1, "b": { "c": "hello" }, "d": [1, 2, 3] }""";
        var doc = JsonDocument.Parse(json);
        var diagnostics = CreateDiagnostics();

        var tree = diagnostics.BuildTopologyTree(doc.RootElement, "root");

        Assert.Equal("root", tree.Name);
        Assert.Equal("Object", tree.Type);
        Assert.Equal(3, tree.ChildCount);
        Assert.Contains(tree.Children, c => c.Name == "a");
        Assert.Contains(tree.Children, c => c.Name == "b");
        Assert.Contains(tree.Children, c => c.Name == "d");
    }

    [Fact]
    public void Diagnostics_BuildsFormattedSnippet()
    {
        var json = """{ "key": "value", "num": 42 }""";
        var doc = JsonDocument.Parse(json);
        var diagnostics = CreateDiagnostics();

        var snippet = diagnostics.BuildFormattedSnippet(doc.RootElement);

        Assert.Contains("key", snippet);
        Assert.Contains("value", snippet);
        Assert.Contains("42", snippet);
    }

    [Fact]
    public void Diagnostics_DetectsSchemaDrift()
    {
        var json = """{ "unexpectedRenderer": { "data": 1 } }""";
        var doc = JsonDocument.Parse(json);
        var diagnostics = CreateDiagnostics();

        var report = diagnostics.DetectSchemaDrift(doc.RootElement, new InnerTubeSchemaConfig());

        Assert.False(report.HasDrift);
        Assert.Equal(2, report.TotalChecked);
    }

    // ─── JsonElement Extensions ────────────────────────────────────────────

    [Fact]
    public void ExtractRunsText_FromSimpleText()
    {
        var json = """{ "title": { "simpleText": "Hello World" } }""";
        var doc = JsonDocument.Parse(json);

        var result = doc.RootElement.ExtractRunsText("title");

        Assert.Equal("Hello World", result);
    }

    [Fact]
    public void ExtractRunsText_FromRuns()
    {
        var json = """{ "title": { "runs": [{ "text": "Hello " }, { "text": "World" }] } }""";
        var doc = JsonDocument.Parse(json);

        var result = doc.RootElement.ExtractRunsText("title");

        Assert.Equal("Hello World", result);
    }

    [Fact]
    public void ExtractRunsText_FromString()
    {
        var json = """{ "title": "Direct String" }""";
        var doc = JsonDocument.Parse(json);

        var result = doc.RootElement.ExtractRunsText("title");

        Assert.Equal("Direct String", result);
    }

    [Fact]
    public void ExtractRunsText_ReturnsEmptyForMissing()
    {
        var json = """{ "other": "data" }""";
        var doc = JsonDocument.Parse(json);

        var result = doc.RootElement.ExtractRunsText("title");

        Assert.Equal(string.Empty, result);
    }

    // ─── InnerTubeClient Facade ────────────────────────────────────────────

    [Fact]
    public async Task InnerTubeClient_SearchReturnsEmptyForBlankQuery()
    {
        var client = CreateInnerTubeClient(out _);

        var results = await client.SearchVideosAsync("");

        Assert.Empty(results);
    }

    [Fact]
    public async Task InnerTubeClient_SearchReturnsEmptyOnException()
    {
        var mockTransport = new Mock<IInnerTubeHttpTransport>();
        mockTransport
            .Setup(t => t.SendSearchAsync(It.IsAny<string>(), It.IsAny<string>(), It.IsAny<string>(), It.IsAny<string?>(), It.IsAny<CancellationToken>()))
            .ThrowsAsync(new HttpRequestException("Network error"));

        var client = CreateInnerTubeClient(out _, mockTransport.Object);

        var results = await client.SearchVideosAsync("test query");

        Assert.Empty(results);
    }

    [Fact]
    public async Task InnerTubeClient_GetVideoDetailsReturnsNullForBlankId()
    {
        var client = CreateInnerTubeClient(out _);

        var result = await client.GetVideoDetailsAsync("");

        Assert.Null(result);
    }

    [Fact]
    public async Task InnerTubeClient_GetSubtitleTracksReturnsEmptyForBlankId()
    {
        var client = CreateInnerTubeClient(out _);

        var tracks = await client.GetSubtitleTracksAsync("   ");

        Assert.Empty(tracks);
    }

    [Fact]
    public async Task InnerTubeClient_GetChannelSubscribersReturnsZeroForInvalidPrefix()
    {
        var client = CreateInnerTubeClient(out _);

        var count = await client.GetChannelSubscribersAsync("not_a_channel_id");

        Assert.Equal(0, count);
    }

    [Fact]
    public async Task InnerTubeClient_TrendingFallsBackToHomeFeed()
    {
        var mockTransport = new Mock<IInnerTubeHttpTransport>();
        mockTransport.Setup(t => t.SendBrowseAsync(
                "FEtrending", It.IsAny<string>(), It.IsAny<string>(), It.IsAny<CancellationToken>(), It.IsAny<string?>()))
            .ThrowsAsync(new HttpRequestException("400 invalid argument"));

        var homeFeed = JsonDocument.Parse("""
        {
          "contents": {
            "twoColumnBrowseResultsRenderer": {
              "tabs": [
                {
                  "tabRenderer": {
                    "content": {
                      "richGridRenderer": {
                        "contents": [
                          {
                            "richItemRenderer": {
                              "content": {
                                "videoRenderer": {
                                  "videoId": "homeVid0001",
                                  "title": { "runs": [{ "text": "Home Video" }] },
                                  "ownerText": { "runs": [{ "text": "HomeChannel" }] },
                                  "viewCountText": { "simpleText": "1,000 views" },
                                  "lengthText": { "simpleText": "3:00" }
                                }
                              }
                            }
                          }
                        ]
                      }
                    }
                  }
                }
              ]
            }
          }
        }
        """).RootElement;
        mockTransport.Setup(t => t.SendBrowseAsync(
                "FEwhat_to_watch", It.IsAny<string>(), It.IsAny<string>(), It.IsAny<CancellationToken>(), It.IsAny<string?>()))
            .ReturnsAsync(homeFeed);

        var client = CreateInnerTubeClient(out _, mockTransport.Object);

        var videos = await client.GetTrendingVideosAsync("en");

        Assert.Single(videos);
        Assert.Equal("homeVid0001", videos[0].VideoId);
    }

    // ─── Options Default Profiles ──────────────────────────────────────────

    [Fact]
    public void Options_HasDefaultClientProfiles()
    {
        var options = CreateDefaultOptions();

        Assert.NotEmpty(options.ClientProfiles);
        Assert.Contains(options.ClientProfiles, p => p.ClientName == "WEB");
        Assert.Contains(options.ClientProfiles, p => p.ClientName == "IOS");
        Assert.Contains(options.ClientProfiles, p => p.ClientName == "ANDROID");
        Assert.Contains(options.ClientProfiles, p => p.ClientName == "TVHTML5_SIMPLY_EMBEDDED_PLAYER");
    }

    [Fact]
    public void Options_BrowseIds_HaveDefaults()
    {
        var options = CreateDefaultOptions();

        Assert.Equal("FEtrending", options.BrowseIds.Trending);
        Assert.Equal("FEwhat_to_watch", options.BrowseIds.HomeFeed);
    }

    [Fact]
    public void Options_Subtitles_HaveDefaults()
    {
        var options = CreateDefaultOptions();

        Assert.Contains("ru", options.Subtitles.PreferredLanguages);
        Assert.Contains("en", options.Subtitles.PreferredLanguages);
        Assert.Equal("json3", options.Subtitles.SubtitleFormat);
    }

    [Fact]
    public void Options_Timeouts_HaveReasonableDefaults()
    {
        var options = CreateDefaultOptions();

        Assert.InRange(options.Timeouts.SearchSeconds, 5, 60);
        Assert.InRange(options.Timeouts.PlayerSeconds, 3, 30);
        Assert.InRange(options.Timeouts.SubtitleFetchSeconds, 3, 30);
    }

    // ─── Transport ─────────────────────────────────────────────────────────

    [Fact]
    public async Task Transport_PlayerUsesIosProfileAndContext()
    {
        var options = CreateDefaultOptions();
        var handler = new RecordingHandler();
        var transport = CreateTransport(options, handler);

        var root = await transport.SendPlayerAsync("dQw4w9WgXcQ", InnerTubeClientType.Ios, CancellationToken.None);

        Assert.True(root.TryGetProperty("videoDetails", out _));

        var client = handler.RequestBodies.Single()
            .GetProperty("context").GetProperty("client");
        Assert.Equal("IOS", client.GetProperty("clientName").GetString());
        Assert.Equal("20.10.4", client.GetProperty("clientVersion").GetString());
        Assert.Equal("iOS", client.GetProperty("osName").GetString());
        Assert.False(client.TryGetProperty("androidSdkVersion", out _));
    }

    [Fact]
    public async Task Transport_FallbackRewritesClientProfileInContext()
    {
        var options = CreateDefaultOptions();
        options.ClientProfiles =
        [
            new InnerTubeClientProfile
            {
                ClientName = "IOS",
                ClientVersion = "20.10.4",
                OsName = "iOS",
                OsVersion = "18.3.1.22D72",
                Priority = 1
            },
            new InnerTubeClientProfile
            {
                ClientName = "ANDROID",
                ClientVersion = "20.10.38",
                AndroidSdkVersion = 34,
                OsName = "Android",
                OsVersion = "14",
                Priority = 2
            }
        ];

        var handler = new RecordingHandler(failFirst: true);
        var transport = CreateTransport(options, handler);

        var root = await transport.SendPlayerAsync("dQw4w9WgXcQ", InnerTubeClientType.Ios, CancellationToken.None);

        Assert.True(root.TryGetProperty("videoDetails", out _));
        Assert.Equal(2, handler.RequestBodies.Count);

        var retryClient = handler.RequestBodies[1]
            .GetProperty("context").GetProperty("client");
        Assert.Equal("ANDROID", retryClient.GetProperty("clientName").GetString());
        Assert.Equal("20.10.38", retryClient.GetProperty("clientVersion").GetString());
        Assert.Equal(34, retryClient.GetProperty("androidSdkVersion").GetInt32());
        Assert.Equal("Android", retryClient.GetProperty("osName").GetString());
    }

    // ─── InnerTube Service Extensions ──────────────────────────────────────
    [Fact]
    public void ServiceExtensions_RegistersAllComponents()
    {
        var services = new Microsoft.Extensions.DependencyInjection.ServiceCollection();
        var configuration = new Microsoft.Extensions.Configuration.ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["YouTube:InnerTube:Endpoints:BaseUrl"] = "https://www.youtube.com/youtubei/v1",
                ["YouTube:InnerTube:Endpoints:Search"] = "search",
                ["YouTube:InnerTube:Endpoints:Player"] = "player",
                ["YouTube:InnerTube:Endpoints:Browse"] = "browse",
                ["YouTube:InnerTube:Endpoints:Next"] = "next",
                ["YouTube:InnerTube:Timeouts:SearchSeconds"] = "15",
                ["YouTube:InnerTube:Timeouts:PlayerSeconds"] = "10",
                ["YouTube:InnerTube:Timeouts:BrowseSeconds"] = "12",
                ["YouTube:InnerTube:Timeouts:NextSeconds"] = "12",
                ["YouTube:InnerTube:Timeouts:SubtitleFetchSeconds"] = "10",
                ["YouTube:InnerTube:Defaults:DefaultLanguage"] = "en",
                ["YouTube:InnerTube:Defaults:DefaultRegion"] = "US",
                ["YouTube:InnerTube:BrowseIds:Trending"] = "FEtrending",
                ["YouTube:InnerTube:BrowseIds:HomeFeed"] = "FEwhat_to_watch"
            })
            .Build();

        services.AddInnerTubeModule(configuration);
        var provider = services.BuildServiceProvider();

        Assert.NotNull(provider.GetService<IInnerTubeClient>());
        Assert.NotNull(provider.GetService<IInnerTubeHttpTransport>());
        Assert.NotNull(provider.GetService<ISearchResponseExtractor>());
        Assert.NotNull(provider.GetService<IWatchNextResponseExtractor>());
        Assert.NotNull(provider.GetService<IPlayerResponseExtractor>());
        Assert.NotNull(provider.GetService<IInnerTubeDiagnostics>());
        Assert.NotNull(provider.GetService<IYouTubeQueryResolver>());
    }

    // ─── Helpers ───────────────────────────────────────────────────────────

    private static YouTubeQueryResolver CreateQueryResolver()
    {
        var options = Options.Create(CreateDefaultOptions());
        return new YouTubeQueryResolver(options, NullLogger<YouTubeQueryResolver>.Instance);
    }

    private static InnerTubeDiagnostics CreateDiagnostics()
    {
        var options = Options.Create(CreateDefaultOptions());
        return new InnerTubeDiagnostics(options, NullLogger<InnerTubeDiagnostics>.Instance);
    }

    private static InnerTubeClient CreateInnerTubeClient(out Mock<IInnerTubeHttpTransport> mockTransport, IInnerTubeHttpTransport? transport = null)
    {
        var options = Options.Create(CreateDefaultOptions());
        var schema = new InnerTubeSchemaConfig();

        var searchExt = new SearchResponseExtractor(schema);
        var watchNextExt = new WatchNextResponseExtractor(schema);
        var playerExt = new PlayerResponseExtractor(schema);
        var diagnostics = new InnerTubeDiagnostics(options, NullLogger<InnerTubeDiagnostics>.Instance);

        mockTransport = new Mock<IInnerTubeHttpTransport>();
        var effectiveTransport = transport ?? mockTransport.Object;

        return new InnerTubeClient(
            effectiveTransport,
            searchExt,
            watchNextExt,
            playerExt,
            diagnostics,
            options,
            NullLogger<InnerTubeClient>.Instance);
    }

    private static InnerTubeHttpTransport CreateTransport(InnerTubeOptions options, HttpMessageHandler handler)
    {
        return new InnerTubeHttpTransport(
            new HttpClient(handler),
            Options.Create(options),
            NullLogger<InnerTubeHttpTransport>.Instance);
    }

    private sealed class RecordingHandler : HttpMessageHandler
    {
        private readonly bool _failFirst;

        public RecordingHandler(bool failFirst = false) => _failFirst = failFirst;

        public List<JsonElement> RequestBodies { get; } = [];

        protected override async Task<HttpResponseMessage> SendAsync(
            HttpRequestMessage request, CancellationToken cancellationToken)
        {
            var json = request.Content is null
                ? "{}"
                : await request.Content.ReadAsStringAsync(cancellationToken);
            using var doc = JsonDocument.Parse(json);
            RequestBodies.Add(doc.RootElement.Clone());

            if (_failFirst && RequestBodies.Count == 1)
            {
                return new HttpResponseMessage(HttpStatusCode.BadRequest)
                {
                    Content = new StringContent("{\"error\":{\"message\":\"Precondition check failed.\"}}")
                };
            }

            return new HttpResponseMessage(HttpStatusCode.OK)
            {
                Content = new StringContent("{\"videoDetails\":{\"videoId\":\"dQw4w9WgXcQ\",\"title\":\"t\"}}")
            };
        }
    }
}
