using System.Diagnostics;
using Integrations.Whisper.Config;
using Integrations.Whisper.Native;
using Kernel.Platform.Config;
using Kernel.Platform.FileSystem;
using Kernel.Platform.Gpu;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Moq;
using SystemContext.Contracts;
using Voice.Domain.ValueObjects;
using Voice.Infrastructure.Alignment;
using Xunit;
using Xunit.Abstractions;

namespace Kernel.Tests;

public class WhisperBenchmarkTests : IDisposable
{
    private readonly ITestOutputHelper _output;
    private readonly string _testAudioPath;

    private static readonly string Backend2Root = Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "..", "..", "..", "..", ".."));
    private static readonly string DataStorage = Path.Combine(Backend2Root, "data_storage");

    public WhisperBenchmarkTests(ITestOutputHelper output)
    {
        _output = output;
        _testAudioPath = Path.Combine(Path.GetTempPath(), $"benchmark_whisper_{Guid.NewGuid():N}.wav");
        GenerateSyntheticWavFile(_testAudioPath, durationSeconds: 10.0);
    }

    [Fact]
    [Trait("Category", "Benchmark")]
    public async Task NativeWhisper_BenchmarkRTF_ShouldBeSignificantlyFasterThanRealtime()
    {
        var modelDir = FindModelDirectory();
        if (modelDir == null)
        {
            _output.WriteLine("SKIP: Whisper model not found. Run download-whisper-model.ps1 first.");
            _output.WriteLine($"Expected path: data_storage/ai-models/whisper/faster-whisper-small/");
            return;
        }

        _output.WriteLine($"Model found: {modelDir}");

        var options = new WhisperOptions
        {
            Model = new WhisperModelOptions
            {
                Name = "small",
                DirectoryPath = modelDir
            },
            Hardware = new WhisperHardwareOptions
            {
                Device = "cuda",
                ComputeType = "float16",
                CpuThreads = 4,
                AutoFallbackToCpuOnOom = true
            },
            Inference = new WhisperInferenceOptions
            {
                DefaultLanguage = "en",
                BeamSize = 1,
                WordTimestamps = true
            },
            MemoryManagement = new WhisperMemoryOptions
            {
                RetentionPolicy = "UnloadImmediately"
            }
        };

        var storageConfig = new AppStorageConfig
        {
            DataStorageDir = DataStorage,
            ModelsDir = "ai-models",
            ProjectsDir = "projects",
            TempDir = "temp",
            MusicDir = "music",
            ToolsDir = "tools",
            RemotionWorkspaceDir = "tools/remotion_workspace"
        };

        var pathResolver = new BenchmarkPathResolver();
        var gpuManager = new BenchmarkGpuManager();
        var settingRepoMock = new Mock<ISystemModule>();

        var provider = new WhisperAlignmentProvider(
            pathResolver,
            gpuManager,
            settingRepoMock.Object,
            Options.Create(options),
            Options.Create(storageConfig),
            new BenchmarkLogger<WhisperAlignmentProvider>());

        string testText = "This is a synthetic test phrase for verifying native audio alignment speed performance.";

        _output.WriteLine("=================================================");
        _output.WriteLine("[Whisper Native Benchmark - FasterWhisper.NET]");
        _output.WriteLine($"  Audio duration:  10.0 sec");
        _output.WriteLine($"  Test text:       \"{testText}\"");
        _output.WriteLine($"  Device:          {options.Hardware.Device} ({options.Hardware.ComputeType})");
        _output.WriteLine("=================================================");

        var sw = Stopwatch.StartNew();
        AlignmentData result;
        try
        {
            result = await provider.AlignAsync(_testAudioPath, testText, CancellationToken.None);
            sw.Stop();
        }
        catch (Exception ex)
        {
            _output.WriteLine($"ERROR during inference: {ex.Message}");
            if (ex.InnerException != null)
                _output.WriteLine($"  Inner: {ex.InnerException.Message}");
            throw;
        }

        double audioDurationSeconds = 10.0;
        double elapsedSeconds = sw.Elapsed.TotalSeconds;
        double rtf = elapsedSeconds / audioDurationSeconds;
        double speedMultiplier = audioDurationSeconds / elapsedSeconds;

        _output.WriteLine("=================================================");
        _output.WriteLine("[Whisper Benchmark Result]");
        _output.WriteLine($"  Audio duration:    {audioDurationSeconds:F1} sec");
        _output.WriteLine($"  Inference time:    {elapsedSeconds:F3} sec ({sw.ElapsedMilliseconds} ms)");
        _output.WriteLine($"  Real-Time Factor:  {rtf:F4}x");
        _output.WriteLine($"  Speed:             {speedMultiplier:F1}x faster than realtime");
        _output.WriteLine($"  Engine:            {result.AlignmentEngine}");
        _output.WriteLine($"  Words aligned:     {result.Words.Count}");
        _output.WriteLine($"  Total duration:    {result.TotalDurationMs} ms");
        _output.WriteLine("=================================================");

        if (result.Words.Count > 0)
        {
            _output.WriteLine("\nFirst 10 words:");
            foreach (var w in result.Words.Take(10))
            {
                _output.WriteLine($"  [{w.StartMs,5}-{w.EndMs,5}] ({w.Confidence:F2}) \"{w.Word}\"");
            }
        }

        Assert.NotNull(result);
        Assert.True(result.Words.Count > 0, "Result must contain word-level timestamps.");
        Assert.True(rtf < 0.7, $"RTF ({rtf:F4}) must be faster than realtime (RTF < 0.7). RTX 3050 warmup included.");
    }

    private static void GenerateSyntheticWavFile(string filePath, double durationSeconds)
    {
        int sampleRate = 16000;
        int numSamples = (int)(sampleRate * durationSeconds);
        short[] samples = new short[numSamples];

        for (int i = 0; i < numSamples; i++)
        {
            double t = (double)i / sampleRate;
            samples[i] = (short)(Math.Sin(2 * Math.PI * 440.0 * t) * 16000);
        }

        using var fs = new FileStream(filePath, FileMode.Create, FileAccess.Write);
        using var writer = new BinaryWriter(fs);

        writer.Write("RIFF"u8);
        writer.Write(36 + numSamples * 2);
        writer.Write("WAVE"u8);

        writer.Write("fmt "u8);
        writer.Write(16);
        writer.Write((short)1);
        writer.Write((short)1);
        writer.Write(sampleRate);
        writer.Write(sampleRate * 2);
        writer.Write((short)2);
        writer.Write((short)16);

        writer.Write("data"u8);
        writer.Write(numSamples * 2);
        foreach (var sample in samples)
        {
            writer.Write(sample);
        }
    }

    private static string? FindModelDirectory()
    {
        string[] candidates =
        [
            Path.Combine(DataStorage, "ai-models", "whisper", "faster-whisper-small"),
            Path.Combine(Backend2Root, "data_storage", "ai-models", "whisper", "faster-whisper-small"),
            Path.Combine(AppContext.BaseDirectory, "data_storage", "ai-models", "whisper", "faster-whisper-small"),
        ];

        foreach (var dir in candidates)
        {
            if (Directory.Exists(dir) && File.Exists(Path.Combine(dir, "model.bin")))
            {
                return dir;
            }
        }

        return null;
    }

    public void Dispose()
    {
        if (File.Exists(_testAudioPath))
        {
            try { File.Delete(_testAudioPath); } catch { }
        }
    }

    private sealed class BenchmarkLogger<T> : ILogger<T> where T : class
    {
        public IDisposable? BeginScope<TState>(TState state) where TState : notnull => null;
        public bool IsEnabled(LogLevel logLevel) => true;
        public void Log<TState>(LogLevel logLevel, EventId eventId, TState state, Exception? exception, Func<TState, Exception?, string> formatter)
        {
            Debug.WriteLine($"[{logLevel}] {formatter(state, exception)}");
        }
    }

    private sealed class BenchmarkPathResolver : IPathResolver
    {
        public string ResolveSafePath(string path, string? subRoot = null) => Path.GetFullPath(path);
        public bool IsSafePath(string path, string? subRoot = null) => true;
        public void RegisterAllowedRoot(string rootDirectory) { }
        public string SanitizeFileName(string fileName) => fileName;
    }

    private sealed class BenchmarkGpuManager : IGpuManager
    {
        public Task<IAsyncDisposable> AcquireGpuLockAsync(string contextName, CancellationToken ct = default)
        {
            return Task.FromResult<IAsyncDisposable>(new NoopDisposable());
        }
        public Task CleanMemoryAsync(CancellationToken ct = default) => Task.CompletedTask;
        public bool IsGpuAvailable() => false;

        private sealed class NoopDisposable : IAsyncDisposable
        {
            public ValueTask DisposeAsync() => ValueTask.CompletedTask;
        }
    }
}
