using MediaContext.Contracts;

namespace MediaContext.Infrastructure.Catalog;

public interface IMusicCatalogProvider
{
    Task<IReadOnlyList<MusicTrackDto>> GetTracksAsync(string? mood = null, CancellationToken ct = default);
}
