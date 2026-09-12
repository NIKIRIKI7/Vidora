using System.Diagnostics;
using Integrations.Whisper.Config;
using Kernel.Platform.Audio;
using Microsoft.Extensions.Logging;
using Qourex.FasterWhisper.NET;
using FWOptions = Qourex.FasterWhisper.NET.WhisperOptions;
using VidoraWhisperOptions = Integrations.Whisper.Config.WhisperOptions;

namespace Integrations.Whisper.Native;

public sealed record NativeAlignmentResult(
    List<WhisperWord> Words,
    long TotalDurationMs,
    long InferenceElapsedMs);

public sealed class NativeWhisperModel : IDisposable
{
    private readonly VidoraWhisperOptions _options;
    private readonly string _resolvedModelDir;
    private readonly ILogger _logger;
    private WhisperModel? _model;
    private string _currentDevice;
    private string _currentComputeType;
    private bool _disposed;

    public NativeWhisperModel(VidoraWhisperOptions options, string resolvedModelDir, ILogger logger)
    {
        _options = options;
        _resolvedModelDir = resolvedModelDir;
        _logger = logger;
        _currentDevice = options.Hardware.Device.ToLowerInvariant();
        _currentComputeType = options.Hardware.ComputeType.ToLowerInvariant();
    }

    public async Task EnsureLoadedAsync(CancellationToken ct = default)
    {
        if (_model != null) return;

        var sw = Stopwatch.StartNew();
        _logger.LogInformation(
            "[FasterWhisper] Loading CTranslate2 model (Device: {Device}, ComputeType: {Compute}, Threads: {Threads}) from {Path}",
            _currentDevice, _currentComputeType, _options.Hardware.CpuThreads, _resolvedModelDir);

        try
        {
            _model = await WhisperModel.LoadAsync(
                modelNameOrPath: _resolvedModelDir,
                device: _currentDevice,
                computeType: _currentComputeType,
                deviceIndices: [_options.Hardware.DeviceIndex],
                cpuThreads: _options.Hardware.CpuThreads,
                cancellationToken: ct);

            sw.Stop();
            _logger.LogInformation("[FasterWhisper] Model loaded in {ElapsedMs} ms", sw.ElapsedMilliseconds);
        }
        catch (Exception ex) when (_options.Hardware.AutoFallbackToCpuOnOom && _currentDevice != "cpu")
        {
            _logger.LogWarning(ex, "[FasterWhisper] GPU init failed ({Device}). Auto-fallback to CPU (float32)...", _currentDevice);
            _currentDevice = "cpu";
            _currentComputeType = "float32";

            _model = await WhisperModel.LoadAsync(
                modelNameOrPath: _resolvedModelDir,
                device: "cpu",
                computeType: "float32",
                cpuThreads: _options.Hardware.CpuThreads,
                cancellationToken: ct);

            sw.Stop();
            _logger.LogInformation("[FasterWhisper] Model loaded on CPU (float32) in {ElapsedMs} ms", sw.ElapsedMilliseconds);
        }
    }

