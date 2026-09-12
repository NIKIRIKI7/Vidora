using Microsoft.Extensions.Logging;

namespace Kernel.Platform.Gpu;

public sealed class GpuManager : IGpuManager
{
    private static readonly TimeSpan LockTimeout = TimeSpan.FromMinutes(5);
    private const string DefaultLockFileName = "vidora_gpu_vram.lock";

    private readonly SemaphoreSlim _inProcessLock = new(1, 1);
    private readonly string _lockFilePath;
    private readonly ILogger<GpuManager> _logger;

    public GpuManager(ILogger<GpuManager> logger, string? customLockIdentifier = null)
    {
        _logger = logger;

        string fileName = string.IsNullOrWhiteSpace(customLockIdentifier)
            ? DefaultLockFileName
            : SanitizeForFileName(customLockIdentifier) + ".lock";

        _lockFilePath = Path.Combine(Path.GetTempPath(), fileName);
    }

    private static string SanitizeForFileName(string name)
    {
        var invalidChars = Path.GetInvalidFileNameChars();
        return string.Join("_", name.Split(invalidChars, StringSplitOptions.RemoveEmptyEntries)).Trim();
    }

    public async Task<IAsyncDisposable> AcquireGpuLockAsync(string contextName, CancellationToken cancellationToken = default)
    {
        _logger.LogDebug("[GPU] Ожидание внутрипроцессной блокировки VRAM: {Context}", contextName);
        await _inProcessLock.WaitAsync(cancellationToken);

        FileStream? lockFileStream = null;
        bool acquired = false;
        var startTime = DateTime.UtcNow;

        _logger.LogDebug("[GPU] Ожидание файловой блокировки VRAM: {Context}", contextName);

        try
        {
            while (!acquired)
            {
                cancellationToken.ThrowIfCancellationRequested();

                if (DateTime.UtcNow - startTime > LockTimeout)
                {
                    throw new TimeoutException($"Превышен таймаут ({LockTimeout.TotalSeconds} сек.) ожидания системной блокировки GPU для {contextName}");
                }

                try
                {
                    // Межпроцессная блокировка через файл без привязки к потокам (thread-affinity free)
                    lockFileStream = new FileStream(
                        _lockFilePath,
                        FileMode.OpenOrCreate,
                        FileAccess.ReadWrite,
                        FileShare.None,
                        4096,
                        FileOptions.DeleteOnClose);

                    acquired = true;
                }
                catch (IOException)
                {
                    // Файл заблокирован другим процессом, ждем
                    await Task.Delay(500, cancellationToken);
                }
            }

            _logger.LogInformation("[GPU] VRAM успешно заблокирована: {Context}", contextName);
            return new GpuLockReleaser(_inProcessLock, lockFileStream!, contextName, _logger);
        }
        catch (Exception ex)
        {
            lockFileStream?.Dispose();
            _inProcessLock.Release();

            if (ex is OperationCanceledException)
            {
                _logger.LogInformation("[GPU] Захват VRAM отменен: {Context}", contextName);
            }
            else
            {
                _logger.LogError(ex, "[GPU] Сбой захвата блокировки VRAM: {Context}", contextName);
            }

            throw;
        }
    }

    public Task CleanMemoryAsync(CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        _logger.LogInformation("[GPU] Очистка нативных ресурсов и сборка мусора перед освобождением VRAM...");
        GC.Collect(GC.MaxGeneration, GCCollectionMode.Aggressive, blocking: true, compacting: true);
        GC.WaitForPendingFinalizers();
        return Task.CompletedTask;
    }

    public bool IsGpuAvailable() => true;

    private sealed class GpuLockReleaser : IAsyncDisposable
    {
        private readonly SemaphoreSlim _inProcessLock;
        private readonly FileStream _lockFileStream;
        private readonly string _contextName;
        private readonly ILogger _logger;
        private bool _disposed;

        public GpuLockReleaser(SemaphoreSlim inProcessLock, FileStream lockFileStream, string contextName, ILogger logger)
        {
            _inProcessLock = inProcessLock;
            _lockFileStream = lockFileStream;
            _contextName = contextName;
            _logger = logger;
        }

        public ValueTask DisposeAsync()
        {
            if (_disposed) return ValueTask.CompletedTask;

            try
            {
                _lockFileStream.Dispose();
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "[GPU] Предупреждение при освобождении файлового лока: {Context}", _contextName);
            }
            finally
            {
                _inProcessLock.Release();
                _logger.LogInformation("[GPU] VRAM освобождена: {Context}", _contextName);
                _disposed = true;
            }

            return ValueTask.CompletedTask;
        }
    }
}