namespace Kernel.Platform.FileSystem;

public static class ModelPathResolver
{
    private static readonly string[] RecognizedModelExtensions =
    [
        ".pt", ".safetensors", ".bin", ".onnx", ".pth", ".json", ".yaml", ".gguf"
    ];

    public static string? Locate(string targetPath, string? dataStorageDir)
    {
        var candidates = GetCandidatePaths(targetPath, dataStorageDir);
        foreach (var path in candidates)
        {
            if (File.Exists(path))
            {
                return Path.GetFullPath(path);
            }

            if (Directory.Exists(path) && DirectoryContainsModelFiles(path))
            {
                return Path.GetFullPath(path);
            }
        }

        return null;
    }

    public static bool DirectoryContainsModelFiles(string directoryPath)
    {
        if (!Directory.Exists(directoryPath)) return false;

        try
        {
            return Directory.EnumerateFiles(directoryPath, "*", SearchOption.AllDirectories)
                .Any(file =>
                {
                    var ext = Path.GetExtension(file).ToLowerInvariant();
                    return RecognizedModelExtensions.Contains(ext) || new FileInfo(file).Length > 1024 * 1024;
                });
        }
        catch
        {
            return false;
        }
    }

    public static IReadOnlyList<string> GetCandidatePaths(string targetPath, string? dataStorageDir)
    {
        var cleanTarget = targetPath.Replace('\\', '/').TrimStart('/');
        var dataDir = string.IsNullOrWhiteSpace(dataStorageDir)
            ? "data_storage"
            : dataStorageDir.Replace('\\', '/').TrimStart('/');
        var cwd = Directory.GetCurrentDirectory();

        var baseDirs = new List<string>
        {
            cwd,
            Path.Combine(cwd, "backend2"),
            AppContext.BaseDirectory,
            Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "..", "..", "..")),
            Path.GetFullPath(Path.Combine(cwd, ".."))
        };

        var modelsSubDir = "ai-models";
        var results = new List<string>();

        foreach (var baseDir in baseDirs)
        {
            if (cleanTarget.StartsWith($"{dataDir}/{modelsSubDir}/", StringComparison.OrdinalIgnoreCase))
            {
                results.Add(Path.Combine(baseDir, cleanTarget));
                var sub = cleanTarget[$"{dataDir}/{modelsSubDir}/".Length..];
                results.Add(Path.Combine(baseDir, modelsSubDir, sub));
            }
            else if (cleanTarget.StartsWith($"{modelsSubDir}/", StringComparison.OrdinalIgnoreCase))
            {
                var sub = cleanTarget[$"{modelsSubDir}/".Length..];
                results.Add(Path.Combine(baseDir, dataDir, modelsSubDir, sub));
                results.Add(Path.Combine(baseDir, dataDir, sub));
                results.Add(Path.Combine(baseDir, modelsSubDir, sub));
            }
            else
            {
                results.Add(Path.Combine(baseDir, dataDir, modelsSubDir, cleanTarget));
                results.Add(Path.Combine(baseDir, cleanTarget));
                results.Add(Path.Combine(baseDir, dataDir, cleanTarget));
                results.Add(Path.Combine(baseDir, modelsSubDir, cleanTarget));
            }
        }

        var userProfile = Environment.GetFolderPath(Environment.SpecialFolder.UserProfile);
        if (cleanTarget.Contains("whisper", StringComparison.OrdinalIgnoreCase))
        {
            results.Add(Path.Combine(userProfile, ".cache", "whisper", Path.GetFileName(cleanTarget)));
            results.Add(Path.Combine(userProfile, ".cache", "whisper", "small.pt"));
        }

        if (cleanTarget.Contains("omnivoice", StringComparison.OrdinalIgnoreCase))
        {
            results.Add(Path.Combine(userProfile, ".cache", "huggingface", "hub", "models--k2-fsa--OmniVoice"));
        }

        return results.Distinct(StringComparer.OrdinalIgnoreCase).ToList();
    }
}
