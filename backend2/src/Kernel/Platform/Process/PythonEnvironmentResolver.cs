using Kernel.Platform.Config;
using Microsoft.Extensions.Options;

namespace Kernel.Platform.Process;

public sealed class PythonEnvironmentResolver : IPythonEnvironmentResolver
{
    private readonly AppStorageConfig _storageConfig;

    public PythonEnvironmentResolver(IOptions<AppStorageConfig> storageConfig)
    {
        _storageConfig = storageConfig.Value;
    }

    public string ResolvePythonExecutable(string? venvName = null)
    {
        var targetVenv = string.IsNullOrWhiteSpace(venvName) ? _storageConfig.PythonVenvName : venvName;
        string[] candidates = OperatingSystem.IsWindows()
            ? [
                Path.Combine(Directory.GetCurrentDirectory(), targetVenv, "Scripts", "python.exe"),
                Path.Combine(AppContext.BaseDirectory, targetVenv, "Scripts", "python.exe"),
                "python.exe"
            ]
            : [
                Path.Combine(Directory.GetCurrentDirectory(), targetVenv, "bin", "python3"),
                Path.Combine(AppContext.BaseDirectory, targetVenv, "bin", "python3"),
                "python3"
            ];

        foreach (var candidate in candidates)
        {
            if (candidate.Contains(Path.DirectorySeparatorChar) && File.Exists(candidate))
            {
                return Path.GetFullPath(candidate);
            }
        }
        return candidates[^1];
    }

    public string ResolveScriptPath(string relativeScriptPath)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(relativeScriptPath);
        string[] candidates =
        [
            Path.Combine(Directory.GetCurrentDirectory(), relativeScriptPath),
            Path.Combine(AppContext.BaseDirectory, relativeScriptPath),
            Path.Combine(Directory.GetCurrentDirectory(), _storageConfig.ScriptsDir, Path.GetFileName(relativeScriptPath)),
            Path.Combine(AppContext.BaseDirectory, _storageConfig.ScriptsDir, Path.GetFileName(relativeScriptPath))
        ];

        foreach (var candidate in candidates)
        {
            if (File.Exists(candidate))
            {
                return Path.GetFullPath(candidate);
            }
        }
        throw new FileNotFoundException($"Скрипт не найден: {relativeScriptPath}.");
    }
}
