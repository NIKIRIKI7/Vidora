using System.ComponentModel.DataAnnotations;

namespace Kernel.Platform.Config;

public sealed class AppStorageConfig
{
    public const string SectionName = "Storage";

    public string[] AllowedRoots { get; set; } = [];

    [Required(ErrorMessage = "В appsettings.json отсутствует обязательный параметр Storage:DataStorageDir")]
    public string DataStorageDir { get; set; } = string.Empty;

    [Required(ErrorMessage = "В appsettings.json отсутствует обязательный параметр Storage:ModelsDir")]
    public string ModelsDir { get; set; } = string.Empty;

    [Required(ErrorMessage = "В appsettings.json отсутствует обязательный параметр Storage:ProjectsDir")]
    public string ProjectsDir { get; set; } = string.Empty;

    [Required(ErrorMessage = "В appsettings.json отсутствует обязательный параметр Storage:TempDir")]
    public string TempDir { get; set; } = string.Empty;

    [Required(ErrorMessage = "В appsettings.json отсутствует обязательный параметр Storage:MusicDir")]
    public string MusicDir { get; set; } = string.Empty;

    [Required(ErrorMessage = "В appsettings.json отсутствует обязательный параметр Storage:ToolsDir")]
    public string ToolsDir { get; set; } = string.Empty;

    [Required(ErrorMessage = "В appsettings.json отсутствует обязательный параметр Storage:RemotionWorkspaceDir")]
    public string RemotionWorkspaceDir { get; set; } = string.Empty;

    public string GetModelsDirectory() =>
        Path.Combine(DataStorageDir, ModelsDir).Replace('\\', '/');

    public string GetModelPath(string subPath) =>
        Path.Combine(DataStorageDir, ModelsDir, subPath).Replace('\\', '/');

    public string GetProjectsDirectory() =>
        Path.Combine(DataStorageDir, ProjectsDir).Replace('\\', '/');

    public string GetTempDirectory(string? sub = null) =>
        string.IsNullOrWhiteSpace(sub)
            ? Path.Combine(DataStorageDir, TempDir).Replace('\\', '/')
            : Path.Combine(DataStorageDir, TempDir, sub).Replace('\\', '/');

    public string GetMusicDirectory() =>
        Path.Combine(DataStorageDir, MusicDir).Replace('\\', '/');

    public string GetDatabasePath(string dbName) =>
        Path.Combine(DataStorageDir, $"{dbName}.db").Replace('\\', '/');

    public string GetToolPath(string toolName) =>
        Path.Combine(ToolsDir, toolName).Replace('\\', '/');

    public string GetLogFilePath() =>
        Path.Combine(DataStorageDir, "app_events.jsonl").Replace('\\', '/');

    public string GetRemotionWorkspace() =>
        RemotionWorkspaceDir.Replace('\\', '/');
}
