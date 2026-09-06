using Integrations.YouTube.Config;
using Integrations.YouTube.Contracts;
using Integrations.YouTube.Exceptions;
using Integrations.YouTube.Innertube;
using Integrations.YouTube.Innertube.Config;
using Integrations.YouTube.Innertube.Contracts;
using Integrations.YouTube.Innertube.Resolving;
using Integrations.YouTube.Scraper;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Moq;
using Xunit;

namespace Kernel.Tests;

public sealed class YouTubeIntegrationTests : IDisposable
{
    private readonly Mock<IInnerTubeClient> _mockInnerTube = new();
    private readonly IYouTubeQueryResolver _queryResolver;
    private readonly HttpClient _httpClient = new();
    private readonly IOptions<YouTubeOptions> _options = Options.Create(new YouTubeOptions());

    public YouTubeIntegrationTests()
    {
        var innerTubeOptions = Options.Create(new InnerTubeOptions());
        _queryResolver = new YouTubeQueryResolver(innerTubeOptions, NullLogger<YouTubeQueryResolver>.Instance);
    }

    private InnerTubeMetadataScraper CreateScraper() =>
        new(
            _mockInnerTube.Object,
            _queryResolver,
            _httpClient,
            _options,
            NullLogger<InnerTubeMetadataScraper>.Instance);

    [Theory]
    [InlineData("https://www.youtube.com/watch?v=dQw4w9WgXcQ", "dQw4w9WgXcQ")]
    [InlineData("https://youtu.be/dQw4w9WgXcQ", "dQw4w9WgXcQ")]
    [InlineData("https://youtube.com/embed/dQw4w9WgXcQ", "dQw4w9WgXcQ")]
    [InlineData("dQw4w9WgXcQ", "dQw4w9WgXcQ")]
    public async Task ScrapeVideoMetadataAsync_VariousUrlFormats_ResolvedCorrectlyByQueryResolver(string inputUrl, string expectedId)
    {
        var item = new InnerTubeVideoItem(
            VideoId: expectedId,
            Title: "Never Gonna Give You Up",
            ChannelTitle: "Rick Astley",
            ChannelId: "UCuAXFkgsw1L7xaCfnd5JJOw",
            ViewCount: 1500000000L,
            DurationSeconds: 213,
            IsShort: false,
            PublishedText: "14 years ago",
            Url: $"https://youtu.be/{expectedId}",
            ThumbnailUrl: $"https://i.ytimg.com/vi/{expectedId}/hqdefault.jpg",
            Description: "Official music video");

        _mockInnerTube.Setup(c => c.GetVideoDetailsAsync(expectedId, It.IsAny<CancellationToken>()))
            .ReturnsAsync(item);
        _mockInnerTube.Setup(c => c.GetChannelSubscribersAsync("UCuAXFkgsw1L7xaCfnd5JJOw", It.IsAny<CancellationToken>()))
            .ReturnsAsync(4500000L);
        _mockInnerTube.Setup(c => c.GetCommentsAsync(expectedId, It.IsAny<int>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new List<string> { "Iconic song!", "Legendary meme" });

        var scraper = CreateScraper();
        var metadata = await scraper.ScrapeVideoMetadataAsync(inputUrl);

        Assert.Equal(expectedId, metadata.VideoId);
        Assert.Equal("Never Gonna Give You Up", metadata.Title);
        Assert.Equal("Rick Astley", metadata.ChannelTitle);
        Assert.Equal(1500000000L, metadata.ViewCount);
        Assert.Equal(TimeSpan.FromSeconds(213), metadata.Duration);
        Assert.Equal(4500000L, metadata.SubscriberCount);
        Assert.Equal(2, metadata.Comments.Count);
        Assert.Equal("Official music video", metadata.Description);
        _mockInnerTube.Verify(c => c.GetVideoDetailsAsync(expectedId, It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task SearchVideosAsync_ReturnsMappedCandidates()
    {
        var items = new List<InnerTubeVideoItem>
        {
            new("vid_1", "AI Trends 2026", "TechChannel", "UC1", 85000, 480, false, "2 days ago", "url1", "thumb1"),
            new("vid_2", "Remotion React Video", "MotionHub", "UC2", 12000, 180, true, "1 week ago", "url2", "thumb2")
        };

        _mockInnerTube.Setup(c => c.SearchVideosAsync("AI Video", It.IsAny<int>(), It.IsAny<int>(), It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(items);

        var scraper = CreateScraper();
        var results = await scraper.SearchVideosAsync("AI Video", maxResults: 10, daysBack: 30);

        Assert.Equal(2, results.Count);
        Assert.Equal("vid_1", results[0].VideoId);
        Assert.Equal("AI Trends 2026", results[0].Title);
        Assert.Equal(85000, results[0].ViewCount);
        Assert.Equal("vid_2", results[1].VideoId);
        Assert.NotNull(results[0].PublishedAt);
    }

    [Fact]
    public async Task GetRelatedVideosAsync_DelegatesToInnerTube()
    {
        var items = new List<InnerTubeVideoItem>
        {
            new("rel_abc1234", "Related Tech", "ChannelA", "UC_A", 5000, 120, false, "3 days ago", "url", "thumb")
        };

        _mockInnerTube.Setup(c => c.GetRelatedVideosAsync("src_a1b2c3d", 10, "ru", It.IsAny<CancellationToken>()))
            .ReturnsAsync(items);

        var scraper = CreateScraper();
        var related = await scraper.GetRelatedVideosAsync("https://youtu.be/src_a1b2c3d", 10, "ru");

        Assert.Single(related);
        Assert.Equal("rel_abc1234", related[0].VideoId);
        Assert.Equal("Related Tech", related[0].Title);
        _mockInnerTube.Verify(c => c.GetRelatedVideosAsync("src_a1b2c3d", 10, "ru", It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task ScrapeTranscriptAsync_ReturnsSubtitles()
    {
        _mockInnerTube.Setup(c => c.ExtractFastSubtitlesAsync("sub_a1b2c3d", It.IsAny<string[]?>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync("Hello and welcome to this video tutorial.");

        var scraper = CreateScraper();
        var transcript = await scraper.ScrapeTranscriptAsync("https://www.youtube.com/watch?v=sub_a1b2c3d");

        Assert.Equal("Hello and welcome to this video tutorial.", transcript);
        _mockInnerTube.Verify(c => c.ExtractFastSubtitlesAsync("sub_a1b2c3d", It.IsAny<string[]?>(), It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task ScrapeVideoMetadataAsync_NotFound_ThrowsYouTubeScrapeException()
    {
        _mockInnerTube.Setup(c => c.GetVideoDetailsAsync("missin_gvid", It.IsAny<CancellationToken>()))
            .ReturnsAsync((InnerTubeVideoItem?)null);

        var scraper = CreateScraper();
        await Assert.ThrowsAsync<YouTubeScrapeException>(async () =>
        {
            await scraper.ScrapeVideoMetadataAsync("missin_gvid");
        });
    }

    [Fact]
    public async Task ScrapeVideoMetadataAsync_WhenCancelled_RethrowsDirectly()
    {
        using var cts = new CancellationTokenSource();
        cts.Cancel();

        _mockInnerTube.Setup(c => c.GetVideoDetailsAsync(It.IsAny<string>(), cts.Token))
            .ThrowsAsync(new OperationCanceledException(cts.Token));

        var scraper = CreateScraper();
        await Assert.ThrowsAsync<OperationCanceledException>(async () =>
        {
            await scraper.ScrapeVideoMetadataAsync("anyid123456", cts.Token);
        });
    }

    public void Dispose()
    {
        _httpClient.Dispose();
    }
}
