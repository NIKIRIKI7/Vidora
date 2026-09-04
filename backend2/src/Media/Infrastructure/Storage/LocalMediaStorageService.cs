using System.Security.Cryptography;
using Kernel.Platform.Config;
using Kernel.Platform.FileSystem;
using MediaContext.Domain.Ports;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace MediaContext.Infrastructure.Storage;

public sealed class LocalMediaStorageService : IMediaStorageService
{
    private readonly IPathResolver _pathResolver;
    private readonly AppStorageConfig _storageConfig;
    private readonly ILogger<LocalMediaStorageService> _logger;

    public LocalMediaStorageService(
        IPathResolver pathResolver,
        IOptions<AppStorageConfig> storageConfig,
        ILogger<LocalMediaStorageService> logger)
    {
        _pathResolver = pathResolver;
        _storageConfig = storageConfig.Value;
        _logger = logger;
    }

    public string ResolveSafeDirectory(string subDirectory)
    {
        var rawPath = Path.Combine(_storageConfig.DataStorageDir, subDirectory);
        var safePath = _pathResolver.ResolveSafePath(rawPath);
        if (!Directory.Exists(safePath))
        {
            Directory.CreateDirectory(safePath);
        }
        return safePath;
    }

    public async Task<StoredFileResult> SaveAsync(Stream contentStream, string subDirectory, string originalFileName, CancellationToken ct = default)
    {
        ArgumentNullException.ThrowIfNull(contentStream);
        ArgumentException.ThrowIfNullOrWhiteSpace(originalFileName);

        var sanitized = _pathResolver.SanitizeFileName(originalFileName);
        var extension = Path.GetExtension(sanitized).TrimStart('.').ToLowerInvariant();
        var targetDir = ResolveSafeDirectory(subDirectory);
        var targetFilePath = Path.Combine(targetDir, $"{Guid.NewGuid():N}_{sanitized}");
        var safeDestination = _pathResolver.ResolveSafePath(targetFilePath);

        _logger.LogInformation("[MediaStorage] Запись файла в хранилище: {Path}", safeDestination);

        string hash;
        long totalBytes = 0;

        using (var sha = SHA256.Create())
        await using (var fileStream = new FileStream(safeDestination, FileMode.Create, FileAccess.Write, FileShare.None, 81920, true))
        {
            var buffer = new byte[81920];
            int read;
            while ((read = await contentStream.ReadAsync(buffer.AsMemory(0, buffer.Length), ct)) > 0)
            {
                await fileStream.WriteAsync(buffer.AsMemory(0, read), ct);
                sha.TransformBlock(buffer, 0, read, null, 0);
                totalBytes += read;
            }
            sha.TransformFinalBlock([], 0, 0);
            hash = Convert.ToHexString(sha.Hash ?? []);
        }

        return new StoredFileResult(safeDestination, totalBytes, extension, hash);
    }

    public Task DeletePhysicalFileAsync(string storagePath, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(storagePath)) return Task.CompletedTask;

        try
        {
            var safePath = _pathResolver.ResolveSafePath(storagePath);
            if (File.Exists(safePath))
            {
                File.Delete(safePath);
                _logger.LogInformation("[MediaStorage] Файл удален с диска: {Path}", safePath);
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "[MediaStorage] Ошибка при попытке удаления файла: {Path}", storagePath);
            throw;
        }

        return Task.CompletedTask;
    }
}
