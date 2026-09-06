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

public sealed class WhisperNativeIntegrationTests
{
    private static readonly string Backend2Root = Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "..", "..", "..", "..", ".."));
    private static readonly string DataStorage = Path.Combine(Backend2Root, "data_storage");

    private static readonly string[] TestAudioFiles =
    [
        Path.Combine(Backend2Root, "ai-models", "CosyVoice", "asset", "cross_lingual_prompt.wav"),
        Path.Combine(Backend2Root, "ai-models", "CosyVoice", "asset", "zero_shot_prompt.wav"),
        Path.Combine(DataStorage, "temp", "voice", "tts-95b07de6631041599a7b79c1ad343f0d_raw.wav"),
        Path.Combine(DataStorage, "temp", "voice", "tts-b525587e70534458873f842afdb5bbfa_raw.wav"),
        Path.Combine(DataStorage, "temp", "voice", "tts-6866959b120d41dfaae78e4c0e179425_master.wav"),
    ];

    private static readonly string[] TestExpectedTexts =
    [
        "This is a cross lingual prompt for voice cloning.",
        "This is a zero shot prompt for voice synthesis.",
        "Добро пожаловать в мир создания видео.",
        "Сегодня мы рассмотрим как создать вирусный контент.",
        "Анализ трендов показывает рост вовлечённости аудитории.",
    ];

    [Fact]
    public void WavAudioDecoder_ShouldDecodeRealWavFiles()
    {
        var results = new List<(string File, DecodedAudio Audio)>();

        foreach (var audioPath in TestAudioFiles)
        {
            if (!File.Exists(audioPath))
            {
                Output($"SKIP: {Path.GetFileName(audioPath)} not found");
                continue;
            }

            Output($"--- Decoding: {Path.GetFileName(audioPath)} ({new FileInfo(audioPath).Length / 1024} KB) ---");

            var sw = Stopwatch.StartNew();
            var decoded = WavAudioDecoder.DecodeToMono16kHzAsync(audioPath).GetAwaiter().GetResult();
            sw.Stop();

            Output($"  SampleRate: {decoded.SampleRate} Hz");
            Output($"  Duration: {decoded.Duration.TotalSeconds:F2} sec");
            Output($"  Samples: {decoded.Samples.Length:N0}");
            Output($"  DecodeTime: {sw.ElapsedMilliseconds} ms");

            Assert.Equal(16000, decoded.SampleRate);
            Assert.True(decoded.Samples.Length > 0, "Must contain samples");
            Assert.True(decoded.Duration.TotalSeconds > 0.1, "Duration > 0.1 sec");

            bool hasNonZero = decoded.Samples.Any(s => Math.Abs(s) > 0.001);
            Assert.True(hasNonZero, "Audio must contain non-zero samples");

            float maxAmp = decoded.Samples.Max(s => Math.Abs(s));
            Output($"  MaxAmplitude: {maxAmp:F4}");

            results.Add((Path.GetFileName(audioPath), decoded));
        }

        Assert.True(results.Count > 0, "At least one file must be decoded");
        Output($"\n=== Total decoded: {results.Count} files ===\n");
    }

    [Fact]
    public void WavAudioDecoder_ShouldHandleStereoToMono()
    {
        var stereoFile = TestAudioFiles.FirstOrDefault(f => File.Exists(f));
        if (stereoFile == null)
        {
            Output("SKIP: No WAV files for stereo test");
            return;
        }

        var decoded = WavAudioDecoder.DecodeToMono16kHzAsync(stereoFile).GetAwaiter().GetResult();

        Output($"File: {Path.GetFileName(stereoFile)}");
        Output($"Result: mono {decoded.SampleRate} Hz, {decoded.Samples.Length} samples");

        Assert.Equal(16000, decoded.SampleRate);
    }

    [Fact]
    public async Task NativeWhisperModel_ShouldLoadAndAlignOnRealAudio()
    {
        var modelDir = FindModelDirectory();
        if (modelDir == null)
        {
            Output("SKIP: faster-whisper model directory not found. Run download-whisper-model.ps1.");
            Output($"Expected: data_storage/ai-models/whisper/faster-whisper-small/");
            return;
        }

        Output($"Model found: {modelDir}");
        Output($"Contents: {string.Join(", ", Directory.GetFiles(modelDir).Select(Path.GetFileName))}");

        var options = new WhisperOptions
        {
            Model = new WhisperModelOptions { DirectoryPath = modelDir, Name = "small" },
            Hardware = new WhisperHardwareOptions
            {
                Device = "cuda",
                ComputeType = "float16",
                CpuThreads = 2
            },
            Inference = new WhisperInferenceOptions { BeamSize = 1, WordTimestamps = true },
            MemoryManagement = new WhisperMemoryOptions { RetentionPolicy = "UnloadImmediately" }
        };

        var logger = new TestLogger<NativeWhisperModel>();
        using var model = new NativeWhisperModel(options, modelDir, logger);

        Output("\n--- Loading model ---");
        var loadSw = Stopwatch.StartNew();
        await model.EnsureLoadedAsync();
        loadSw.Stop();
        Output($"Model loaded in {loadSw.ElapsedMilliseconds} ms");

        var audioPath = TestAudioFiles.FirstOrDefault(f => File.Exists(f));
        if (audioPath == null)
        {
            Output("SKIP: No WAV files for inference");
            return;
        }

        var expectedText = TestExpectedTexts[Array.IndexOf(TestAudioFiles, audioPath)];
        Output($"\n--- Inference: {Path.GetFileName(audioPath)} ---");
        Output($"Expected text: \"{expectedText}\"");

        var result = await model.AlignAsync(audioPath, expectedText, "en");

        double rtf = result.TotalDurationMs > 0
            ? (result.InferenceElapsedMs / 1000.0) / (result.TotalDurationMs / 1000.0)
            : 0;

        Output($"\n--- Results ---");
        Output($"Words recognized: {result.Words.Count}");
        Output($"Total duration: {result.TotalDurationMs} ms");
        Output($"Inference time: {result.InferenceElapsedMs} ms");
        Output($"RTF: {rtf:F4}x ({(rtf > 0 ? 1.0 / rtf : 0):F1}x faster than realtime)");
        if (result.Words.Count > 0)
            Output($"Avg confidence: {result.Words.Average(w => w.Confidence):F2}");

        foreach (var w in result.Words.Take(10))
        {
            Output($"  [{w.StartMs,5}-{w.EndMs,5}] ({w.Confidence:F2}) \"{w.Word}\"");
        }
        if (result.Words.Count > 10)
            Output($"  ... and {result.Words.Count - 10} more words");

        Assert.True(result.Words.Count > 0, "Must recognize at least one word");
        Assert.All(result.Words, w => Assert.False(string.IsNullOrWhiteSpace(w.Word)));
        Assert.All(result.Words, w => Assert.True(w.StartMs >= 0));
        Assert.All(result.Words, w => Assert.True(w.EndMs >= w.StartMs));
    }

    [Fact]
    public async Task WhisperAlignmentProvider_ShouldRunFullPipeline()
    {
        var audioPath = TestAudioFiles.FirstOrDefault(f => File.Exists(f));
        if (audioPath == null)
        {
            Output("SKIP: No WAV files for full pipeline");
            return;
        }

        var modelDir = FindModelDirectory();
        var expectedText = TestExpectedTexts[Array.IndexOf(TestAudioFiles, audioPath)];

        Output($"=== Full Pipeline WhisperAlignmentProvider ===");
        Output($"Audio: {Path.GetFileName(audioPath)}");
        Output($"Text: \"{expectedText}\"");
        Output($"Model: {modelDir ?? "NOT FOUND (expecting FallbackProportional)"}");

        var options = new WhisperOptions
        {
            Model = new WhisperModelOptions
            {
                DirectoryPath = modelDir ?? Path.Combine(DataStorage, "ai-models", "whisper", "faster-whisper-small"),
                Name = "small"
            },
            Hardware = new WhisperHardwareOptions
            {
                Device = "cuda",
                ComputeType = "float16"
            },
            Inference = new WhisperInferenceOptions { BeamSize = 1, WordTimestamps = true, DefaultLanguage = "en" },
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
            ScriptsDir = "tools/scripts",
            RemotionWorkspaceDir = "tools/remotion_workspace",
            PythonVenvName = ".venv-voice"
        });

        var whisperOptions = Options.Create(options);
        var logger = new TestLogger<WhisperAlignmentProvider>();

        var pathResolver = new FakePathResolver();
        var gpuManager = new FakeGpuManager();
        var settingRepo = new FakeSettingRepository();

        var provider = new WhisperAlignmentProvider(
            pathResolver, gpuManager, settingRepo,
            whisperOptions, storageOptions, logger);

        var sw = Stopwatch.StartNew();
        AlignmentData result;
        try
        {
            result = await provider.AlignAsync(audioPath, expectedText);
            sw.Stop();
        }
        catch (Exception ex)
        {
            Output($"PIPELINE ERROR: {ex.Message}");
            if (ex.InnerException != null)
                Output($"  Inner: {ex.InnerException.Message}");
            throw;
        }

        Output($"\n--- Pipeline Result ---");
        Output($"Engine: {result.AlignmentEngine}");
        Output($"Words: {result.Words.Count}");
        Output($"Duration: {result.TotalDurationMs} ms");
        Output($"Time: {sw.ElapsedMilliseconds} ms");

        foreach (var w in result.Words.Take(8))
        {
            Output($"  [{w.StartMs,5}-{w.EndMs,5}] ({w.Confidence:F2}) \"{w.Word}\"");
        }

        Assert.NotNull(result);
        Assert.True(result.Words.Count > 0 || result.AlignmentEngine == "FallbackProportional",
            "Either words exist or Fallback fired");
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

    private static void Output(string message)
    {
        Console.WriteLine(message);
        Debug.WriteLine(message);
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
