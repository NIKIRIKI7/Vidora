using MediaContext.Contracts;
using MediaContext.Domain;
using Voice.Application.Services;

namespace Voice.Infrastructure.Adapters;

public sealed class VoiceMediaRegistrar : IVoiceMediaRegistrar
{
    private readonly IMediaModule _mediaModule;

    public VoiceMediaRegistrar(IMediaModule mediaModule)
    {
        _mediaModule = mediaModule;
    }

    public async Task<string> RegisterAudioAsync(string title, string filePath, CancellationToken ct = default)
    {
        await using var stream = new FileStream(filePath, FileMode.Open, FileAccess.Read, FileShare.Read);
        var asset = await _mediaModule.SaveUploadedAssetAsync(
            title: title,
            type: MediaType.Audio,
            stream: stream,
            originalFileName: Path.GetFileName(filePath),
            ct: ct);

        return asset.Id;
    }

    public async Task<string> ResolveAudioPathAsync(string assetId, CancellationToken ct = default)
    {
        if (File.Exists(assetId))
        {
            return assetId;
        }

        var asset = await _mediaModule.GetAssetByIdAsync(assetId, ct);
        return !string.IsNullOrWhiteSpace(asset.NormalizedStoragePath) && File.Exists(asset.NormalizedStoragePath)
            ? asset.NormalizedStoragePath
            : asset.StoragePath;
    }
}
