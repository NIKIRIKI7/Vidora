namespace Kernel.Platform.Process;

public interface IPythonEnvironmentResolver
{
    string ResolvePythonExecutable(string? venvName = null);
    string ResolveScriptPath(string relativeScriptPath);
}
