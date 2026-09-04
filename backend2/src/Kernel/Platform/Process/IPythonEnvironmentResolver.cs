namespace Kernel.Platform.Process;

public interface IPythonEnvironmentResolver
{
    string ResolvePythonExecutable(string venvName = ".venv-voice");
    string ResolveScriptPath(string relativeScriptPath);
}
