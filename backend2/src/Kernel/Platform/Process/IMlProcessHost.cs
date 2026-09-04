namespace Kernel.Platform.Process;

public interface IMlProcessHost
{
    Task<ProcessExecutionResult> ExecuteScriptAsync(
        string scriptRelativePath,
        object? jsonPayload = null,
        string? additionalArguments = null,
        string? contextName = null,
        bool acquireGpuLock = true,
        CancellationToken cancellationToken = default);
}
