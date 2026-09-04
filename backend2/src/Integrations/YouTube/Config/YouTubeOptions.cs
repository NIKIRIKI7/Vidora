namespace Integrations.YouTube.Config;

public sealed class YouTubeOptions
{
    public const string SectionName = "YouTube";

    /// <summary>
    /// Путь к интерпретатору python из созданного venv yt_scrapper.
    /// Если не указан, разрешается автоматически относительно каталога tools/.
    /// </summary>
    public string? PythonExecutablePath { get; set; }

    /// <summary>
    /// Путь к Python-скрипту враппера yt_metadata.py.
    /// </summary>
    public string? YtMetadataScriptPath { get; set; }

    /// <summary>
    /// Путь к бинарнику yt-dlp.
    /// </summary>
    public string? YtDlpExecutablePath { get; set; }

    /// <summary>
    /// Временная директория для сохранения скачиваемых медиафайлов.
    /// </summary>
    public string DownloadDirectory { get; set; } = "data_storage/temp/youtube";

    /// <summary>
    /// Таймаут на скрапинг метаданных в секундах.
    /// </summary>
    public int ScrapeTimeoutSeconds { get; set; } = 30;

    /// <summary>
    /// Таймаут на скачивание медиа в секундах.
    /// </summary>
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
