using Kernel.Exceptions;

namespace Kernel.Platform.Process;

public sealed class PythonEnvironmentResolver : IPythonEnvironmentResolver
{
    public string ResolvePythonExecutable(string venvName = ".venv-voice")
    {
        string[] candidates = OperatingSystem.IsWindows()
            ? [
                Path.Combine(Directory.GetCurrentDirectory(), venvName, "Scripts", "python.exe"),
                Path.Combine(AppContext.BaseDirectory, venvName, "Scripts", "python.exe"),
                "python.exe"
            ]
            : [
                Path.Combine(Directory.GetCurrentDirectory(), venvName, "bin", "python3"),
                Path.Combine(AppContext.BaseDirectory, venvName, "bin", "python3"),
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
            Path.Combine(AppContext.BaseDirectory, relativeScriptPath)
        ];

        foreach (var candidate in candidates)
        {
            if (File.Exists(candidate))
            {
                return Path.GetFullPath(candidate);
            }
        }

        throw new FileNotFoundException($"Скрипт подсистемы не найден: {relativeScriptPath}. Убедитесь, что инструменты развернуты корректно.");
    }
}
