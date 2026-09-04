namespace MotionContext.Infrastructure.Remotion;

public interface IWorkspaceLinker
{
    void LinkDirectory(string linkPath, string targetPath);
    void RemoveLink(string linkPath);
}
