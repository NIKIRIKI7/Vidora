using Kernel.Platform.Process;
using Microsoft.Extensions.Logging.Abstractions;
using Xunit;

namespace Kernel.Tests;

public class ProcessSupervisorTests
{
    private readonly ProcessSupervisor _supervisor = new(NullLogger<ProcessSupervisor>.Instance);

    [Fact]
    public async Task RunAsync_SimpleCommand_ShouldReturnSuccessExitCode()
    {
        string fileName = OperatingSystem.IsWindows() ? "cmd.exe" : "echo";
        string args = OperatingSystem.IsWindows() ? "/c echo VIDORA_PROCESS_OK" : "VIDORA_PROCESS_OK";

        var result = await _supervisor.RunAsync(fileName, args);

        Assert.Equal(0, result.ExitCode);
        Assert.Contains("VIDORA_PROCESS_OK", result.StandardOutput);
    }

    [Fact]
    public async Task RunAsync_WhenCancelled_ShouldTerminateTreeAndThrow()
    {
        using var cts = new CancellationTokenSource();

        string fileName = OperatingSystem.IsWindows() ? "ping" : "sleep";
        string args = OperatingSystem.IsWindows() ? "127.0.0.1 -n 10" : "10";

        var task = _supervisor.RunAsync(fileName, args, cancellationToken: cts.Token);

        // Прерываем процесс через 200 мс
        await Task.Delay(200);
        await cts.CancelAsync();

        await Assert.ThrowsAnyAsync<OperationCanceledException>(async () => await task);
    }
}
