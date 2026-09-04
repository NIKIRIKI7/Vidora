namespace Kernel.Ports;

public sealed record PexelsVideoFile(
    int Id,
    string Quality,
    string FileType,
    int Width,
    int Height,
    double Fps,
    string Link);

public sealed record PexelsVideo(
    int Id,
    int Width,
    int Height,
    int DurationSeconds,
    string Url,
    string ImageUrl,
    string Photographer,
    IReadOnlyList<PexelsVideoFile> VideoFiles);

public sealed record PexelsSearchFilter(
    string Query,
    string? Orientation = null, // "landscape", "portrait", "square"
    string? Size = null,        // "large", "medium", "small"
    int Page = 1,
    int PerPage = 15);

public interface IPexelsClient
{
    Task<IReadOnlyList<PexelsVideo>> SearchVideosAsync(
        PexelsSearchFilter filter,
        CancellationToken cancellationToken = default);

    Task<string> DownloadVideoAsync(
        string downloadUrl,
        string destinationFilePath,
        IProgress<double>? progress = null,
        CancellationToken cancellationToken = default);
}
