using System.ComponentModel;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;
using Microsoft.Extensions.Logging;

namespace Kernel.Platform.Process;

public sealed class ProcessSupervisor : IProcessSupervisor
{
    private const int MaxOutputRetentionChars = 64 * 1024; // 64 KB кольцевой буфер под логи ошибок
    private readonly ILogger<ProcessSupervisor> _logger;
    private readonly SafeJobHandle? _jobHandle;
    private bool _disposed;

    public ProcessSupervisor(ILogger<ProcessSupervisor> logger)
    {
        _logger = logger;
        if (RuntimeInformation.IsOSPlatform(OSPlatform.Windows))
        {
            _jobHandle = CreateWindowsJobObject();
            _logger.LogInformation("Инициализирован защитный Windows Job Object.");
        }
    }

    public void TrackProcess(System.Diagnostics.Process process)
    {
        ArgumentNullException.ThrowIfNull(process);

        if (RuntimeInformation.IsOSPlatform(OSPlatform.Windows) && _jobHandle is { IsInvalid: false })
        {
            if (!AssignProcessToJobObject(_jobHandle, process.Handle))
            {
                var error = Marshal.GetLastPInvokeError();
                var ex = new Win32Exception(error);
                _logger.LogError(ex, "Не удалось включить PID={Pid} в Job Object. Код: {Code}", process.Id, error);
                throw new InvalidOperationException($"Сбой изоляции процесса PID={process.Id}: {ex.Message}", ex);
            }
        }
    }

    public async Task<ProcessExecutionResult> RunAsync(
        string fileName,
        string arguments,
        string? workingDirectory = null,
        IReadOnlyDictionary<string, string>? environmentVariables = null,
        Action<string>? onStdOut = null,
        Action<string>? onStdErr = null,
        CancellationToken cancellationToken = default)
    {
        ObjectDisposedException.ThrowIf(_disposed, this);

        var psi = new ProcessStartInfo
        {
            FileName = fileName,
            Arguments = arguments,
            WorkingDirectory = workingDirectory ?? Directory.GetCurrentDirectory(),
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            UseShellExecute = false,
            CreateNoWindow = true
        };

        if (environmentVariables != null)
        {
            foreach (var (k, v) in environmentVariables)
            {
                psi.EnvironmentVariables[k] = v;
            }
        }

        using var process = new System.Diagnostics.Process { StartInfo = psi };
        var stdoutBuilder = new CappedTextBuffer(MaxOutputRetentionChars);
        var stderrBuilder = new CappedTextBuffer(MaxOutputRetentionChars);

        process.OutputDataReceived += (_, e) =>
        {
            if (e.Data == null) return;
            stdoutBuilder.AppendLine(e.Data);
            onStdOut?.Invoke(e.Data);
        };

        process.ErrorDataReceived += (_, e) =>
        {
            if (e.Data == null) return;
            stderrBuilder.AppendLine(e.Data);
            onStdErr?.Invoke(e.Data);
        };

        _logger.LogDebug("Запуск процесса: {FileName} {Arguments}", fileName, arguments);
        if (!process.Start())
        {
            throw new InvalidOperationException($"Не удалось запустить процесс: {fileName}");
        }

        try
        {
            TrackProcess(process);
        }
        catch
        {
            KillProcessTree(process);
            throw;
        }

        process.BeginOutputReadLine();
        process.BeginErrorReadLine();

        try
        {
            await process.WaitForExitAsync(cancellationToken);
            return new ProcessExecutionResult(process.ExitCode, stdoutBuilder.ToString(), stderrBuilder.ToString());
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Завершение дочернего дерева процессов PID={Pid}", process.Id);
            KillProcessTree(process);
            throw;
        }
    }

    private void KillProcessTree(System.Diagnostics.Process process)
    {
        try
        {
            if (!process.HasExited)
            {
                process.Kill(entireProcessTree: true);
            }
        }
        catch (Exception ex)
        {
            _logger.LogCritical(ex, "Ошибка принудительного завершения дерева процессов PID={Pid}", process.Id);
        }
    }

    private static SafeJobHandle CreateWindowsJobObject()
    {
        var job = CreateJobObject(IntPtr.Zero, null);
        if (job.IsInvalid)
        {
            throw new Win32Exception(Marshal.GetLastPInvokeError());
        }

        var info = new JOBOBJECT_EXTENDED_LIMIT_INFORMATION
        {
            BasicLimits = new JOBOBJECT_BASIC_LIMIT_INFORMATION
            {
                LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE
            }
        };

        var length = Marshal.SizeOf<JOBOBJECT_EXTENDED_LIMIT_INFORMATION>();
        var ptr = Marshal.AllocHGlobal(length);
        try
        {
            Marshal.StructureToPtr(info, ptr, false);
            if (!SetInformationJobObject(job, JobObjectExtendedLimitInformation, ptr, (uint)length))
            {
                var error = Marshal.GetLastPInvokeError();
                job.Dispose();
                throw new Win32Exception(error);
            }
        }
        finally
        {
            Marshal.FreeHGlobal(ptr);
        }

        return job;
    }

    public void Dispose()
    {
        if (_disposed) return;
        _jobHandle?.Dispose();
        _disposed = true;
    }

    private sealed class CappedTextBuffer
    {
        private readonly int _maxChars;
        private readonly StringBuilder _sb = new();
        private readonly object _lock = new();

        public CappedTextBuffer(int maxChars) => _maxChars = maxChars;

        public void AppendLine(string line)
        {
            lock (_lock)
            {
                if (_sb.Length > _maxChars)
                {
                    _sb.Remove(0, _sb.Length - (_maxChars / 2));
                }
                _sb.AppendLine(line);
            }
        }

        public override string ToString()
        {
            lock (_lock) return _sb.ToString();
        }
    }

    private const int JobObjectExtendedLimitInformation = 9;
    private const uint JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE = 0x2000;

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern SafeJobHandle CreateJobObject(IntPtr lpJobAttributes, string? lpName);

    [DllImport("kernel32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool SetInformationJobObject(SafeJobHandle hJob, int JobObjectInfoClass, IntPtr lpJobObjectInfo, uint cbJobObjectInfoLength);

    [DllImport("kernel32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool AssignProcessToJobObject(SafeJobHandle hJob, IntPtr hProcess);

    [StructLayout(LayoutKind.Sequential)]
    private struct IO_COUNTERS
    {
        public ulong ReadOperationCount, WriteOperationCount, OtherOperationCount;
        public ulong ReadTransferCount, WriteTransferCount, OtherTransferCount;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct JOBOBJECT_BASIC_LIMIT_INFORMATION
    {
        public long PerProcessUserTimeLimit, PerJobUserTimeLimit;
        public uint LimitFlags;
        public nuint MinimumWorkingSetSize, MaximumWorkingSetSize;
        public uint ActiveProcessLimit;
        public nuint Affinity;
        public uint PriorityClass, SchedulingClass;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct JOBOBJECT_EXTENDED_LIMIT_INFORMATION
    {
        public JOBOBJECT_BASIC_LIMIT_INFORMATION BasicLimits;
        public IO_COUNTERS IoInfo;
        public nuint ProcessMemoryLimit, JobMemoryLimit, PeakProcessMemoryLimit, PeakJobMemoryLimit;
    }
}
