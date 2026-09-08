using System.Diagnostics;
using Integrations.Whisper.Audio;
using Integrations.Whisper.Config;
using Integrations.Whisper.Native;
using Kernel.Platform.Config;
using Kernel.Platform.FileSystem;
using Kernel.Platform.Gpu;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using SystemContext.Domain.Ports;
using Voice.Domain;
using Voice.Domain.Ports;
using Voice.Domain.ValueObjects;

namespace Voice.Infrastructure.Alignment;

public sealed class WhisperAlignmentProvider : IForcedAlignmentProvider
{
    public AlignmentEngineType EngineType => AlignmentEngineType.Whisper;

    private readonly IPathResolver _pathResolver;
    private readonly IGpuManager _gpuManager;
    private readonly ISystemSettingRepository _settingRepo;
    private readonly WhisperOptions _whisperOptions;
    private readonly AppStorageConfig _storageConfig;
    private readonly ILogger<WhisperAlignmentProvider> _logger;

    public WhisperAlignmentProvider(
        IPathResolver pathResolver,
        IGpuManager gpuManager,
        ISystemSettingRepository settingRepo,
        IOptions<WhisperOptions> whisperOptions,
        IOptions<AppStorageConfig> storageConfig,
        ILogger<WhisperAlignmentProvider> logger)
    {
        _pathResolver = pathResolver;
        _gpuManager = gpuManager;
        _settingRepo = settingRepo;
        _whisperOptions = whisperOptions.Value;
        _storageConfig = storageConfig.Value;
        _logger = logger;

        _whisperOptions.ValidateAndSanitize(msg => _logger.LogWarning("{Message}", msg));
    }

    public async Task<AlignmentData> AlignAsync(string audioFilePath, string expectedText, CancellationToken ct = default)
    {
        var safeAudio = _pathResolver.ResolveSafePath(audioFilePath);
        var jobId = Guid.NewGuid().ToString("N")[..8];

        _logger.LogInformation(
            "[WhisperAlign] Starting word-level alignment (FasterWhisper.NET). Job: [Job_{JobId}], Audio: {Audio}",
            jobId, Path.GetFileName(safeAudio));

        var modelDir = ResolveModelDirectory();
        if (string.IsNullOrEmpty(modelDir) || !Directory.Exists(modelDir))
        {
            _logger.LogError("[FasterWhisper] Model directory not found at {Path}. Using FallbackProportional.",
                _whisperOptions.Model.DirectoryPath);
            return FallbackProportionalAlignment(expectedText, safeAudio);
        }

        IAsyncDisposable? gpuLock = null;
        if (_whisperOptions.Hardware.Device.Equals("cuda", StringComparison.OrdinalIgnoreCase))
        {
            _logger.LogDebug("[GPU] Acquiring VRAM lock for [Job_{JobId}]...", jobId);
            gpuLock = await _gpuManager.AcquireGpuLockAsync($"Whisper_Alignment_{jobId}", ct);
            _logger.LogInformation("[GPU] VRAM lock acquired. Running FasterWhisper.NET inference.");
        }

        try
        {
            using var nativeModel = new NativeWhisperModel(_whisperOptions, modelDir, _logger);

            var result = await nativeModel.AlignAsync(
                safeAudio,
                expectedText,
                _whisperOptions.Inference.DefaultLanguage,
                ct);

            double rtf = result.TotalDurationMs > 0
                ? (result.InferenceElapsedMs / 1000.0) / (result.TotalDurationMs / 1000.0)
                : 0.0;

            double avgConfidence = result.Words.Count > 0 ? result.Words.Average(w => w.Confidence) : 0.0;

            _logger.LogInformation(
                "[FasterWhisper] Inference completed in {ElapsedMs} ms. RTF: {Rtf:F3}x ({Speed:F1}x realtime). " +
                "Words: {WordsCount}, Avg confidence: {Conf:F2}",
                result.InferenceElapsedMs, rtf, rtf > 0 ? 1.0 / rtf : 0, result.Words.Count, avgConfidence);

            return new AlignmentData(result.Words, result.TotalDurationMs, "FasterWhisper_NET");
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "[WhisperAlign] FasterWhisper.NET failed for [Job_{JobId}]. Falling back.", jobId);
            return FallbackProportionalAlignment(expectedText, safeAudio);
        }
        finally
        {
            if (gpuLock != null)
            {
                await gpuLock.DisposeAsync();
                _logger.LogInformation("[GPU] VRAM released. Lock [Job_{JobId}] cleared.", jobId);
            }

            if (_whisperOptions.MemoryManagement.RetentionPolicy.Equals("UnloadImmediately", StringComparison.OrdinalIgnoreCase))
            {
                await _gpuManager.CleanMemoryAsync(CancellationToken.None);
            }
        }
    }

    private string? ResolveModelDirectory()
    {
        string modelTarget = _whisperOptions.Model.DirectoryPath;

        var customSetting = _settingRepo.GetByKeyAsync("voice.whisper_model_path").GetAwaiter().GetResult();
        if (!string.IsNullOrEmpty(customSetting?.Value))
        {
            modelTarget = customSetting.Value;
        }

        var located = ModelPathResolver.Locate(modelTarget, _storageConfig.DataStorageDir);
        if (!string.IsNullOrEmpty(located))
        {
            if (File.Exists(located))
            {
                return Path.GetDirectoryName(located);
            }
            if (Directory.Exists(located))
            {
                return located;
            }
        }

        var candidates = ModelPathResolver.GetCandidatePaths(
            _storageConfig.GetModelPath("whisper"), _storageConfig.DataStorageDir);
        foreach (var dir in candidates)
        {
            if (Directory.Exists(dir) && File.Exists(Path.Combine(dir, "model.bin")))
            {
                return dir;
            }
        }

        return null;
    }

    private AlignmentData FallbackProportionalAlignment(string text, string audioPath)
    {
        _logger.LogWarning("[WhisperAlign] FALLBACK (proportional word distribution)");
        var tokens = text.Split([' ', '\n', '\r', '\t'], StringSplitOptions.RemoveEmptyEntries);
        if (tokens.Length == 0) return AlignmentData.Empty;

        long estimatedDurationMs = 2000;
        if (File.Exists(audioPath))
        {
            estimatedDurationMs = Math.Max(500, (long)(WavAudioDecoder.ProbeWavDuration(audioPath) * 1000));
        }

        long step = estimatedDurationMs / tokens.Length;
        var list = new List<TimedWord>();
        for (int i = 0; i < tokens.Length; i++)
        {
            long start = i * step;
            long end = (i == tokens.Length - 1) ? estimatedDurationMs : (i + 1) * step;
            list.Add(new TimedWord(tokens[i], start, end, 0.5));
        }

        return new AlignmentData(list, estimatedDurationMs, "FallbackProportional");
    }
}
