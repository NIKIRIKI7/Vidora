namespace Kernel.Platform.Gpu;

public interface IGpuManager
{
    Task<IAsyncDisposable> AcquireGpuLockAsync(string contextName, CancellationToken cancellationToken = default);
    Task CleanMemoryAsync(CancellationToken cancellationToken = default);
    bool IsGpuAvailable();
}
