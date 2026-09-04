namespace Kernel.Ports;

public sealed record MediaStreamInfo(string CodecType, string CodecName, int? Width, int? Height, double? Fps);

public sealed record MediaProbeResult(
    string FilePath,
    TimeSpan Duration,
    long BitRate,
    IReadOnlyList<MediaStreamInfo> Streams);

public interface IFfmpegClient
{
    Task<MediaProbeResult> ProbeAsync(string mediaFilePath, CancellationToken cancellationToken = default);
    Task ExecuteAsync(string arguments, CancellationToken cancellationToken = default);
}
