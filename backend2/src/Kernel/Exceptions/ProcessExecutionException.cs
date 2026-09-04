namespace Kernel.Exceptions;

/// <summary>
/// Выбрасывается при аварийном завершении системного или внешнего CLI-подпроцесса (FFmpeg, Python, yt-dlp).
/// </summary>
public class ProcessExecutionException : DomainException
{
    public int ExitCode { get; }
    public string StandardError { get; }

    public ProcessExecutionException(
        string processName, 
        int exitCode, 
        string standardError, 
        string? target = null, 
        Exception? inner = null)
        : base(
            $"[Process:{processName}] Сбой выполнения подпроцесса с кодом {exitCode}: {standardError}",
            "PROCESS_EXECUTION_FAILED",
            502,
            new { Process = processName, ExitCode = exitCode, Target = target, Error = standardError },
            inner)
    {
        ExitCode = exitCode;
        StandardError = standardError;
    }
}
