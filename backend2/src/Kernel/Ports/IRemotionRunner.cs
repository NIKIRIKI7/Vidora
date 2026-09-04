namespace Kernel.Ports;

public sealed record RemotionRenderSpec(
    string EntryPointTsx,
    string CompositionId,
    string OutputMp4Path,
    int Fps,
    int Width,
    int Height,
    object? InputProps = null);

public sealed record RemotionProgress(int RenderedFrames, int TotalFrames, double Percent);

public interface IRemotionRunner
{
    Task RenderAsync(
        RemotionRenderSpec spec,
        IProgress<RemotionProgress>? progress = null,
        CancellationToken cancellationToken = default);
}
