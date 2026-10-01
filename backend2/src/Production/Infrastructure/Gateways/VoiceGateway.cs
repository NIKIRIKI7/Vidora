using ProductionContext.Domain.Ports;
using Voice.Contracts;

namespace ProductionContext.Infrastructure.Gateways;

public sealed class VoiceGateway : IVoiceGateway
{
    private readonly IVoiceModule _voiceModule;

    public VoiceGateway(IVoiceModule voiceModule)
    {
        _voiceModule = voiceModule;
    }

    public async Task<VoiceSynthesisResult> SynthesizeFragmentAudioAsync(
        string text,
        string speakerId,
        double speed = 1.0,
        CancellationToken ct = default)
    {
        var cmd = SynthesizeSpeechCommand.ForSpeaker(text, speakerId, speed);

        var result = await _voiceModule.SynthesizeSpeechAsync(cmd, ct);
        return new VoiceSynthesisResult(
            AudioPath: result.AudioPath ?? string.Empty,
            MediaAssetId: result.MediaAssetId ?? string.Empty,
            DurationSeconds: result.DurationSeconds ?? 1.5);
    }

    public async Task<VoiceSynthesisResult> ApplyDuckingAsync(
        string voiceAssetId,
        string bgmAssetId,
        double voiceDurationSeconds,
        CancellationToken ct = default)
    {
        var result = await _voiceModule.ApplyDuckingAsync(
            ApplyAudioDuckingCommand.ForAssets(voiceAssetId, bgmAssetId), ct);

        return new VoiceSynthesisResult(
            AudioPath: result.MasterAudioPath,
            MediaAssetId: result.MediaAssetId,
            DurationSeconds: voiceDurationSeconds);
    }
}
