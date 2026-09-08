using Integrations.OmniVoice.Audio;
using Integrations.OmniVoice.Contracts;
using Kernel.Platform.FileSystem;
using Kernel.Platform.Gpu;
using Microsoft.Extensions.Logging;
using Voice.Domain;
using Voice.Domain.ValueObjects;

namespace Voice.Infrastructure.Providers.Local;

public sealed class OmniVoiceTtsProvider : ITtsEngineProvider
{
    public VoiceEngineType EngineType => VoiceEngineType.LocalOmniVoice;

    private readonly IOmniVoiceEngine _engine;
    private readonly IGpuManager _gpuManager;
    private readonly IPathResolver _pathResolver;
    private readonly ILogger<OmniVoiceTtsProvider> _logger;

    public OmniVoiceTtsProvider(
        IOmniVoiceEngine engine,
        IGpuManager gpuManager,
        IPathResolver pathResolver,
        ILogger<OmniVoiceTtsProvider> logger)
    {
        _engine = engine;
        _gpuManager = gpuManager;
        _pathResolver = pathResolver;
        _logger = logger;
    }

    public async Task<RawSynthesisResult> SynthesizeAsync(string text, VoiceSpec spec, string destinationPath, CancellationToken ct)
    {
        var safeDest = _pathResolver.ResolveSafePath(destinationPath);
        var dir = Path.GetDirectoryName(safeDest);
        if (!string.IsNullOrEmpty(dir))
        {
            Directory.CreateDirectory(dir);
        }

        _logger.LogInformation(
            "[Voice:OmniVoice] Synthesis request: Speaker='{Speaker}', Speed={Speed:F2}, Pitch={Pitch:F2}, CFG={Cfg:F2}, Steps={Steps}",
            spec.SpeakerId, spec.Speed, spec.Pitch, spec.GuidanceScale, spec.NumSteps);

        await using (await _gpuManager.AcquireGpuLockAsync("OmniVoice_TTS", ct))
        {
            OmniVoiceSynthesisResult result;

            if (!string.IsNullOrWhiteSpace(spec.ReferenceAudioPath) && File.Exists(spec.ReferenceAudioPath))
            {
                result = await _engine.SynthesizeWithCloneAsync(
                    text, spec.ReferenceAudioPath, null, spec.Speed, spec.Pitch, spec.NumSteps, spec.GuidanceScale, ct);
            }
            else
            {
                result = await _engine.SynthesizeSpeechAsync(
                    text, spec.SpeakerId, spec.Speed, spec.Pitch, spec.NumSteps, spec.GuidanceScale, ct);
            }

            await WavAudioEncoder.WriteWavFileAsync(safeDest, result.Samples, result.SampleRate, ct);

            var fileInfo = new FileInfo(safeDest);
            _logger.LogInformation(
                "[Voice:OmniVoice] File saved: {Path} ({Bytes} bytes, {Duration:F2} s)",
                safeDest, fileInfo.Length, result.DurationSeconds);

            return new RawSynthesisResult(safeDest, result.DurationSeconds, fileInfo.Length);
        }
    }
}
