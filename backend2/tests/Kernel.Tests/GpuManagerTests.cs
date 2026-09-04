using Kernel.Platform.Gpu;
using Microsoft.Extensions.Logging.Abstractions;
using Xunit;

namespace Kernel.Tests;

public class GpuManagerTests : IDisposable
{
    private readonly string _testLockFile;
    private readonly GpuManager _gpuManager;

    public GpuManagerTests()
    {
        // ponytail: Mutex on Windows can't contain '\' — use a short unique name
        _testLockFile = $"gpu_test_{Guid.NewGuid():N}";
        _gpuManager = new GpuManager(NullLogger<GpuManager>.Instance, _testLockFile);
    }

    [Fact]
    public async Task AcquireGpuLockAsync_NormalAcquisition_ShouldAcquireAndRelease()
    {
        await using (var handle = await _gpuManager.AcquireGpuLockAsync("Voice_TTS_Test"))
        {
            Assert.NotNull(handle);
        }
    }

    [Fact]
    public async Task AcquireGpuLockAsync_WhenCancelled_ShouldThrowAndNotRetainLock()
    {
        using var cts = new CancellationTokenSource();
        cts.Cancel();

        await Assert.ThrowsAnyAsync<OperationCanceledException>(async () =>
        {
            await _gpuManager.AcquireGpuLockAsync("Cancelled_Task", cts.Token);
        });

        await using var handle = await _gpuManager.AcquireGpuLockAsync("Subsequent_Task");
        Assert.NotNull(handle);
    }

    [Fact]
    public async Task CleanMemoryAsync_ShouldExecuteSuccessfully()
    {
        await _gpuManager.CleanMemoryAsync();
    }

    public void Dispose()
    {
        // No file to clean up — _testLockFile is a mutex name, not a path
    }
}
