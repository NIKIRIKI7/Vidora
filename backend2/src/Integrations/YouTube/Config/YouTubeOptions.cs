namespace Integrations.YouTube.Config;

public sealed class YouTubeOptions
{
    public const string SectionName = "YouTube";

    /// <summary>
    /// Официальный API-ключ Google/YouTube Data API v3 (опционально, резервный канал).
    /// </summary>
    public string? ApiKey { get; set; }

    public string? YtDlpExecutablePath { get; set; }
    public string DownloadDirectory { get; set; } = string.Empty;
    public string ToolsDir { get; set; } = string.Empty;
    public int ScrapeTimeoutSeconds { get; set; } = 30;
    public int SearchTimeoutSeconds { get; set; } = 60;
    public int DownloadTimeoutSeconds { get; set; } = 600;

    public string ResolveYtDlpExecutable()
    {
        if (!string.IsNullOrWhiteSpace(YtDlpExecutablePath) && File.Exists(YtDlpExecutablePath))
        {
            return Path.GetFullPath(YtDlpExecutablePath);
        }

        var toolsDir = string.IsNullOrWhiteSpace(ToolsDir) ? "tools" : ToolsDir;
        string executableName = OperatingSystem.IsWindows() ? "yt-dlp.exe" : "yt-dlp";
        string[] candidateSubPaths =
        [
            Path.Combine(toolsDir, executableName),
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
