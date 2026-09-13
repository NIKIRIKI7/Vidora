using System.Text.Json;
using Integrations.YouTube.Config;
using Integrations.YouTube.Contracts;
using Integrations.YouTube.Innertube;
using Integrations.YouTube.Innertube.Config;
using Integrations.YouTube.Innertube.Contracts;
using Integrations.YouTube.Innertube.Diagnostics;
using Integrations.YouTube.Innertube.Extractors;
using Integrations.YouTube.Innertube.Resolving;
using Integrations.YouTube.Innertube.Transport;
using Integrations.YouTube.Scraper;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Moq;
using Xunit;

namespace Kernel.Tests;

public sealed class InnerTubeExtendedCapabilitiesTests
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
        Metadata = new InnerTubeMetadataConfig(),
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
            }
        ]
    };

    private static InnerTubeClient CreateInnerTubeClient(out Mock<IInnerTubeHttpTransport> mockTransport)
    {
        var options = Options.Create(CreateDefaultOptions());
        var schema = new InnerTubeSchemaConfig();
        var searchExt = new SearchResponseExtractor(schema);
        var watchNextExt = new WatchNextResponseExtractor(schema);
        var playerExt = new PlayerResponseExtractor(schema);
        var diagnostics = new InnerTubeDiagnostics(options, NullLogger<InnerTubeDiagnostics>.Instance);

        mockTransport = new Mock<IInnerTubeHttpTransport>();
        return new InnerTubeClient(
            mockTransport.Object, searchExt, watchNextExt, playerExt, diagnostics, options,
            NullLogger<InnerTubeClient>.Instance);
    }

    private static InnerTubeMetadataScraper CreateScraper(Mock<IInnerTubeClient>? mockClient = null)
    {
        mockClient ??= new Mock<IInnerTubeClient>();
        var innerTubeOptions = Options.Create(new InnerTubeOptions());
        var resolver = new YouTubeQueryResolver(innerTubeOptions, NullLogger<YouTubeQueryResolver>.Instance);
        return new InnerTubeMetadataScraper(
            mockClient.Object, resolver, new HttpClient(),
            Options.Create(new YouTubeOptions()),
            NullLogger<InnerTubeMetadataScraper>.Instance);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 1. PlayerResponseExtractor — Heatmap
    // ═══════════════════════════════════════════════════════════════════════

    [Fact]
    public void PlayerExtractor_ExtractHeatmap_FromTopLevel()
    {
        var json = """
        {
          "playerHeatmapRenderer": {
            "heatmap": [
              { "startMillis": "0", "endMillis": "5000", "intensity": "0.95" },
              { "startMillis": "5000", "endMillis": "10000", "intensity": "0.72" },
              { "startMillis": "10000", "endMillis": "15000", "intensity": "0.45" }
            ]
          }
        }
        """;
        var doc = JsonDocument.Parse(json);
        var extractor = new PlayerResponseExtractor(new InnerTubeSchemaConfig());

        var heatmap = extractor.ExtractHeatmap(doc.RootElement);

        Assert.Equal(3, heatmap.Count);
        Assert.Equal(0.0, heatmap[0].StartSeconds);
        Assert.Equal(5.0, heatmap[0].EndSeconds);
        Assert.Equal(0.95, heatmap[0].Intensity, 2);
        Assert.Equal(5.0, heatmap[1].StartSeconds);
        Assert.Equal(10.0, heatmap[1].EndSeconds);
        Assert.Equal(0.72, heatmap[1].Intensity, 2);
    }

    [Fact]
    public void PlayerExtractor_ExtractHeatmap_EmptyWhenMissing()
    {
        var json = """{ "videoDetails": { "videoId": "abc" } }""";
        var doc = JsonDocument.Parse(json);
        var extractor = new PlayerResponseExtractor(new InnerTubeSchemaConfig());

        var heatmap = extractor.ExtractHeatmap(doc.RootElement);

        Assert.Empty(heatmap);
    }

    [Fact]
    public void PlayerExtractor_ExtractHeatmap_FromFrameworkUpdates()
    {
        var json = """
        {
          "frameworkUpdates": {
            "entityBatchUpdate": {
              "mutations": [
                {
                  "payload": {
                    "macroMarkersListEntity": {
                      "externalVideoId": "dQw4w9WgXcQ",
                      "markersList": {
                        "markerType": "MARKER_TYPE_HEATMAP",
                        "markers": [
                          { "startMillis": "0", "durationMillis": "2140", "intensityScoreNormalized": 1 },
                          { "startMillis": "2140", "durationMillis": "2140", "intensityScoreNormalized": 0.0052 }
                        ]
                      }
                    }
                  }
                }
              ]
            }
          }
        }
        """;
        var doc = JsonDocument.Parse(json);
        var extractor = new PlayerResponseExtractor(new InnerTubeSchemaConfig());

        var heatmap = extractor.ExtractHeatmap(doc.RootElement);

        Assert.Equal(2, heatmap.Count);
        Assert.Equal(0.0, heatmap[0].StartSeconds);
        Assert.Equal(2.14, heatmap[0].EndSeconds, 2);
        Assert.Equal(1.0, heatmap[0].Intensity, 2);
        Assert.Equal(2.14, heatmap[1].StartSeconds, 2);
        Assert.Equal(4.28, heatmap[1].EndSeconds, 2);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 2. PlayerResponseExtractor — WordTimestamps
    // ═══════════════════════════════════════════════════════════════════════

    [Fact]
    public void PlayerExtractor_ExtractWordTimestamps()
    {
        var json = """
        {
          "videoDetails": {
            "videoId": "tsvid123",
            "transcriptBodyRenderer": {
              "cueGroups": [
                {
                  "transcriptCueGroupRenderer": {
                    "cues": [
                      {
                        "transcriptCueRenderer": {
                          "startOffsetMs": "0",
                          "durationMs": "520",
                          "cue": { "simpleText": "Hello" }
                        }
                      },
                      {
                        "transcriptCueRenderer": {
                          "startOffsetMs": "520",
                          "durationMs": "380",
                          "cue": { "simpleText": "world" }
                        }
                      }
                    ]
                  }
                }
              ]
            }
          }
        }
        """;
        var doc = JsonDocument.Parse(json);
        var extractor = new PlayerResponseExtractor(new InnerTubeSchemaConfig());

        var words = extractor.ExtractWordTimestamps(doc.RootElement);

        Assert.Equal(2, words.Count);
        Assert.Equal("Hello", words[0].Word);
        Assert.Equal(0.0, words[0].StartMs);
        Assert.Equal(520.0, words[0].EndMs);
        Assert.Equal("world", words[1].Word);
        Assert.Equal(520.0, words[1].StartMs);
        Assert.Equal(900.0, words[1].EndMs);
    }

    [Fact]
    public void PlayerExtractor_ExtractWordTimestamps_EmptyWhenMissing()
    {
        var json = """{ "videoDetails": { "videoId": "abc" } }""";
        var doc = JsonDocument.Parse(json);
        var extractor = new PlayerResponseExtractor(new InnerTubeSchemaConfig());

        var words = extractor.ExtractWordTimestamps(doc.RootElement);

        Assert.Empty(words);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 3. PlayerResponseExtractor — FindNode
    // ═══════════════════════════════════════════════════════════════════════

    [Fact]
    public void PlayerExtractor_FindNode_DotPath()
    {
        var json = """{ "a": { "b": { "c": "found" } } }""";
        var doc = JsonDocument.Parse(json);
        var extractor = new PlayerResponseExtractor(new InnerTubeSchemaConfig());

        var result = extractor.FindNode(doc.RootElement, "a.b.c");

        Assert.Equal("found", result);
    }

    [Fact]
    public void PlayerExtractor_FindNode_ReturnsNullForMissingPath()
    {
        var json = """{ "a": 1 }""";
        var doc = JsonDocument.Parse(json);
        var extractor = new PlayerResponseExtractor(new InnerTubeSchemaConfig());

        var result = extractor.FindNode(doc.RootElement, "x.y.z");

        Assert.Null(result);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 4. WatchNextResponseExtractor — Chapters
    // ═══════════════════════════════════════════════════════════════════════

    [Fact]
    public void WatchNextExtractor_ExtractChapters_FromChapteredPlayerBar()
    {
        var json = """
        {
          "contents": {
            "twoColumnWatchNextResults": {
              "results": {
                "results": {
                  "contents": [
                    {
                      "chapteredPlayerBarRenderer": {
                        "chapters": [
                          {
                            "chapterRenderer": {
                              "title": { "simpleText": "Introduction" },
                              "timeRangeStartMillis": 0,
                              "thumbnail": { "thumbnails": [{ "url": "https://example.com/thumb1.jpg" }] }
                            }
                          },
                          {
                            "chapterRenderer": {
                              "title": { "simpleText": "Main Content" },
                              "timeRangeStartMillis": 60000,
                              "thumbnail": { "thumbnails": [{ "url": "https://example.com/thumb2.jpg" }] }
                            }
                          },
                          {
                            "chapterRenderer": {
                              "title": { "simpleText": "Conclusion" },
                              "timeRangeStartMillis": 180000,
                              "thumbnail": { "thumbnails": [{ "url": "https://example.com/thumb3.jpg" }] }
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
        var extractor = new WatchNextResponseExtractor(new InnerTubeSchemaConfig());

        var chapters = extractor.ExtractChapters(doc.RootElement);

        Assert.Equal(3, chapters.Count);
        Assert.Equal("Introduction", chapters[0].Title);
        Assert.Equal(0, chapters[0].StartSeconds);
        Assert.Equal(60, chapters[0].EndSeconds);
        Assert.Equal("Main Content", chapters[1].Title);
        Assert.Equal(60, chapters[1].StartSeconds);
        Assert.Equal(180, chapters[1].EndSeconds);
        Assert.Equal("Conclusion", chapters[2].Title);
        Assert.Equal(180, chapters[2].StartSeconds);
        Assert.Equal(0, chapters[2].EndSeconds);
    }

    [Fact]
    public void WatchNextExtractor_ExtractChapters_EmptyWhenMissing()
    {
        var json = """
        {
          "contents": {
            "twoColumnWatchNextResults": {
              "results": {
                "results": {
                  "contents": []
                }
              }
            }
          }
        }
        """;
        var doc = JsonDocument.Parse(json);
        var extractor = new WatchNextResponseExtractor(new InnerTubeSchemaConfig());

        var chapters = extractor.ExtractChapters(doc.RootElement);

        Assert.Empty(chapters);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 5. WatchNextResponseExtractor — Comments Continuation
    // ═══════════════════════════════════════════════════════════════════════

    [Fact]
    public void WatchNextExtractor_ExtractCommentsContinuationToken()
    {
        var json = """
        {
          "contents": {
            "twoColumnWatchNextResults": {
              "results": {
                "results": {
                  "contents": [
                    {
                      "itemSectionRenderer": {
                        "contents": [
                          {
                            "continuationItemRenderer": {
                              "continuationEndpoint": {
                                "continuationCommand": {
                                  "token": "CgtBbGM1ZjRHNl9hYQ%3D%3D"
                                }
                              }
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
        var extractor = new WatchNextResponseExtractor(new InnerTubeSchemaConfig());

        var token = extractor.ExtractCommentsContinuationToken(doc.RootElement);

        Assert.Equal("CgtBbGM1ZjRHNl9hYQ%3D%3D", token);
    }

    [Fact]
    public void WatchNextExtractor_ExtractCommentsContinuationToken_ReturnsNull_WhenMissing()
    {
        var json = """
        {
          "contents": {
            "twoColumnWatchNextResults": {
              "results": {
                "results": {
                  "contents": []
                }
              }
            }
          }
        }
        """;
        var doc = JsonDocument.Parse(json);
        var extractor = new WatchNextResponseExtractor(new InnerTubeSchemaConfig());

        var token = extractor.ExtractCommentsContinuationToken(doc.RootElement);

        Assert.Null(token);
    }

    [Fact]
    public void WatchNextExtractor_ExtractCommentsFromContinuation()
    {
        var json = """
        {
          "onResponseReceivedEndpoints": [
            {
              "reloadContinuationItemsCommand": {
                "continuationItems": [
                  {
                    "commentThreadRenderer": {
                      "comment": {
                        "commentRenderer": {
                          "authorText": { "simpleText": "TestUser" },
                          "authorEndpoint": { "browseEndpoint": { "browseId": "UC123" } },
                          "commentId": "comment_abc",
                          "contentText": { "runs": [{ "text": "Great video!" }] },
                          "publishedTimeText": { "simpleText": "2 hours ago" },
                          "voteCount": { "simpleText": "42" }
                        }
                      }
                    }
                  },
                  {
                    "commentThreadRenderer": {
                      "comment": {
                        "commentRenderer": {
                          "authorText": { "simpleText": "AnotherUser" },
                          "authorEndpoint": { "browseEndpoint": { "browseId": "UC456" } },
                          "commentId": "comment_def",
                          "contentText": { "runs": [{ "text": "Thanks for sharing" }] },
                          "publishedTimeText": { "simpleText": "1 day ago" },
                          "voteCount": { "simpleText": "5" }
                        }
                      }
                    }
                  }
                ]
              }
            }
          ]
        }
        """;
        var doc = JsonDocument.Parse(json);
        var extractor = new WatchNextResponseExtractor(new InnerTubeSchemaConfig());

        var comments = extractor.ExtractCommentsFromContinuation(doc.RootElement, 50);

        Assert.Equal(2, comments.Count);
        Assert.Equal("TestUser", comments[0].AuthorName);
        Assert.Equal("UC123", comments[0].AuthorChannelId);
        Assert.Equal("Great video!", comments[0].Text);
        Assert.Equal("comment_abc", comments[0].CommentId);
        Assert.Equal(42, comments[0].LikeCount);
        Assert.Equal("2 hours ago", comments[0].PublishedTime);
        Assert.Equal("AnotherUser", comments[1].AuthorName);
    }

    [Fact]
    public void WatchNextExtractor_ExtractCommentsFromContinuation_EmptyWhenNoEndpoints()
    {
        var json = """{ "unexpected": true }""";
        var doc = JsonDocument.Parse(json);
        var extractor = new WatchNextResponseExtractor(new InnerTubeSchemaConfig());

        var comments = extractor.ExtractCommentsFromContinuation(doc.RootElement);

        Assert.Empty(comments);
    }

    [Fact]
    public void WatchNextExtractor_ExtractCommentsFromContinuation_ModernEntitySchema()
    {
        var json = """
        {
          "frameworkUpdates": {
            "entityBatchUpdate": {
              "mutations": [
                {
                  "payload": {
                    "commentEntityPayload": {
                      "key": "COMMENT_KEY_1",
                      "properties": {
                        "commentId": "Ugx123",
                        "content": { "content": "Do you like these types of conversations?" },
                        "publishedTime": "2 weeks ago"
                      },
                      "author": {
                        "channelId": "UCGq-a57w-aPwyi3pW7XLiHw",
                        "displayName": "@TheDiaryOfACEO"
                      },
                      "toolbar": { "likeCountLiked": "1.4K", "replyCount": "319" }
                    }
                  }
                }
              ]
            }
          },
          "onResponseReceivedEndpoints": [
            {
              "reloadContinuationItemsCommand": {
                "targetId": "comments-section",
                "continuationItems": [
                  {
                    "commentThreadRenderer": {
                      "commentViewModel": {
                        "commentViewModel": {
                          "commentKey": "COMMENT_KEY_1",
                          "commentId": "Ugx123"
                        }
                      }
                    }
                  }
                ]
              }
            }
          ]
        }
        """;
        var doc = JsonDocument.Parse(json);
        var extractor = new WatchNextResponseExtractor(new InnerTubeSchemaConfig());

        var comments = extractor.ExtractCommentsFromContinuation(doc.RootElement, 50);

        Assert.Single(comments);
        Assert.Equal("@TheDiaryOfACEO", comments[0].AuthorName);
        Assert.Equal("UCGq-a57w-aPwyi3pW7XLiHw", comments[0].AuthorChannelId);
        Assert.Equal("Do you like these types of conversations?", comments[0].Text);
        Assert.Equal(1400, comments[0].LikeCount);
        Assert.Equal("2 weeks ago", comments[0].PublishedTime);
        Assert.Equal("Ugx123", comments[0].CommentId);
    }

    [Fact]
    public void WatchNextExtractor_ExtractCommentsContinuationToken_PrefersCommentSection()
    {
        var json = """
        {
          "contents": {
            "twoColumnWatchNextResults": {
              "results": {
                "results": {
                  "contents": [
                    {
                      "itemSectionRenderer": {
                        "sectionIdentifier": "related-item-section",
                        "contents": [
                          {
                            "continuationItemRenderer": {
                              "continuationEndpoint": {
                                "continuationCommand": { "token": "RELATED_TOKEN" }
                              }
                            }
                          }
                        ]
                      }
                    },
                    {
                      "itemSectionRenderer": {
                        "sectionIdentifier": "comment-item-section",
                        "contents": [
                          {
                            "continuationItemRenderer": {
                              "continuationEndpoint": {
                                "continuationCommand": { "token": "COMMENT_TOKEN" }
                              }
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
        var extractor = new WatchNextResponseExtractor(new InnerTubeSchemaConfig());

        var token = extractor.ExtractCommentsContinuationToken(doc.RootElement);

        Assert.Equal("COMMENT_TOKEN", token);
    }

    [Fact]
    public void WatchNextExtractor_ExtractChapters_FromPlayerOverlayMarkers()
    {
        var json = """
        {
          "playerOverlays": {
            "playerOverlayRenderer": {
              "decoratedPlayerBarRenderer": {
                "decoratedPlayerBarRenderer": {
                  "playerBar": {
                    "multiMarkersPlayerBarRenderer": {
                      "markersMap": [
                        {
                          "key": "DESCRIPTION_CHAPTERS",
                          "value": {
                            "chapters": [
                              {
                                "chapterRenderer": {
                                  "title": { "simpleText": "Intro" },
                                  "timeRangeStartMillis": 0,
                                  "thumbnail": {
                                    "thumbnails": [
                                      { "url": "https://i.ytimg.com/vi/Lf5oqGOCRCM/hqdefault_20000.jpg" }
                                    ]
                                  }
                                }
                              },
                              {
                                "chapterRenderer": {
                                  "title": { "simpleText": "AI Is A Con" },
                                  "timeRangeStartMillis": 156000
                                }
                              },
                              {
                                "chapterRenderer": {
                                  "title": { "simpleText": "Outro" },
                                  "timeRangeStartMillis": 300000
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
          }
        }
        """;
        var doc = JsonDocument.Parse(json);
        var extractor = new WatchNextResponseExtractor(new InnerTubeSchemaConfig());

        var chapters = extractor.ExtractChapters(doc.RootElement);

        Assert.Equal(3, chapters.Count);
        Assert.Equal("Intro", chapters[0].Title);
        Assert.Equal(0, chapters[0].StartSeconds);
        Assert.Equal(156, chapters[0].EndSeconds);
        Assert.Equal("https://i.ytimg.com/vi/Lf5oqGOCRCM/hqdefault_20000.jpg", chapters[0].ThumbnailUrl);
        Assert.Equal("AI Is A Con", chapters[1].Title);
        Assert.Equal(156, chapters[1].StartSeconds);
        Assert.Equal(300, chapters[1].EndSeconds);
        Assert.Equal(300, chapters[2].StartSeconds);
    }

    [Fact]
    public void WatchNextExtractor_ExtractUploadDate_FromDateText()
    {
        var json = """
        {
          "contents": {
            "twoColumnWatchNextResults": {
              "results": {
                "results": {
                  "contents": [
                    {
                      "videoPrimaryInfoRenderer": {
                        "dateText": { "simpleText": "Aug 27, 2026" }
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

        var uploadDate = extractor.ExtractUploadDate(doc.RootElement);

        Assert.Equal("Aug 27, 2026", uploadDate);
    }

    [Fact]
    public void WatchNextExtractor_ExtractUploadDate_PrefersMicroformat()
    {
        var json = """
        {
          "microformat": {
            "microformatDataRenderer": { "uploadDate": "2026-08-27" }
          }
        }
        """;
        var doc = JsonDocument.Parse(json);
        var extractor = new WatchNextResponseExtractor(new InnerTubeSchemaConfig());

        var uploadDate = extractor.ExtractUploadDate(doc.RootElement);

        Assert.Equal("2026-08-27", uploadDate);
    }

    [Fact]
    public async Task InnerTubeClient_GetVideoUploadDateAsync_ReturnsDate()
    {
        var client = CreateInnerTubeClient(out var mockTransport);
        var root = JsonDocument.Parse("""
        {
          "contents": {
            "twoColumnWatchNextResults": {
              "results": {
                "results": {
                  "contents": [
                    { "videoPrimaryInfoRenderer": { "dateText": { "simpleText": "Sep 1, 2026" } } }
                  ]
                }
              }
            }
          }
        }
        """).RootElement;
        mockTransport.Setup(t => t.SendNextAsync(
            It.IsAny<string>(), It.IsAny<string>(), It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(root);

        var uploadDate = await client.GetVideoUploadDateAsync("abc12345678");

        Assert.Equal("Sep 1, 2026", uploadDate);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 6. InnerTubeSearchParamsBuilder
    // ═══════════════════════════════════════════════════════════════════════

    [Fact]
    public void SearchParamsBuilder_Build_ReturnsNullForNullFilter()
    {
        var result = InnerTubeSearchParamsBuilder.Build(null);
        Assert.Null(result);
    }

    [Fact]
    public void SearchParamsBuilder_Build_ReturnsNullForEmptyFilter()
    {
        var result = InnerTubeSearchParamsBuilder.Build(new InnerTubeSearchFilter());
        Assert.Null(result);
    }

    [Fact]
    public void SearchParamsBuilder_Build_EncodesUploadDate()
    {
        var filter = new InnerTubeSearchFilter { UploadDate = "week" };
        var result = InnerTubeSearchParamsBuilder.Build(filter);

        Assert.NotNull(result);
        Assert.NotEmpty(result);
        var decoded = Convert.FromBase64String(result);
        Assert.True(decoded.Length > 0);
    }

    [Fact]
    public void SearchParamsBuilder_Build_EncodesDuration()
    {
        var filter = new InnerTubeSearchFilter { Duration = "short" };
        var result = InnerTubeSearchParamsBuilder.Build(filter);

        Assert.NotNull(result);
        Assert.NotEmpty(result);
    }

    [Fact]
    public void SearchParamsBuilder_Build_EncodesType()
    {
        var filter = new InnerTubeSearchFilter { Type = "video" };
        var result = InnerTubeSearchParamsBuilder.Build(filter);

        Assert.NotNull(result);
    }

    [Fact]
    public void SearchParamsBuilder_Build_EncodesSortBy()
    {
        var filter = new InnerTubeSearchFilter { SortBy = "view_count" };
        var result = InnerTubeSearchParamsBuilder.Build(filter);

        Assert.NotNull(result);
    }

    [Fact]
    public void SearchParamsBuilder_Build_EncodesFeatures()
    {
        var filter = new InnerTubeSearchFilter { Features = "creative_commons" };
        var result = InnerTubeSearchParamsBuilder.Build(filter);

        Assert.NotNull(result);
    }

    [Fact]
    public void SearchParamsBuilder_Build_EncodesMultipleFilters()
    {
        var filter = new InnerTubeSearchFilter
        {
            UploadDate = "month",
            Duration = "short",
            Type = "video",
            SortBy = "upload_date",
            Features = "4k"
        };
        var result = InnerTubeSearchParamsBuilder.Build(filter);

        Assert.NotNull(result);
    }

    [Theory]
    [InlineData(1, "EgQIAhAB")]
    [InlineData(7, "EgQIAxAB")]
    [InlineData(30, "EgQIBBAB")]
    [InlineData(365, "EgQIBRAB")]
    [InlineData(0, null)]
    [InlineData(400, null)]
    public void SearchParamsBuilder_BuildQuick_ReturnsCorrectBase64(int daysBack, string? expected)
    {
        var result = InnerTubeSearchParamsBuilder.BuildQuick(daysBack);
        Assert.Equal(expected, result);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 7. InnerTubeClient — New method guard clauses
    // ═══════════════════════════════════════════════════════════════════════

    [Fact]
    public async Task InnerTubeClient_GetVideoHeatmapAsync_ReturnsEmptyForBlankId()
    {
        var client = CreateInnerTubeClient(out _);
        var result = await client.GetVideoHeatmapAsync("");
        Assert.Empty(result);
    }

    [Fact]
    public async Task InnerTubeClient_GetVideoChaptersAsync_ReturnsEmptyForBlankId()
    {
        var client = CreateInnerTubeClient(out _);
        var result = await client.GetVideoChaptersAsync("");
        Assert.Empty(result);
    }

    [Fact]
    public async Task InnerTubeClient_GetWordTimestampsAsync_ReturnsEmptyForBlankId()
    {
        var client = CreateInnerTubeClient(out _);
        var result = await client.GetWordTimestampsAsync("");
        Assert.Empty(result);
    }

    [Fact]
    public async Task InnerTubeClient_GetCommentsDetailedAsync_ReturnsEmptyForBlankId()
    {
        var client = CreateInnerTubeClient(out _);
        var result = await client.GetCommentsDetailedAsync("");
        Assert.Empty(result);
    }

    [Fact]
    public async Task InnerTubeClient_SearchVideosFilteredAsync_ReturnsEmptyForBlankQuery()
    {
        var client = CreateInnerTubeClient(out _);
        var result = await client.SearchVideosFilteredAsync("");
        Assert.Empty(result);
    }

    [Fact]
    public async Task InnerTubeClient_GetChannelStatsAsync_ReturnsEmptyForInvalidPrefix()
    {
        var client = CreateInnerTubeClient(out _);
        var result = await client.GetChannelStatsAsync("not_a_channel");
        Assert.Equal(0, result.SubscriberCount);
    }

    [Fact]
    public async Task InnerTubeClient_GetChannelRecentUploadsAsync_ReturnsEmptyForInvalidPrefix()
    {
        var client = CreateInnerTubeClient(out _);
        var result = await client.GetChannelRecentUploadsAsync("not_a_channel");
        Assert.Empty(result);
    }

    [Fact]
    public async Task InnerTubeClient_GetChannelRecentUploadsAsync_ParsesLockupViewModel()
    {
        var client = CreateInnerTubeClient(out var mockTransport);
        var root = JsonDocument.Parse("""
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
                                "lockupViewModel": {
                                  "contentId": "q2cg1gEYWJQ",
                                  "contentType": "LOCKUP_CONTENT_TYPE_VIDEO",
                                  "metadata": {
                                    "lockupMetadataViewModel": {
                                      "title": { "content": "Test Channel Video" },
                                      "metadata": {
                                        "contentMetadataViewModel": {
                                          "metadataRows": [
                                            { "metadataParts": [ { "text": { "content": "The Diary Of A CEO" } } ] },
                                            { "metadataParts": [ { "text": { "content": "1.4M views" } }, { "text": { "content": "3 days ago" } } ] }
                                          ]
                                        }
                                      }
                                    }
                                  },
                                  "contentImage": {
                                    "thumbnailViewModel": {
                                      "image": { "sources": [ { "url": "https://i.ytimg.com/vi/q2cg1gEYWJQ/hq720.jpg" } ] },
                                      "overlays": [
                                        {
                                          "thumbnailBottomOverlayViewModel": {
                                            "badges": [ { "thumbnailBadgeViewModel": { "text": "2:26:26" } } ]
                                          }
                                        }
                                      ]
                                    }
                                  }
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
            It.IsAny<string>(), It.IsAny<string>(), It.IsAny<string>(),
            It.IsAny<CancellationToken>(), It.IsAny<string?>()))
            .ReturnsAsync(root);

        var uploads = await client.GetChannelRecentUploadsAsync("UCGq-a57w-aPwyi3pW7XLiHw", 10, "en");

        Assert.Single(uploads);
        Assert.Equal("q2cg1gEYWJQ", uploads[0].VideoId);
        Assert.Equal("Test Channel Video", uploads[0].Title);
        Assert.Equal(1_400_000, uploads[0].ViewCount);
        Assert.Equal("3 days ago", uploads[0].PublishedText);
        Assert.Equal(8786, uploads[0].DurationSeconds);
        Assert.Equal("https://i.ytimg.com/vi/q2cg1gEYWJQ/hq720.jpg", uploads[0].ThumbnailUrl);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 8. InnerTubeClient — SearchVideosFilteredAsync
    // ═══════════════════════════════════════════════════════════════════════

    [Fact]
    public async Task InnerTubeClient_SearchVideosFilteredAsync_CallsTransportWithSearchParams()
    {
        var client = CreateInnerTubeClient(out var mockTransport);
        var emptyRoot = JsonDocument.Parse("""{ "contents": {} }""").RootElement;
        mockTransport.Setup(t => t.SendSearchAsync(
            It.IsAny<string>(), It.IsAny<string>(), It.IsAny<string>(),
            It.IsAny<string?>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(emptyRoot);
        var filter = new InnerTubeSearchFilter { UploadDate = "week", Type = "video" };

        await client.SearchVideosFilteredAsync("test query", filter, 10, "en");

        mockTransport.Verify(t => t.SendSearchAsync(
            "test query", "en", It.IsAny<string>(),
            It.Is<string?>(p => p != null), It.IsAny<CancellationToken>()), Times.Once);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 9. InnerTubeClient — GetVideoHeatmapAsync
    // ═══════════════════════════════════════════════════════════════════════

    [Fact]
    public async Task InnerTubeClient_GetVideoHeatmapAsync_ReturnsParsedHeatmap()
    {
        var client = CreateInnerTubeClient(out var mockTransport);
        var root = JsonDocument.Parse("""
        {
          "playerHeatmapRenderer": {
            "heatmap": [
              { "startMillis": "0", "endMillis": "5000", "intensity": "0.9" },
              { "startMillis": "5000", "endMillis": "10000", "intensity": "0.6" }
            ]
          }
        }
        """).RootElement;
        mockTransport.Setup(t => t.SendNextAsync(
            It.IsAny<string>(), It.IsAny<string>(), It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(root);
        var heatmap = await client.GetVideoHeatmapAsync("testVid123");

        Assert.Equal(2, heatmap.Count);
        Assert.Equal(0.0, heatmap[0].StartSeconds);
        Assert.Equal(5.0, heatmap[0].EndSeconds);
        Assert.Equal(0.9, heatmap[0].Intensity, 1);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 10. InnerTubeClient — GetVideoChaptersAsync
    // ═══════════════════════════════════════════════════════════════════════

    [Fact]
    public async Task InnerTubeClient_GetVideoChaptersAsync_ReturnsChapters()
    {
        var client = CreateInnerTubeClient(out var mockTransport);
        var root = JsonDocument.Parse("""
        {
          "contents": {
            "twoColumnWatchNextResults": {
              "results": {
                "results": {
                  "contents": [
                    {
                      "chapteredPlayerBarRenderer": {
                        "chapters": [
                          {
                            "chapterRenderer": {
                              "title": { "simpleText": "Chapter 1" },
                              "timeRangeStartMillis": 0,
                              "thumbnail": { "thumbnails": [] }
                            }
                          },
                          {
                            "chapterRenderer": {
                              "title": { "simpleText": "Chapter 2" },
                              "timeRangeStartMillis": 120000,
                              "thumbnail": { "thumbnails": [] }
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
        """).RootElement;
        mockTransport.Setup(t => t.SendNextAsync(
            It.IsAny<string>(), It.IsAny<string>(), It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(root);
        var chapters = await client.GetVideoChaptersAsync("chVid123");

        Assert.Equal(2, chapters.Count);
        Assert.Equal("Chapter 1", chapters[0].Title);
        Assert.Equal(0, chapters[0].StartSeconds);
        Assert.Equal(120, chapters[0].EndSeconds);
        Assert.Equal("Chapter 2", chapters[1].Title);
        Assert.Equal(120, chapters[1].StartSeconds);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 11. InnerTubeClient — GetWordTimestampsAsync
    // ═══════════════════════════════════════════════════════════════════════

    [Fact]
    public async Task InnerTubeClient_GetWordTimestampsAsync_ReturnsWords()
    {
        var client = CreateInnerTubeClient(out var mockTransport);
        var root = JsonDocument.Parse("""
        {
          "videoDetails": {
            "transcriptBodyRenderer": {
              "cueGroups": [
                {
                  "transcriptCueGroupRenderer": {
                    "cues": [
                      {
                        "transcriptCueRenderer": {
                          "startOffsetMs": "100",
                          "durationMs": "400",
                          "cue": { "simpleText": "First" }
                        }
                      },
                      {
                        "transcriptCueRenderer": {
                          "startOffsetMs": "500",
                          "durationMs": "300",
                          "cue": { "simpleText": "word" }
                        }
                      }
                    ]
                  }
                }
              ]
            }
          }
        }
        """).RootElement;
        mockTransport.Setup(t => t.SendPlayerAsync(
            It.IsAny<string>(), It.IsAny<InnerTubeClientType>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(root);
        var words = await client.GetWordTimestampsAsync("tsVid123");

        Assert.Equal(2, words.Count);
        Assert.Equal("First", words[0].Word);
        Assert.Equal(100.0, words[0].StartMs);
        Assert.Equal(500.0, words[0].EndMs);
        Assert.Equal("word", words[1].Word);
        Assert.Equal(500.0, words[1].StartMs);
        Assert.Equal(800.0, words[1].EndMs);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 12. InnerTubeClient — GetCommentsDetailedAsync
    // ═══════════════════════════════════════════════════════════════════════

    [Fact]
    public async Task InnerTubeClient_GetCommentsDetailedAsync_FetchesAndPaginates()
    {
        var client = CreateInnerTubeClient(out var mockTransport);

        var initialRoot = JsonDocument.Parse("""
        {
          "contents": {
            "twoColumnWatchNextResults": {
              "results": {
                "results": {
                  "contents": [
                    {
                      "itemSectionRenderer": {
                        "contents": [
                          {
                            "continuationItemRenderer": {
                              "continuationEndpoint": {
                                "continuationCommand": {
                                  "token": "CONT_TOKEN_123"
                                }
                              }
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
        """).RootElement;

        var continuationRoot = JsonDocument.Parse("""
        {
          "onResponseReceivedEndpoints": [
            {
              "reloadContinuationItemsCommand": {
                "continuationItems": [
                  {
                    "commentThreadRenderer": {
                      "comment": {
                        "commentRenderer": {
                          "authorText": { "simpleText": "User1" },
                          "authorEndpoint": { "browseEndpoint": { "browseId": "UC001" } },
                          "commentId": "c1",
                          "contentText": { "runs": [{ "text": "First comment" }] },
                          "publishedTimeText": { "simpleText": "1h ago" },
                          "voteCount": { "simpleText": "10" }
                        }
                      }
                    }
                  },
                  {
                    "commentThreadRenderer": {
                      "comment": {
                        "commentRenderer": {
                          "authorText": { "simpleText": "User2" },
                          "authorEndpoint": { "browseEndpoint": { "browseId": "UC002" } },
                          "commentId": "c2",
                          "contentText": { "runs": [{ "text": "Second comment" }] },
                          "publishedTimeText": { "simpleText": "2h ago" },
                          "voteCount": { "simpleText": "5" }
                        }
                      }
                    }
                  }
                ]
              }
            }
          ]
        }
        """).RootElement;

        mockTransport.Setup(t => t.SendNextAsync(
            It.IsAny<string>(), It.IsAny<string>(), It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(initialRoot);
        mockTransport.Setup(t => t.SendNextAsync(
            It.IsAny<string?>(), It.IsAny<string>(), It.IsAny<string>(), It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(continuationRoot);

        var comments = await client.GetCommentsDetailedAsync("commVid123", 50);

        Assert.Equal(2, comments.Count);
        Assert.Equal("User1", comments[0].AuthorName);
        Assert.Equal("First comment", comments[0].Text);
        Assert.Equal(10, comments[0].LikeCount);
        Assert.Equal("User2", comments[1].AuthorName);
        Assert.Equal("Second comment", comments[1].Text);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 13. InnerTubeClient — GetChannelStatsAsync
    // ═══════════════════════════════════════════════════════════════════════

    [Fact]
    public async Task InnerTubeClient_GetChannelStatsAsync_ReturnsParsedStats()
    {
        var client = CreateInnerTubeClient(out var mockTransport);
        var root = JsonDocument.Parse("""
        {
          "header": {
            "c4TabbedHeaderRenderer": {
              "subscriberCountText": { "simpleText": "1.5M subscribers" },
              "videosCountText": { "simpleText": "342 videos" }
            }
          },
          "metadata": {
            "channelMetadataRenderer": {
              "description": "Channel about tech",
              "viewCount": "123456789"
            }
          }
        }
        """).RootElement;
        mockTransport.Setup(t => t.SendBrowseAsync(
            It.IsAny<string>(), It.IsAny<string>(), It.IsAny<string>(), It.IsAny<CancellationToken>(), It.IsAny<string?>()))
            .ReturnsAsync(root);
        var stats = await client.GetChannelStatsAsync("UC1234567890");

        Assert.Equal(1500000, stats.SubscriberCount);
        Assert.Equal(123456789, stats.TotalViewCount);
        Assert.Equal("Channel about tech", stats.Description);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 14. InnerTubeMetadataScraper — New methods
    // ═══════════════════════════════════════════════════════════════════════

    [Fact]
    public async Task Scraper_SearchVideosFilteredAsync_DelegatesToInnerTube()
    {
        var mockClient = new Mock<IInnerTubeClient>();
        mockClient.Setup(c => c.SearchVideosFilteredAsync(
            It.IsAny<string>(), It.IsAny<InnerTubeSearchFilter?>(),
            It.IsAny<int>(), It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new List<InnerTubeVideoItem>
            {
                new("v1", "Title1", "Ch1", "UC1", 1000, 300, false, "1 day ago", "url1", "thumb1")
            });

        var scraper = CreateScraper(mockClient);
        var filter = new YouTubeSearchFilter { UploadDate = "week" };
        var results = await scraper.SearchVideosFilteredAsync("test", filter, 10, "en");

        Assert.Single(results);
        Assert.Equal("v1", results[0].VideoId);
    }

    [Fact]
    public async Task Scraper_GetVideoChaptersAsync_DelegatesToInnerTube()
    {
        var mockClient = new Mock<IInnerTubeClient>();
        mockClient.Setup(c => c.GetVideoChaptersAsync("ch123", It.IsAny<CancellationToken>()))
            .ReturnsAsync(new List<InnerTubeVideoChapter>
            {
                new(0, 60, "Intro", ""),
                new(60, 120, "Body", "")
            });

        var scraper = CreateScraper(mockClient);
        var chapters = await scraper.GetVideoChaptersAsync("ch123");

        Assert.Equal(2, chapters.Count);
        Assert.Equal("Intro", chapters[0].Title);
        Assert.Equal(0, chapters[0].StartSeconds);
        Assert.Equal(60, chapters[0].EndSeconds);
    }

    [Fact]
    public async Task Scraper_GetVideoHeatmapAsync_DelegatesToInnerTube()
    {
        var mockClient = new Mock<IInnerTubeClient>();
        mockClient.Setup(c => c.GetVideoHeatmapAsync("hm123", It.IsAny<CancellationToken>()))
            .ReturnsAsync(new List<InnerTubeHeatmapPoint>
            {
                new(0, 5, 0.95),
                new(5, 10, 0.7)
            });

        var scraper = CreateScraper(mockClient);
        var heatmap = await scraper.GetVideoHeatmapAsync("hm123");

        Assert.Equal(2, heatmap.Count);
        Assert.Equal(0.95, heatmap[0].Intensity, 2);
    }

    [Fact]
    public async Task Scraper_GetWordTimestampsAsync_DelegatesToInnerTube()
    {
        var mockClient = new Mock<IInnerTubeClient>();
        mockClient.Setup(c => c.GetWordTimestampsAsync("wt123", It.IsAny<CancellationToken>()))
            .ReturnsAsync(new List<InnerTubeWordTimestamp>
            {
                new(0, 500, "Hello"),
                new(500, 1000, "world")
            });

        var scraper = CreateScraper(mockClient);
        var words = await scraper.GetWordTimestampsAsync("wt123");

        Assert.Equal(2, words.Count);
        Assert.Equal("Hello", words[0].Word);
        Assert.Equal("world", words[1].Word);
    }

    [Fact]
    public async Task Scraper_ScrapeCommentsDetailedAsync_DelegatesToInnerTube()
    {
        var mockClient = new Mock<IInnerTubeClient>();
        mockClient.Setup(c => c.GetCommentsDetailedAsync("cd123", 50, It.IsAny<CancellationToken>()))
            .ReturnsAsync(new List<InnerTubeComment>
            {
                new("User1", "UC1", "Great!", 10, "1h ago", "c1"),
                new("User2", "UC2", "Nice!", 5, "2h ago", "c2")
            });

        var scraper = CreateScraper(mockClient);
        var comments = await scraper.ScrapeCommentsDetailedAsync("cd123", 50);

        Assert.Equal(2, comments.Count);
        Assert.Equal("User1", comments[0].AuthorName);
        Assert.Equal("Great!", comments[0].Text);
        Assert.Equal(10, comments[0].LikeCount);
    }

    [Fact]
    public async Task Scraper_GetChannelStatsAsync_DelegatesToInnerTube()
    {
        var mockClient = new Mock<IInnerTubeClient>();
        mockClient.Setup(c => c.GetChannelStatsAsync("UCabc123", It.IsAny<CancellationToken>()))
            .ReturnsAsync(new InnerTubeChannelStats(500000, 10000000, 100, "Tech channel"));

        var scraper = CreateScraper(mockClient);
        var stats = await scraper.GetChannelStatsAsync("UCabc123");

        Assert.Equal(500000, stats.SubscriberCount);
        Assert.Equal(10000000, stats.TotalViewCount);
        Assert.Equal(100, stats.VideoCount);
        Assert.Equal("Tech channel", stats.Description);
    }

    [Fact]
    public async Task Scraper_GetChannelRecentUploadsAsync_DelegatesToInnerTube()
    {
        var mockClient = new Mock<IInnerTubeClient>();
        mockClient.Setup(c => c.GetChannelRecentUploadsAsync("UCabc123", 10, "en", It.IsAny<CancellationToken>()))
            .ReturnsAsync(new List<InnerTubeChannelUpload>
            {
                new("v1", "Upload 1", "thumb1", 5000, "1 day ago", 300),
                new("v2", "Upload 2", "thumb2", 3000, "2 days ago", 180)
            });

        var scraper = CreateScraper(mockClient);
        var uploads = await scraper.GetChannelRecentUploadsAsync("UCabc123", 10, "en");

        Assert.Equal(2, uploads.Count);
        Assert.Equal("v1", uploads[0].VideoId);
        Assert.Equal("Upload 1", uploads[0].Title);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 15. YouTubeClient Facade
    // ═══════════════════════════════════════════════════════════════════════

    [Fact]
    public async Task YouTubeClient_Facade_SearchFilteredAsync_DelegatesToMetadata()
    {
        var mockScraper = new Mock<IYouTubeMetadataScraper>();
        mockScraper.Setup(c => c.SearchVideosFilteredAsync(
            It.IsAny<string>(), It.IsAny<YouTubeSearchFilter?>(),
            It.IsAny<int>(), It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new List<YouTubeVideoMetadata>
            {
                new() { VideoId = "sf1", Title = "Filtered Video" }
            });

        var mockDownloader = new Mock<IYouTubeDownloader>();
        var client = new Integrations.YouTube.YouTubeClient(mockScraper.Object, mockDownloader.Object);

        var results = await client.SearchFilteredAsync("test", new YouTubeSearchFilter { Type = "video" });

        Assert.Single(results);
        Assert.Equal("sf1", results[0].VideoId);
    }

    [Fact]
    public async Task YouTubeClient_Facade_GetChaptersAsync_DelegatesToMetadata()
    {
        var mockScraper = new Mock<IYouTubeMetadataScraper>();
        mockScraper.Setup(c => c.GetVideoChaptersAsync("ch456", It.IsAny<CancellationToken>()))
            .ReturnsAsync(new List<YouTubeVideoChapter>
            {
                new(0, 30, "Intro", "thumb1"),
                new(30, 90, "Main", "thumb2")
            });

        var mockDownloader = new Mock<IYouTubeDownloader>();
        var client = new Integrations.YouTube.YouTubeClient(mockScraper.Object, mockDownloader.Object);

        var chapters = await client.GetChaptersAsync("ch456");

        Assert.Equal(2, chapters.Count);
        Assert.Equal("Intro", chapters[0].Title);
    }

    [Fact]
    public async Task YouTubeClient_Facade_GetHeatmapAsync_DelegatesToMetadata()
    {
        var mockScraper = new Mock<IYouTubeMetadataScraper>();
        mockScraper.Setup(c => c.GetVideoHeatmapAsync("hm456", It.IsAny<CancellationToken>()))
            .ReturnsAsync(new List<YouTubeHeatmapPoint>
            {
                new(0, 5, 0.9),
                new(5, 10, 0.6)
            });

        var mockDownloader = new Mock<IYouTubeDownloader>();
        var client = new Integrations.YouTube.YouTubeClient(mockScraper.Object, mockDownloader.Object);

        var heatmap = await client.GetHeatmapAsync("hm456");

        Assert.Equal(2, heatmap.Count);
        Assert.Equal(0.9, heatmap[0].Intensity, 1);
    }

    [Fact]
    public async Task YouTubeClient_Facade_GetWordTimestampsAsync_DelegatesToMetadata()
    {
        var mockScraper = new Mock<IYouTubeMetadataScraper>();
        mockScraper.Setup(c => c.GetWordTimestampsAsync("wt456", It.IsAny<CancellationToken>()))
            .ReturnsAsync(new List<YouTubeWordTimestamp>
            {
                new(0, 500, "Hello"),
                new(500, 1000, "world")
            });

        var mockDownloader = new Mock<IYouTubeDownloader>();
        var client = new Integrations.YouTube.YouTubeClient(mockScraper.Object, mockDownloader.Object);

        var words = await client.GetWordTimestampsAsync("wt456");

        Assert.Equal(2, words.Count);
        Assert.Equal("Hello", words[0].Word);
    }

    [Fact]
    public async Task YouTubeClient_Facade_GetCommentsDetailedAsync_DelegatesToMetadata()
    {
        var mockScraper = new Mock<IYouTubeMetadataScraper>();
        mockScraper.Setup(c => c.ScrapeCommentsDetailedAsync("cd456", 50, It.IsAny<CancellationToken>()))
            .ReturnsAsync(new List<YouTubeCommentItem>
            {
                new("User1", "UC1", "Comment text", 10, "1h ago", "c1")
            });

        var mockDownloader = new Mock<IYouTubeDownloader>();
        var client = new Integrations.YouTube.YouTubeClient(mockScraper.Object, mockDownloader.Object);

        var comments = await client.GetCommentsDetailedAsync("cd456");

        Assert.Single(comments);
        Assert.Equal("User1", comments[0].AuthorName);
    }

    [Fact]
    public async Task YouTubeClient_Facade_GetChannelStatsAsync_DelegatesToMetadata()
    {
        var mockScraper = new Mock<IYouTubeMetadataScraper>();
        mockScraper.Setup(c => c.GetChannelStatsAsync("UCnew123", It.IsAny<CancellationToken>()))
            .ReturnsAsync(new YouTubeChannelStats(100000, 5000000, 50, "My channel"));

        var mockDownloader = new Mock<IYouTubeDownloader>();
        var client = new Integrations.YouTube.YouTubeClient(mockScraper.Object, mockDownloader.Object);

        var stats = await client.GetChannelStatsAsync("UCnew123");

        Assert.Equal(100000, stats.SubscriberCount);
        Assert.Equal(5000000, stats.TotalViewCount);
    }

    [Fact]
    public async Task YouTubeClient_Facade_GetChannelRecentUploadsAsync_DelegatesToMetadata()
    {
        var mockScraper = new Mock<IYouTubeMetadataScraper>();
        mockScraper.Setup(c => c.GetChannelRecentUploadsAsync("UCnew123", 10, "en", It.IsAny<CancellationToken>()))
            .ReturnsAsync(new List<YouTubeChannelUpload>
            {
                new("vid1", "Upload 1", "t1", 1000, "1 day ago", 120)
            });

        var mockDownloader = new Mock<IYouTubeDownloader>();
        var client = new Integrations.YouTube.YouTubeClient(mockScraper.Object, mockDownloader.Object);

        var uploads = await client.GetChannelRecentUploadsAsync("UCnew123", 10, "en");

        Assert.Single(uploads);
        Assert.Equal("vid1", uploads[0].VideoId);
    }
}
