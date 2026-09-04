namespace MediaContext.Domain.Ports;

public sealed record StoredFileResult(
    string StoragePath,
    long SizeBytes,
    string Extension,
    string Sha256Hash);

public interface IMediaStorageService
{
    Task<StoredFileResult> SaveAsync(Stream contentStream, string subDirectory, string originalFileName, CancellationToken ct = default);
    Task DeletePhysicalFileAsync(string storagePath, CancellationToken ct = default);
    string ResolveSafeDirectory(string subDirectory);
}
