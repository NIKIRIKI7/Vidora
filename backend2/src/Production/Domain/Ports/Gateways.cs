namespace ProductionContext.Domain.Ports;

public sealed record VoiceSynthesisResult(string AudioPath, string MediaAssetId, double DurationSeconds);

public interface IVoiceGateway
{
    Task<VoiceSynthesisResult> SynthesizeFragmentAudioAsync(
        string text,
        string speakerId,
        double speed = 1.0,
        CancellationToken ct = default);

    Task<string> ApplyDuckingAsync(
        string voiceAssetId,
        string bgmAssetId,
        CancellationToken ct = default);
}

public interface IMotionGateway
{
    Task<string> GenerateSceneCodeAsync(
        string projectId,
        string sceneId,
        string visualDescription,
        string voiceText,
        double durationSeconds,
        int width,
        int height,
        int fps,
        CancellationToken ct = default);

    Task<string> RenderSceneVideoAsync(
        string sceneCodeId,
        IProgress<double>? progress = null,
        CancellationToken ct = default);
}

public interface IMediaGateway
{
    Task<string> ResolveAssetFilePathAsync(string assetId, CancellationToken ct = default);
    Task<string> RegisterVideoAssetAsync(string title, string filePath, CancellationToken ct = default);
}
