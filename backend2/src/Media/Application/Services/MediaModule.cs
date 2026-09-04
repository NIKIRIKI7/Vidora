using Kernel.Contracts;
using Kernel.Exceptions;
using Kernel.Platform.FileSystem;
using Kernel.Ports;
using MediaContext.Contracts;
using MediaContext.Domain;
using MediaContext.Domain.Entities;
using MediaContext.Domain.Ports;
using MediaContext.Domain.ValueObjects;
using MediaContext.Infrastructure.Catalog;
using MediaContext.Infrastructure.Normalization;
using Microsoft.Extensions.Logging;

namespace MediaContext.Application.Services;

public sealed class MediaModule : IMediaModule
{
    private readonly IMediaAssetRepository _repository;
    private readonly IMediaStorageService _storageService;
    private readonly IBrollNormalizer _normalizer;
    private readonly IMusicCatalogProvider _musicCatalog;
    private readonly IPexelsClient _pexelsClient;
    private readonly IPathResolver _pathResolver;
    private readonly ILogger<MediaModule> _logger;

    public MediaModule(
        IMediaAssetRepository repository,
        IMediaStorageService storageService,
        IBrollNormalizer normalizer,
        IMusicCatalogProvider musicCatalog,
        IPexelsClient pexelsClient,
        IPathResolver pathResolver,
        ILogger<MediaModule> logger)
    {
        _repository = repository;
        _storageService = storageService;
        _normalizer = normalizer;
        _musicCatalog = musicCatalog;
        _pexelsClient = pexelsClient;
        _pathResolver = pathResolver;
        _logger = logger;
    }

    public async Task<MediaAssetDto> GetAssetByIdAsync(string assetId, CancellationToken ct = default)
    {
        if (!MediaAssetId.TryParse(assetId, out var id))
        {
            throw new ResourceNotFoundException("MediaAsset", assetId);
        }

        var asset = await _repository.GetByIdAsync(id, ct)
            ?? throw new ResourceNotFoundException("MediaAsset", assetId);

        return MapToDto(asset);
    }

    public async Task<PagedResult<MediaAssetDto>> GetAssetsAsync(MediaType? type, int page = 1, int pageSize = 50, CancellationToken ct = default)
    {
        page = Math.Max(1, page);
        pageSize = Math.Clamp(pageSize, 1, 200);

        int total = await _repository.CountAsync(type, ct);
        var items = await _repository.GetPagedAsync(type, (page - 1) * pageSize, pageSize, ct);

        return PagedResult<MediaAssetDto>.Create(
            items.Select(MapToDto).ToList(),
            total,
            page,
            pageSize);
    }

    public async Task<MediaAssetDto> SaveUploadedAssetAsync(string title, MediaType type, Stream stream, string originalFileName, CancellationToken ct = default)
    {
        var subDir = Path.Combine("uploads", type.ToString().ToLowerInvariant());
        var stored = await _storageService.SaveAsync(stream, subDir, originalFileName, ct);

        var asset = MediaAsset.Create(
            id: MediaAssetId.NewId(),
            title: title,
            type: type,
            source: AssetSource.UserUpload,
            storagePath: stored.StoragePath,
            extension: stored.Extension,
            fileSizeBytes: stored.SizeBytes,
            sha256Hash: stored.Sha256Hash);

        await _repository.AddAsync(asset, ct);
        await _repository.SaveChangesAsync(ct);

        _logger.LogInformation("[MediaModule] Ассет успешно сохранен: {AssetId} ({Title})", asset.Id.Value, asset.Title);
        return MapToDto(asset);
    }

    public async Task<NormalizedBrollDto> NormalizeBrollAsync(string assetId, int targetWidth, int targetHeight, double targetFps = 30.0, CancellationToken ct = default)
    {
        if (!MediaAssetId.TryParse(assetId, out var id))
        {
            throw new ResourceNotFoundException("MediaAsset", assetId);
        }

        var asset = await _repository.GetByIdAsync(id, ct)
            ?? throw new ResourceNotFoundException("MediaAsset", assetId);

        var targetDimensions = new MediaDimensions(targetWidth, targetHeight);
        var normDir = _storageService.ResolveSafeDirectory("normalized");
        var normFileName = $"{asset.Id.Value}_{targetDimensions}_{targetFps:F0}fps.mp4";
        var normPath = _pathResolver.ResolveSafePath(Path.Combine(normDir, normFileName));

        var generatedPath = await _normalizer.NormalizeVideoAsync(asset.StoragePath, normPath, targetDimensions, targetFps, ct);
        var fileInfo = new FileInfo(generatedPath);

        asset.MarkNormalized(generatedPath, targetDimensions, targetFps, fileInfo.Length);
        await _repository.UpdateAsync(asset, ct);
        await _repository.SaveChangesAsync(ct);

        return new NormalizedBrollDto(
            AssetId: asset.Id.Value,
            OriginalPath: asset.StoragePath,
            NormalizedPath: asset.NormalizedStoragePath!,
            Width: targetDimensions.Width,
            Height: targetDimensions.Height,
            Fps: asset.Fps ?? targetFps,
            DurationSeconds: asset.Duration?.TotalSeconds);
    }

