using System.Diagnostics;
using Integrations.Whisper.Audio;
using Integrations.Whisper.Config;
using Integrations.Whisper.Native;
using Kernel.Platform.Config;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Voice.Domain.ValueObjects;
using Voice.Infrastructure.Alignment;
using Xunit;

namespace Kernel.Tests;

public sealed class WhisperNativeIntegrationTests : IDisposable
{
    private static readonly string Backend2Root = Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "..", "..", "..", "..", ".."));
    private static readonly string DataStorage = Path.Combine(Backend2Root, "data_storage");

    private readonly List<string> _tempFiles = [];
    private readonly string _generatedMonoWav;
    private readonly string _generatedStereoWav;

    public WhisperNativeIntegrationTests()
    {
        _generatedMonoWav = CreateSyntheticWav(16000, channels: 1, durationSeconds: 2.0);
        _generatedStereoWav = CreateSyntheticWav(44100, channels: 2, durationSeconds: 1.5);
    }

    [Fact]
    public async Task WavAudioDecoder_ShouldDecodeSyntheticWavFiles()
    {
        var sw = Stopwatch.StartNew();
        var decodedMono = await WavAudioDecoder.DecodeToMono16kHzAsync(_generatedMonoWav);
        sw.Stop();

        Assert.Equal(16000, decodedMono.SampleRate);
        Assert.True(decodedMono.Samples.Length > 0, "Mono WAV must contain samples");
        Assert.InRange(decodedMono.Duration.TotalSeconds, 1.8, 2.2);
        Assert.True(decodedMono.Samples.Any(s => Math.Abs(s) > 0.01f), "Audio must contain non-zero wave data");
    }

    [Fact]
    public async Task WavAudioDecoder_ShouldHandleStereoToMono()
    {
        var decoded = await WavAudioDecoder.DecodeToMono16kHzAsync(_generatedStereoWav);

        Assert.Equal(16000, decoded.SampleRate);
        Assert.True(decoded.Samples.Length > 0, "Stereo WAV must produce samples after downmix");
        Assert.InRange(decoded.Duration.TotalSeconds, 1.3, 1.7);
        Assert.True(decoded.Samples.Any(s => Math.Abs(s) > 0.01f), "Stereo audio must contain non-zero wave data");

        var probeDuration = WavAudioDecoder.ProbeWavDuration(_generatedStereoWav);
        Assert.InRange(probeDuration, 1.3, 1.7);
    }

    [Fact]
    public async Task WhisperAlignmentProvider_ShouldRunFullPipeline()
    {
        var modelDir = FindModelDirectory();
        string expectedText = "Тестовая фраза для нативного выравнивания";

        var options = new WhisperOptions
        {
            Model = new WhisperModelOptions
            {
                DirectoryPath = modelDir ?? Path.Combine(DataStorage, "ai-models", "whisper", "faster-whisper-small"),
                Name = "small"
            },
            Hardware = new WhisperHardwareOptions
            {
                Device = "cpu",
                ComputeType = "int8"
            },
            Inference = new WhisperInferenceOptions { BeamSize = 1, WordTimestamps = true, DefaultLanguage = "ru" },
            MemoryManagement = new WhisperMemoryOptions { RetentionPolicy = "UnloadImmediately" }
        };

        var storageOptions = Options.Create(new AppStorageConfig
        {
            DataStorageDir = DataStorage,
            ModelsDir = "ai-models",
            ProjectsDir = "projects",
            TempDir = "temp",
            MusicDir = "music",
            ToolsDir = "tools",
            RemotionWorkspaceDir = "tools/remotion_workspace"
        });

        var whisperOptions = Options.Create(options);
        var logger = new TestLogger<WhisperAlignmentProvider>();
        var pathResolver = new FakePathResolver();
        var gpuManager = new FakeGpuManager();
        var settingRepo = new FakeSettingRepository();

        var provider = new WhisperAlignmentProvider(
            pathResolver, gpuManager, settingRepo,
            whisperOptions, storageOptions, logger);

        var result = await provider.AlignAsync(_generatedMonoWav, expectedText);

        Assert.NotNull(result);
        Assert.True(result.Words.Count > 0, "Words must be aligned or generated via proportional fallback");
        Assert.True(result.TotalDurationMs > 0);
    }

    private string CreateSyntheticWav(int sampleRate, short channels, double durationSeconds)
    {
        var filePath = Path.Combine(Path.GetTempPath(), $"whisper_test_{Guid.NewGuid():N}.wav");
        _tempFiles.Add(filePath);

        int sampleCount = (int)(sampleRate * durationSeconds);
        short bitsPerSample = 16;
        int byteRate = sampleRate * channels * (bitsPerSample / 8);
        short blockAlign = (short)(channels * (bitsPerSample / 8));
        int subChunk2Size = sampleCount * channels * (bitsPerSample / 8);

        using var fs = new FileStream(filePath, FileMode.Create, FileAccess.Write);
        using var writer = new BinaryWriter(fs);

        writer.Write("RIFF"u8);
        writer.Write(36 + subChunk2Size);
        writer.Write("WAVE"u8);
        writer.Write("fmt "u8);
        writer.Write(16);
        writer.Write((short)1); // PCM
        writer.Write(channels);
        writer.Write(sampleRate);
        writer.Write(byteRate);
        writer.Write(blockAlign);
        writer.Write(bitsPerSample);
        writer.Write("data"u8);
        writer.Write(subChunk2Size);

        for (int i = 0; i < sampleCount; i++)
        {
            double t = (double)i / sampleRate;
            short val = (short)(Math.Sin(2 * Math.PI * 440.0 * t) * 16000);
            for (int ch = 0; ch < channels; ch++)
            {
                writer.Write(val);
            }
        }

        return filePath;
    }

    private static string? FindModelDirectory()
    {
        string[] candidates =
        [
            Path.Combine(DataStorage, "ai-models", "whisper", "faster-whisper-small"),
            Path.Combine(Backend2Root, "data_storage", "ai-models", "whisper", "faster-whisper-small"),
            Path.Combine(AppContext.BaseDirectory, "data_storage", "ai-models", "whisper", "faster-whisper-small")
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
        foreach (var file in _tempFiles)
        {
            try { if (File.Exists(file)) File.Delete(file); } catch { }
        }
    }

    private sealed class TestLogger<T> : ILogger<T> where T : class
    {
        public IDisposable? BeginScope<TState>(TState state) where TState : notnull => null;
        public bool IsEnabled(LogLevel logLevel) => true;
        public void Log<TState>(LogLevel logLevel, EventId eventId, TState state, Exception? exception, Func<TState, Exception?, string> formatter)
        {
            var msg = formatter(state, exception);
            Debug.WriteLine($"[{logLevel}] {msg}");
        }
    }

    private sealed class FakePathResolver : Kernel.Platform.FileSystem.IPathResolver
    {
        public string ResolveSafePath(string path, string? subRoot = null) => Path.GetFullPath(path);
        public bool IsSafePath(string path, string? subRoot = null) => true;
        public void RegisterAllowedRoot(string rootDirectory) { }
        public string SanitizeFileName(string fileName) => fileName;
    }

    private sealed class FakeGpuManager : Kernel.Platform.Gpu.IGpuManager
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

    private sealed class FakeSettingRepository : SystemContext.Domain.Ports.ISystemSettingRepository
    {
        public Task<SystemContext.Domain.Entities.SystemSetting?> GetByKeyAsync(string key, CancellationToken ct = default)
            => Task.FromResult<SystemContext.Domain.Entities.SystemSetting?>(null);
        public Task<IReadOnlyList<SystemContext.Domain.Entities.SystemSetting>> GetAllAsync(CancellationToken ct = default)
            => Task.FromResult<IReadOnlyList<SystemContext.Domain.Entities.SystemSetting>>([]);
        public Task AddAsync(SystemContext.Domain.Entities.SystemSetting setting, CancellationToken ct = default) => Task.CompletedTask;
        public Task UpdateAsync(SystemContext.Domain.Entities.SystemSetting setting, CancellationToken ct = default) => Task.CompletedTask;
        public Task<bool> ExistsAsync(string key, CancellationToken ct = default) => Task.FromResult(false);
        public Task SaveChangesAsync(CancellationToken ct = default) => Task.CompletedTask;
    }
}