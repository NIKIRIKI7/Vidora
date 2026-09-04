using Integrations.YouTube.Config;
using Integrations.YouTube.Contracts;
using Integrations.YouTube.Downloader;
using Integrations.YouTube.Exceptions;
using Integrations.YouTube.Scraper;
using Kernel.Platform.FileSystem;
using Kernel.Platform.Process;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Xunit;

namespace Kernel.Tests;

public sealed class YouTubeIntegrationTests : IDisposable
{
    private readonly string _testTempDir;
    private readonly string _dummyScriptPath;
    private readonly IOptions<YouTubeOptions> _options;
    private readonly PathResolver _pathResolver;

    public YouTubeIntegrationTests()
    {
        // Изолированная временная песочница в %TEMP%
        _testTempDir = Path.Combine(Path.GetTempPath(), "vidora_yt_test_" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(_testTempDir);

        _dummyScriptPath = Path.Combine(_testTempDir, "yt_metadata.py");
        File.WriteAllText(_dummyScriptPath, "#!/usr/bin/env python3\n# dummy wrapper for tests");

        _options = Options.Create(new YouTubeOptions
        {
            YtMetadataScriptPath = _dummyScriptPath,
            PythonExecutablePath = OperatingSystem.IsWindows() ? "python.exe" : "python3",
            YtDlpExecutablePath = OperatingSystem.IsWindows() ? "yt-dlp.exe" : "yt-dlp",
            DownloadDirectory = Path.Combine(_testTempDir, "downloads")
        });

        _pathResolver = new PathResolver(NullLogger<PathResolver>.Instance, [_testTempDir]);
    }

    [Fact]
    public async Task YtScrape_ValidJsonOutput_ShouldParseVideoMetadataCorrectly()
    {
        var fakeOutput = """
        {
          "status": "ok",
          "video_id": "jNQXAC9IVRw",
          "title": "Me at the zoo",
          "description": "The first video on YouTube.",
          "channel_title": "jawed",
          "channel_id": "UC4QobU6ST3648RPCrMaS5Ig",
          "view_count": 310000000,
          "length_seconds": 19,
          "upload_date": "2005-04-24",
          "keywords": ["first video", "zoo"],
          "thumbnail_url": "https://i.ytimg.com/vi/jNQXAC9IVRw/hqdefault.jpg"
        }
        """;

        var supervisor = new FakeProcessSupervisor(new ProcessExecutionResult(0, fakeOutput, ""));
        var scraper = new YtScrapeMetadataScraper(supervisor, _options, NullLogger<YtScrapeMetadataScraper>.Instance);

        var meta = await scraper.ScrapeVideoMetadataAsync("jNQXAC9IVRw");

        Assert.Equal("jNQXAC9IVRw", meta.VideoId);
        Assert.Equal("Me at the zoo", meta.Title);
        Assert.Equal("jawed", meta.ChannelTitle);
        Assert.Equal(310000000L, meta.ViewCount);
        Assert.Equal(TimeSpan.FromSeconds(19), meta.Duration);
        Assert.Equal(2, meta.Keywords.Count);
    }

    [Fact]
    public async Task YtScrape_ProcessFailure_ShouldThrowYouTubeScrapeException()
    {
        var fakeError = """{"status":"error","message":"Video unavailable"}""";
        var supervisor = new FakeProcessSupervisor(new ProcessExecutionResult(1, "", fakeError));
        var scraper = new YtScrapeMetadataScraper(supervisor, _options, NullLogger<YtScrapeMetadataScraper>.Instance);

        await Assert.ThrowsAsync<YouTubeScrapeException>(async () =>
        {
            await scraper.ScrapeVideoMetadataAsync("unavailable_id");
        });
    }

    [Fact]
    public async Task YtScrape_WhenCallerCancels_ShouldRethrowOperationCanceledExceptionDirectly()
    {
        var supervisor = new CancelingProcessSupervisor();
        var scraper = new YtScrapeMetadataScraper(supervisor, _options, NullLogger<YtScrapeMetadataScraper>.Instance);

        using var cts = new CancellationTokenSource();
        cts.Cancel(); // Имитируем отмену вызывающей стороной

        // Исключение не должно маскироваться в YouTubeScrapeException (502)
        await Assert.ThrowsAsync<OperationCanceledException>(async () =>
        {
            await scraper.ScrapeVideoMetadataAsync("any-id", cts.Token);
        });
    }

    [Fact]
    public async Task YtDlp_WhenCallerCancels_ShouldRethrowOperationCanceledExceptionDirectly()
    {
        var supervisor = new CancelingProcessSupervisor();
        var downloader = new YtDlpDownloader(supervisor, _pathResolver, _options, NullLogger<YtDlpDownloader>.Instance);

        using var cts = new CancellationTokenSource();
        cts.Cancel(); // Имитируем отмену вызывающей стороной

        // Исключение не должно маскироваться в YouTubeDownloadException (502)
        await Assert.ThrowsAsync<OperationCanceledException>(async () =>
        {
            await downloader.DownloadVideoAsync("any-id", cancellationToken: cts.Token);
        });
    }

    public void Dispose()
    {
        if (Directory.Exists(_testTempDir))
        {
            try { Directory.Delete(_testTempDir, true); } catch { }
        }
    }

    private sealed class FakeProcessSupervisor : IProcessSupervisor
    {
        private readonly ProcessExecutionResult _result;

        public FakeProcessSupervisor(ProcessExecutionResult result) => _result = result;

        public Task<ProcessExecutionResult> RunAsync(
            string fileName,
            string arguments,
            string? workingDirectory = null,
            IReadOnlyDictionary<string, string>? environmentVariables = null,
            Action<string>? onStdOut = null,
            Action<string>? onStdErr = null,
            CancellationToken cancellationToken = default)
        {
            cancellationToken.ThrowIfCancellationRequested();
            return Task.FromResult(_result);
        }

        public void TrackProcess(System.Diagnostics.Process process) { }
        public void Dispose() { }
    }

    private sealed class CancelingProcessSupervisor : IProcessSupervisor
    {
        public Task<ProcessExecutionResult> RunAsync(
            string fileName,
            string arguments,
            string? workingDirectory = null,
            IReadOnlyDictionary<string, string>? environmentVariables = null,
            Action<string>? onStdOut = null,
            Action<string>? onStdErr = null,
            CancellationToken cancellationToken = default)
        {
            cancellationToken.ThrowIfCancellationRequested();
            return Task.FromCanceled<ProcessExecutionResult>(cancellationToken);
        }

        public void TrackProcess(System.Diagnostics.Process process) { }
        public void Dispose() { }
    }
}