    public async Task<IReadOnlyList<StockVideoDto>> SearchStockVideosAsync(string query, string? orientation = null, int page = 1, int perPage = 15, CancellationToken ct = default)
    {
        var filter = new PexelsSearchFilter(query, orientation, null, page, perPage);
        var results = await _pexelsClient.SearchVideosAsync(filter, ct);

        return results.Select(v =>
        {
            var bestFile = v.VideoFiles.OrderByDescending(f => f.Width).FirstOrDefault() ?? v.VideoFiles.FirstOrDefault();
            return new StockVideoDto(
                Id: v.Id,
                Title: $"Pexels: {query} ({v.Id})",
                Url: v.Url,
                ImagePreview: v.ImageUrl,
                DurationSeconds: v.DurationSeconds,
                DownloadUrl: bestFile?.Link ?? string.Empty,
                Width: bestFile?.Width ?? v.Width,
                Height: bestFile?.Height ?? v.Height);
        }).ToList();
    }

    public async Task<MediaAssetDto> DownloadAndImportStockVideoAsync(string downloadUrl, string title, CancellationToken ct = default)
    {
        var assetId = MediaAssetId.NewId("broll");
        var targetDir = _storageService.ResolveSafeDirectory("stocks");
        var fileName = $"{assetId.Value}_stock.mp4";
        var safeDest = _pathResolver.ResolveSafePath(Path.Combine(targetDir, fileName));

        var downloadedPath = await _pexelsClient.DownloadVideoAsync(downloadUrl, safeDest, null, ct);
        var fileInfo = new FileInfo(downloadedPath);

        var asset = MediaAsset.Create(
            id: assetId,
            title: title,
            type: MediaType.Video,
            source: AssetSource.StockPexels,
            storagePath: downloadedPath,
            extension: "mp4",
            fileSizeBytes: fileInfo.Length);

        await _repository.AddAsync(asset, ct);
        await _repository.SaveChangesAsync(ct);

        return MapToDto(asset);
    }

    public Task<IReadOnlyList<MusicTrackDto>> GetMusicCatalogAsync(string? moodFilter = null, CancellationToken ct = default) =>
        _musicCatalog.GetTracksAsync(moodFilter, ct);

    public async Task DeleteAssetAsync(string assetId, CancellationToken ct = default)
    {
        if (!MediaAssetId.TryParse(assetId, out var id))
        {
            throw new ResourceNotFoundException("MediaAsset", assetId);
        }

        var asset = await _repository.GetByIdAsync(id, ct)
            ?? throw new ResourceNotFoundException("MediaAsset", assetId);

        asset.PrepareDelete();
        await _storageService.DeletePhysicalFileAsync(asset.StoragePath, ct);

        if (!string.IsNullOrEmpty(asset.NormalizedStoragePath))
        {
            await _storageService.DeletePhysicalFileAsync(asset.NormalizedStoragePath, ct);
        }

        await _repository.DeleteAsync(asset, ct);
        await _repository.SaveChangesAsync(ct);

        _logger.LogInformation("[MediaModule] Ассет удален: {AssetId}", assetId);
    }

    private static MediaAssetDto MapToDto(MediaAsset entity) => new()
    {
        Id = entity.Id.Value,
        Title = entity.Title,
        Type = entity.Type,
        Source = entity.Source,
        StoragePath = entity.StoragePath,
        Extension = entity.Extension,
        FileSizeBytes = entity.FileSizeBytes,
        Width = entity.Dimensions?.Width,
        Height = entity.Dimensions?.Height,
        AspectRatio = entity.Dimensions?.AspectRatio.ToString(),
        DurationSeconds = entity.Duration?.TotalSeconds,
        Fps = entity.Fps,
        IsNormalized = entity.IsNormalized,
        NormalizedStoragePath = entity.NormalizedStoragePath,
        CreatedAt = entity.CreatedAt
    };
}
