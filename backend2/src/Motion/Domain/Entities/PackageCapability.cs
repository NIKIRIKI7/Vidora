using Kernel.Exceptions;

namespace MotionContext.Domain.Entities;

public sealed class PackageCapability
{
    public string Id { get; }
    public string PackageName { get; }
    public IReadOnlyList<string> AllowedImports { get; }
    public bool IsVisualComponent { get; }
    public string PromptGuideline { get; }

    public PackageCapability(
        string id,
        string packageName,
        IEnumerable<string> allowedImports,
        bool isVisualComponent,
        string promptGuideline)
    {
        if (string.IsNullOrWhiteSpace(id))
            throw new ValidationException("capability_id", "Идентификатор пакета возможностей обязателен.");
        if (string.IsNullOrWhiteSpace(packageName))
            throw new ValidationException("package_name", "Имя npm-пакета обязательно.");

        Id = id.Trim().ToLowerInvariant();
        PackageName = packageName.Trim();
        AllowedImports = allowedImports.Select(i => i.Trim()).Where(i => !string.IsNullOrWhiteSpace(i)).ToList();
        IsVisualComponent = isVisualComponent;
        PromptGuideline = promptGuideline?.Trim() ?? string.Empty;
    }
}
