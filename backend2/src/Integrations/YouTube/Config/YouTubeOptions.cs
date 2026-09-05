namespace Integrations.YouTube.Config;

public sealed class YouTubeOptions
{
    public const string SectionName = "YouTube";

    /// <summary>
    /// Официальный API-ключ Google/YouTube Data API v3 (опционально).
    /// Если задан — используется для прямого обращения к API.
    /// Если пуст или квота исчерпана — автоматически включается fallback на yt-dlp.
    /// </summary>
    public string? ApiKey { get; set; }

    public string? PythonExecutablePath { get; set; }
    public string? YtMetadataScriptPath { get; set; }
    public string? YtDlpExecutablePath { get; set; }
    public string DownloadDirectory { get; set; } = "data_storage/temp/youtube";
    public int ScrapeTimeoutSeconds { get; set; } = 30;
    public int SearchTimeoutSeconds { get; set; } = 60;
    public int DownloadTimeoutSeconds { get; set; } = 600;

    public string ResolvePythonExecutable()
    {
        if (!string.IsNullOrWhiteSpace(PythonExecutablePath) && File.Exists(PythonExecutablePath))
        {
            return Path.GetFullPath(PythonExecutablePath);
        }

        string[] candidateSubPaths = OperatingSystem.IsWindows()
            ? [
                Path.Combine("tools", "yt_scrapper", "Scripts", "python.exe"),
                Path.Combine("tools", "yt_scrapper", "python.exe")
            ]
            : [
                Path.Combine("tools", "yt_scrapper", "bin", "python"),
                Path.Combine("tools", "yt_scrapper", "bin", "python3")
            ];

        foreach (var relativePath in candidateSubPaths)
        {
            var fromBase = Path.Combine(AppContext.BaseDirectory, relativePath);
            if (File.Exists(fromBase)) return Path.GetFullPath(fromBase);

            var fromCwd = Path.Combine(Directory.GetCurrentDirectory(), relativePath);
            if (File.Exists(fromCwd)) return Path.GetFullPath(fromCwd);
        }

        return OperatingSystem.IsWindows() ? "python.exe" : "python3";
    }

    public string ResolveMetadataScript()
    {
        if (!string.IsNullOrWhiteSpace(YtMetadataScriptPath) && File.Exists(YtMetadataScriptPath))
        {
            return Path.GetFullPath(YtMetadataScriptPath);
        }

        string[] candidateSubPaths =
        [
            Path.Combine("tools", "yt_metadata.py"),
            Path.Combine("src", "Integrations", "YouTube", "Scripts", "yt_metadata.py")
        ];

        foreach (var relativePath in candidateSubPaths)
        {
            var fromBase = Path.Combine(AppContext.BaseDirectory, relativePath);
            if (File.Exists(fromBase)) return Path.GetFullPath(fromBase);

            var fromCwd = Path.Combine(Directory.GetCurrentDirectory(), relativePath);
            if (File.Exists(fromCwd)) return Path.GetFullPath(fromCwd);
        }

        return Path.Combine(Directory.GetCurrentDirectory(), "tools", "yt_metadata.py");
    }

    public string ResolveYtDlpExecutable()
    {
        if (!string.IsNullOrWhiteSpace(YtDlpExecutablePath) && File.Exists(YtDlpExecutablePath))
        {
            return Path.GetFullPath(YtDlpExecutablePath);
        }

        string executableName = OperatingSystem.IsWindows() ? "yt-dlp.exe" : "yt-dlp";
        string[] candidateSubPaths =
        [
            Path.Combine("tools", executableName),
            executableName
        ];

        foreach (var relativePath in candidateSubPaths)
        {
            var fromBase = Path.Combine(AppContext.BaseDirectory, relativePath);
            if (File.Exists(fromBase)) return Path.GetFullPath(fromBase);

            var fromCwd = Path.Combine(Directory.GetCurrentDirectory(), relativePath);
            if (File.Exists(fromCwd)) return Path.GetFullPath(fromCwd);
        }

        return executableName;
    }
}
