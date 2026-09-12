using Kernel.Platform.FileSystem;
using Kernel.Platform.Gpu;
using Integrations.Whisper.Audio;
using Microsoft.Extensions.Logging;
using Voice.Domain;
using Voice.Domain.Ports;
using Voice.Domain.ValueObjects;

namespace Voice.Infrastructure.Providers.Local;

public sealed class LocalTtsSpeechProvider : ITtsEngineProvider
{
    public VoiceEngineType EngineType => VoiceEngineType.LocalTts;

    private readonly ILocalTtsClient _client;
    private readonly IGpuManager _gpuManager;
    private readonly IPathResolver _pathResolver;
    private readonly ILogger<LocalTtsSpeechProvider> _logger;

    public LocalTtsSpeechProvider(
        ILocalTtsClient client,
        IGpuManager gpuManager,
        IPathResolver pathResolver,
        ILogger<LocalTtsSpeechProvider> logger)
    {
        _client = client;
        _gpuManager = gpuManager;
        _pathResolver = pathResolver;
        _logger = logger;
    }

    public async Task<RawSynthesisResult> SynthesizeAsync(string text, VoiceSpec spec, string destinationPath, CancellationToken ct)
    {
        var safeDest = _pathResolver.ResolveSafePath(destinationPath);

        var engineId = spec.LocalEngineId;
        if (string.IsNullOrWhiteSpace(engineId) || engineId == "default")
        {
            var models = await _client.GetAvailableModelsAsync(ct);
            engineId = models.FirstOrDefault()?.Id ?? "omni_voice_v1";
        }

        _logger.LogInformation("[LocalTts] Ожидание блокировки VRAM для генерации: {EngineId}", engineId);

        await using var gpuLock = await _gpuManager.AcquireGpuLockAsync($"LocalTts_{engineId}", ct);

        _logger.LogInformation("[LocalTts] VRAM заблокирован. Вызов локального ML-сервиса (Design: {HasInstruct}, Clone: {HasEmbedding})...",
            !string.IsNullOrEmpty(spec.InstructPrompt), !string.IsNullOrEmpty(spec.LocalEmbeddingPath));

        await _client.SynthesizeAsync(
            engineId: engineId,
            text: text,
            speakerEmbeddingPath: spec.LocalEmbeddingPath,
            instruct: spec.InstructPrompt,
            outputAudioPath: safeDest,
            speed: spec.Speed,
            pitch: spec.Pitch,
            numSteps: spec.NumSteps,
            guidanceScale: spec.GuidanceScale,
            denoise: spec.Denoise,
            duration: spec.Duration,
            preprocessPrompt: spec.PreprocessPrompt,
            postprocessOutput: spec.PostprocessOutput,
            referenceAudioPath: spec.ReferenceAudioPath,
            referenceText: spec.ReferenceText,
            ct: ct);

        var fileInfo = new FileInfo(safeDest);
        double actualDuration = WavAudioDecoder.ProbeWavDuration(safeDest);
        return new RawSynthesisResult(safeDest, actualDuration, fileInfo.Length);
    }
}