    public async Task<NativeAlignmentResult> AlignAsync(
        string audioFilePath,
        string expectedText,
        string language,
        CancellationToken ct = default)
    {
        await EnsureLoadedAsync(ct);

        var decoded = await WavAudioDecoder.DecodeToMono16kHzAsync(audioFilePath, ct);
        _logger.LogInformation(
            "[FasterWhisper] Decoded {File}: {Duration:F2}s, {Samples:N0} samples, max={MaxAmplitude:F4}",
            Path.GetFileName(audioFilePath), decoded.Duration.TotalSeconds, decoded.Samples.Length, decoded.Samples.Max(Math.Abs));

        var fwOptions = new FWOptions
        {
            WordTimestamps = true,
            BeamSize = _options.Inference.BeamSize,
            InitialPrompt = string.IsNullOrWhiteSpace(expectedText) ? null : expectedText,
            SamplingTemperature = (float)_options.Inference.Temperature,
            Patience = (float)_options.Inference.Patience,
            SuppressBlank = _options.Inference.SuppressBlank
        };

        // VAD обязателен: без него Whisper «ищет» слова в тишине и галлюцинирует дублями.
        var vadOptions = _options.Inference.EnableVad
            ? new VadOptions
            {
                Enabled = true,
                Threshold = (float)_options.Inference.VadThreshold,
                MinSilenceDurationMs = _options.Inference.MinSilenceDurationMs
            }
            : null;

        var sw = Stopwatch.StartNew();
        IReadOnlyList<WhisperSegment> segments;

        try
        {
            _logger.LogInformation("[FasterWhisper] Calling TranscribeWithInfo (samples={SampleCount}, lang={Lang}, beam={Beam}, temp={Temp}, vad={Vad})",
                decoded.Samples.Length, language, fwOptions.BeamSize, fwOptions.SamplingTemperature, vadOptions?.Enabled ?? false);

            var syncResult = _model!.TranscribeWithInfo(
                decoded.Samples,
                language: language,
                task: "transcribe",
                options: fwOptions,
                vadOptions: vadOptions);

            var segList = syncResult.Segments.ToList();
            _logger.LogInformation(
                "[FasterWhisper] TranscribeWithInfo: {SegmentCount} segments, lang={Lang}, langProb={LangProb}",
                segList.Count, syncResult.Info.Language, syncResult.Info.LanguageProbability);

            foreach (var seg in segList)
            {
                _logger.LogInformation("[FasterWhisper] Segment [{Start:F2}-{End:F2}] \"{Text}\" words={WordCount}",
                    seg.Start, seg.End, seg.Text, seg.Words?.Count ?? 0);
            }

            segments = segList;
            sw.Stop();
        }
        catch (Exception ex) when (_options.Hardware.AutoFallbackToCpuOnOom && _currentDevice != "cpu")
        {
            _logger.LogWarning(ex, "[FasterWhisper] CUDA OOM during inference. Switching to CPU...");
            Dispose();
            _currentDevice = "cpu";
            _currentComputeType = "float32";
            await EnsureLoadedAsync(ct);
            return await AlignAsync(audioFilePath, expectedText, language, ct);
        }

        var resultWords = new List<WhisperWord>();
        float maxEndSeconds = 0f;

        foreach (var segment in segments)
        {
            if (segment.End > maxEndSeconds)
            {
                maxEndSeconds = segment.End;
            }

            if (segment.Words != null && segment.Words.Count > 0)
            {
                foreach (var w in segment.Words)
                {
                    if (string.IsNullOrWhiteSpace(w.Word)) continue;

                    long startMs = Math.Max(0, (long)Math.Round(w.Start * 1000f));
                    long endMs = Math.Max(startMs, (long)Math.Round(w.End * 1000f));
                    double conf = Math.Clamp((double)w.Probability, 0.0, 1.0);

                    resultWords.Add(new WhisperWord(w.Word.Trim(), startMs, endMs, conf));
                }
            }
            else if (!string.IsNullOrWhiteSpace(segment.Text))
            {
                var tokens = segment.Text.Split([' ', '\n', '\r', '\t'], StringSplitOptions.RemoveEmptyEntries);
                if (tokens.Length > 0)
                {
                    long segStartMs = Math.Max(0, (long)Math.Round(segment.Start * 1000f));
                    long segEndMs = Math.Max(segStartMs, (long)Math.Round(segment.End * 1000f));
                    long step = Math.Max(1, (segEndMs - segStartMs) / tokens.Length);

                    for (int i = 0; i < tokens.Length; i++)
                    {
                        long s = segStartMs + (i * step);
                        long e = (i == tokens.Length - 1) ? segEndMs : (s + step);
                        resultWords.Add(new WhisperWord(tokens[i], s, e, 0.85));
                    }
                }
            }
        }

        _logger.LogInformation("[FasterWhisper] Result: {WordCount} words, duration={Duration}ms, inference={Inference}ms",
            resultWords.Count, (long)Math.Round(maxEndSeconds * 1000f), sw.ElapsedMilliseconds);

        long totalDurationMs = (long)Math.Round(maxEndSeconds * 1000f);
        return new NativeAlignmentResult(resultWords, totalDurationMs, sw.ElapsedMilliseconds);
    }

    public void Dispose()
    {
        if (_disposed) return;
        if (_model != null)
        {
            _logger.LogDebug("[FasterWhisper] Disposing CTranslate2 model and releasing VRAM.");
            _model.Dispose();
            _model = null;
        }
        _disposed = true;
        GC.SuppressFinalize(this);
    }
}
