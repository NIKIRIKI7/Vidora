using MediaContext.Domain.ValueObjects;

namespace MediaContext.Infrastructure.Normalization;

public interface IBrollNormalizer
{
    Task<string> NormalizeVideoAsync(
        string sourceFilePath,
        string destinationFilePath,
        MediaDimensions targetDimensions,
        double targetFps = 30.0,
        CancellationToken ct = default);
}
