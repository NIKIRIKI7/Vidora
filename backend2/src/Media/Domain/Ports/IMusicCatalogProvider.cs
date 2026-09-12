namespace MediaContext.Domain.Ports;

public sealed record MusicTrackInfo(
    string Id,
    string Name,
    string Genre,
    string Mood,
    double DurationSeconds,
    string FilePath,
    int TempoBpm);

public interface IMusicCatalogProvider
{
    Task<IReadOnlyList<MusicTrackInfo>> GetTracksAsync(string? mood = null, CancellationToken ct = default);
}
