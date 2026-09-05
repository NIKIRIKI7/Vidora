namespace ProductionContext.Domain.Ports;

public sealed record StitchVideoItem(string VideoFilePath, double DurationSeconds);

public interface IVideoStitcher
{
    Task<string> ConcatenateScenesAsync(
        IReadOnlyList<StitchVideoItem> sceneVideos,
        string outputMp4Path,
        CancellationToken ct = default);

    Task<string> MuxMasterAudioAsync(
        string inputVideoPath,
        string inputAudioPath,
        string outputFinalVideoPath,
        CancellationToken ct = default);
}
