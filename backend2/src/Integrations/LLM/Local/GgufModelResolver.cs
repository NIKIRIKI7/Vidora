using System.Text.RegularExpressions;
using Kernel.Platform.Config;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace Integrations.LLM.Local;

public interface IGgufModelResolver
{
    IReadOnlyList<string> FindAllGgufFiles();
    string? ResolveModel(string engineName);
    string? ResolveDraftModel(string targetModelPath);
}

public sealed partial class GgufModelResolver : IGgufModelResolver
{
    private static readonly string[] ModelFamilies = ["gemma", "qwen", "llama", "deepseek", "mistral", "phi"];
    private readonly AppStorageConfig _storageConfig;
    private readonly ILogger<GgufModelResolver> _logger;

    public GgufModelResolver(IOptions<AppStorageConfig> storageConfig, ILogger<GgufModelResolver> logger)
    {
        _storageConfig = storageConfig.Value;
        _logger = logger;
    }

    public IReadOnlyList<string> FindAllGgufFiles()
    {
        var found = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var searchDirs = GetCandidateDirectories();

        foreach (var dir in searchDirs)
        {
            if (!Directory.Exists(dir)) continue;

            try
            {
                foreach (var file in Directory.EnumerateFiles(dir, "*.gguf", SearchOption.AllDirectories))
                {
                    found.Add(Path.GetFullPath(file));
                }
            }
            catch (Exception ex)
            {
                _logger.LogDebug(ex, "[GgufResolver] Scan failed for {Dir}", dir);
            }
        }

        return found.OrderBy(f => f).ToList();
    }

    public string? ResolveModel(string engineName)
    {
        if (string.IsNullOrWhiteSpace(engineName)) return null;

        var allFiles = FindAllGgufFiles();
        if (allFiles.Count == 0) return null;

        var cleanTarget = CleanNameRegex().Replace(engineName.ToLowerInvariant(), "");
        foreach (var file in allFiles)
        {
            var fileNameClean = CleanNameRegex().Replace(Path.GetFileNameWithoutExtension(file).ToLowerInvariant(), "");
            if (!string.IsNullOrEmpty(cleanTarget) && (fileNameClean.Contains(cleanTarget) || cleanTarget.Contains(fileNameClean)))
            {
                return file;
            }
        }

        var engineLower = engineName.ToLowerInvariant();
        foreach (var family in ModelFamilies)
        {
            if (engineLower.Contains(family))
            {
                var match = allFiles.FirstOrDefault(f => Path.GetFileName(f).ToLowerInvariant().Contains(family));
                if (match != null) return match;
            }
        }

        return allFiles.Count == 1 ? allFiles[0] : null;
    }

    public string? ResolveDraftModel(string targetModelPath)
    {
        var allFiles = FindAllGgufFiles();
        var targetLower = Path.GetFileName(targetModelPath).ToLowerInvariant();
        var family = ModelFamilies.FirstOrDefault(f => targetLower.Contains(f));
        if (family == null) return null;

        return allFiles
            .Where(f => !string.Equals(f, targetModelPath, StringComparison.OrdinalIgnoreCase))
            .FirstOrDefault(f =>
            {
                var name = Path.GetFileName(f).ToLowerInvariant();
                return (name.Contains("1b") || name.Contains("0.5b") || name.Contains("draft")) && name.Contains(family);
            });
    }

    private List<string> GetCandidateDirectories()
    {
        var cwd = Directory.GetCurrentDirectory();
        var userProfile = Environment.GetFolderPath(Environment.SpecialFolder.UserProfile);
        var modelsDir = _storageConfig.GetModelsDirectory();

        return
        [
            Path.Combine(cwd, modelsDir),
            Path.Combine(AppContext.BaseDirectory, modelsDir),
            Path.Combine(userProfile, ".cache", "vidora-models")
        ];
    }

    [GeneratedRegex(@"[:\-_.\s/]+")]
    private static partial Regex CleanNameRegex();
}
