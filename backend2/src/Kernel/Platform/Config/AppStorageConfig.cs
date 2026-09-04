namespace Kernel.Platform.Config;

public sealed class AppStorageConfig
{
    public const string SectionName = "Storage";

    public string[] AllowedRoots { get; set; } = [];
    public string ProjectsDir { get; set; } = "projects";
    public string DataStorageDir { get; set; } = "data_storage";
    public string ModelsDir { get; set; } = "ai-models";
}
