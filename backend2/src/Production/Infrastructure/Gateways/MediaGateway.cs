using MediaContext.Contracts;
using MediaContext.Domain;
using ProductionContext.Domain.Ports;

namespace ProductionContext.Infrastructure.Gateways;

public sealed class MediaGateway : IMediaGateway
{
    private readonly IMediaModule _mediaModule;

    public MediaGateway(IMediaModule mediaModule)
    {
        _mediaModule = mediaModule;
    }

    public async Task<string> ResolveAssetFilePathAsync(string assetId, CancellationToken ct = default)
    {
        var asset = await _mediaModule.GetAssetByIdAsync(assetId, ct);
        return !string.IsNullOrWhiteSpace(asset.NormalizedStoragePath) && File.Exists(asset.NormalizedStoragePath)
            ? asset.NormalizedStoragePath
            : asset.StoragePath;
    }

    public async Task<string> RegisterVideoAssetAsync(string title, string filePath, CancellationToken ct = default)
    {
        await using var stream = new FileStream(filePath, FileMode.Open, FileAccess.Read, FileShare.Read);
        var asset = await _mediaModule.SaveUploadedAssetAsync(
            title: title,
            type: MediaType.Video,
            stream: stream,
            originalFileName: Path.GetFileName(filePath),
            ct: ct);

        return asset.Id;
    }
}
