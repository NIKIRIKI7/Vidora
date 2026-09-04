using Microsoft.Extensions.Logging;

namespace Kernel.Platform.Gpu;

public sealed class GpuManager : IGpuManager
{
    private static readonly TimeSpan LockTimeout = TimeSpan.FromMinutes(5);
    private const string DefaultMutexName = @"Global\Vidora_Vram_Hardware_Lock";

    private readonly SemaphoreSlim _inProcessLock = new(1, 1);
    private readonly string _mutexName;
    private readonly ILogger<GpuManager> _logger;

    public GpuManager(ILogger<GpuManager> logger, string? customLockIdentifier = null)
    {
        _logger = logger;
        _mutexName = string.IsNullOrWhiteSpace(customLockIdentifier) ? DefaultMutexName : customLockIdentifier;
    }

    public async Task<IAsyncDisposable> AcquireGpuLockAsync(string contextName, CancellationToken cancellationToken = default)
    {
        _logger.LogDebug("[GPU] Ожидание внутрипроцессной блокировки VRAM: {Context}", contextName);
        await _inProcessLock.WaitAsync(cancellationToken);

        Mutex? systemMutex = null;
        bool hasHandle = false;

        try
        {
            systemMutex = new Mutex(false, _mutexName);

            _logger.LogDebug("[GPU] Ожидание системного мьютекса VRAM: {Context}", contextName);

            var waitTask = Task.Run(() =>
            {
                try
                {
                    return systemMutex.WaitOne(LockTimeout);
                }
                catch (AbandonedMutexException)
                {
                    return true;
                }
            }, cancellationToken);

            hasHandle = await waitTask;

            if (!hasHandle)
            {
                throw new TimeoutException($"Превышен таймаут ({LockTimeout.TotalSeconds} сек.) ожидания системной блокировки GPU для {contextName}");
            }

            _logger.LogInformation("[GPU] VRAM успешно заблокирована: {Context}", contextName);
            return new GpuLockReleaser(_inProcessLock, systemMutex, contextName, _logger);
        }
        catch (Exception ex)
        {
            if (hasHandle && systemMutex != null)
            {
                systemMutex.ReleaseMutex();
            }
            systemMutex?.Dispose();
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
        private readonly Mutex _systemMutex;
        private readonly string _contextName;
        private readonly ILogger _logger;
        private bool _disposed;

        public GpuLockReleaser(SemaphoreSlim inProcessLock, Mutex systemMutex, string contextName, ILogger logger)
        {
            _inProcessLock = inProcessLock;
            _systemMutex = systemMutex;
            _contextName = contextName;
            _logger = logger;
        }

        public ValueTask DisposeAsync()
        {
            if (_disposed) return ValueTask.CompletedTask;

            try
            {
                _systemMutex.ReleaseMutex();
                _systemMutex.Dispose();
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "[GPU] Предупреждение при освобождении системного мьютекса: {Context}", _contextName);
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
