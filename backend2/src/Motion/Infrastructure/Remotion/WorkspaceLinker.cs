using System.Diagnostics;
using Microsoft.Extensions.Logging;

namespace MotionContext.Infrastructure.Remotion;

public sealed class WorkspaceLinker : IWorkspaceLinker
{
    private readonly ILogger<WorkspaceLinker> _logger;

    public WorkspaceLinker(ILogger<WorkspaceLinker> logger)
    {
        _logger = logger;
    }

    public void LinkDirectory(string linkPath, string targetPath)
    {
        if (!Directory.Exists(targetPath))
        {
            throw new DirectoryNotFoundException(
                $"Мастер-каталог node_modules не найден: {targetPath}. " +
                $"Выполните 'npm install' в tools/remotion_workspace/.");
        }

        if (Directory.Exists(linkPath)) return;

        if (OperatingSystem.IsWindows())
        {
            using var proc = Process.Start(new ProcessStartInfo
            {
                FileName = "cmd.exe",
                Arguments = $"/c mklink /J \"{linkPath}\" \"{targetPath}\"",
                CreateNoWindow = true,
                UseShellExecute = false,
                RedirectStandardError = true
            });
            proc?.WaitForExit();

            if (proc?.ExitCode != 0 || !Directory.Exists(linkPath))
            {
                var err = proc?.StandardError.ReadToEnd() ?? string.Empty;
                _logger.LogWarning("[Linker] mklink /J failed ({Code}): {Err}. Fallback to symlink.", proc?.ExitCode, err);
                Directory.CreateSymbolicLink(linkPath, targetPath);
            }
            else
            {
                _logger.LogDebug("[Linker] NTFS Junction создан: {Link} → {Target}", linkPath, targetPath);
            }
        }
        else
        {
            Directory.CreateSymbolicLink(linkPath, targetPath);
        }
    }

    public void RemoveLink(string linkPath)
    {
        if (!Directory.Exists(linkPath)) return;

        if (OperatingSystem.IsWindows())
        {
            using var proc = Process.Start(new ProcessStartInfo
            {
                FileName = "cmd.exe",
                Arguments = $"/c rmdir \"{linkPath}\"",
                CreateNoWindow = true,
                UseShellExecute = false
            });
            proc?.WaitForExit();
        }
        else
        {
            Directory.Delete(linkPath);
        }
    }
}
