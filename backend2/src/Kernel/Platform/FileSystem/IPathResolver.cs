namespace Kernel.Platform.FileSystem;

public interface IPathResolver
{
    string ResolveSafePath(string path, string? subRoot = null);
    bool IsSafePath(string path, string? subRoot = null);
    void RegisterAllowedRoot(string rootDirectory);
    string SanitizeFileName(string fileName);
}
