namespace MotionContext.Infrastructure.Remotion;

internal interface IWorkspaceLinker
{
    void LinkDirectory(string linkPath, string targetPath);
    void RemoveLink(string linkPath);
}
