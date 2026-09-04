namespace Kernel.Platform.Process;

public interface IProcessSupervisor : IDisposable
{
    Task<ProcessExecutionResult> RunAsync(
        string fileName,
        string arguments,
        string? workingDirectory = null,
        IReadOnlyDictionary<string, string>? environmentVariables = null,
        Action<string>? onStdOut = null,
        Action<string>? onStdErr = null,
        CancellationToken cancellationToken = default);

    void TrackProcess(System.Diagnostics.Process process);
}

public sealed record ProcessExecutionResult(int ExitCode, string StandardOutput, string StandardError);
