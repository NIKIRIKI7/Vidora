namespace MotionContext.Domain.Ports;

public interface INodeEnvironmentResolver
{
    Task<string> EnsureNodeExecutableAsync(CancellationToken ct = default);
    string ResolveRemotionCliScript();
    string ResolveMasterWorkspaceDirectory();
    IReadOnlyDictionary<string, string> BuildExecutionEnvironment(string nodeExecutablePath);
}
