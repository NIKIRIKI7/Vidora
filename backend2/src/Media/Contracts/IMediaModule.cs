using Kernel.Contracts;
using MediaContext.Domain;

namespace MediaContext.Contracts;

/// <summary>
/// Публичный фасад взаимодействия других Bounded Contexts (Production, Motion) с медиа-подсистемой.
/// Прямой доступ к репозиториям и DbContext Media извне запрещен.
/// </summary>
public interface IMediaModule
{
    Task<MediaAssetDto> GetAssetByIdAsync(string assetId, CancellationToken ct = default);
    Task<PagedResult<MediaAssetDto>> GetAssetsAsync(MediaType? type, int page = 1, int pageSize = 50, CancellationToken ct = default);
    Task<MediaAssetDto> SaveUploadedAssetAsync(string title, MediaType type, Stream stream, string originalFileName, CancellationToken ct = default);
    Task<NormalizedBrollDto> NormalizeBrollAsync(string assetId, int targetWidth, int targetHeight, double targetFps = 30.0, CancellationToken ct = default);
    Task<IReadOnlyList<StockVideoDto>> SearchStockVideosAsync(string query, string? orientation = null, int page = 1, int perPage = 15, CancellationToken ct = default);
    Task<MediaAssetDto> DownloadAndImportStockVideoAsync(string downloadUrl, string title, CancellationToken ct = default);
    Task<IReadOnlyList<MusicTrackDto>> GetMusicCatalogAsync(string? moodFilter = null, CancellationToken ct = default);
    Task DeleteAssetAsync(string assetId, CancellationToken ct = default);
    Task<ProcessBrollResponse> ProcessBrollAsync(ProcessBrollCommand command, CancellationToken ct = default);
    Task<AutoBrollResponse> AutoMatchBrollAsync(AutoBrollCommand command, CancellationToken ct = default);
}
