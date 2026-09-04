using Kernel.Contracts;
using Kernel.Platform.Config;
using Kernel.Platform.FileSystem;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using MotionContext.Domain.Entities;
using MotionContext.Domain.Ports;
using MotionContext.Domain.ValueObjects;

namespace MotionContext.Infrastructure.Remotion;

public sealed class RemotionWorkspaceManager : IRemotionWorkspaceManager
{
    private readonly IPathResolver _pathResolver;
    private readonly INodeEnvironmentResolver _nodeResolver;
    private readonly IWorkspaceLinker _linker;
    private readonly IRemotionTemplateRenderer _templateRenderer;
    private readonly AppStorageConfig _storageConfig;
    private readonly ILogger<RemotionWorkspaceManager> _logger;

    public RemotionWorkspaceManager(
        IPathResolver pathResolver,
        INodeEnvironmentResolver nodeResolver,
        IWorkspaceLinker linker,
        IRemotionTemplateRenderer templateRenderer,
        IOptions<AppStorageConfig> storageConfig,
        ILogger<RemotionWorkspaceManager> logger)
    {
        _pathResolver = pathResolver;
        _nodeResolver = nodeResolver;
        _linker = linker;
        _templateRenderer = templateRenderer;
        _storageConfig = storageConfig.Value;
        _logger = logger;
    }

    public async Task<WorkspaceMount> PrepareWorkspaceAsync(
        SceneCode sceneCode,
        SceneRevision revision,
        RenderJobId jobId,
        MontageSettingsDto? montageSettings = null,
        CancellationToken ct = default)
    {
        var baseTemp = Path.Combine(_storageConfig.DataStorageDir, "temp", "remotion", jobId.Value);
        var safeDir = _pathResolver.ResolveSafePath(baseTemp);
        Directory.CreateDirectory(safeDir);

        _logger.LogInformation("[Workspace] Подготовка рабочей папки рендера: {Dir}", safeDir);

        var masterWorkspace = _nodeResolver.ResolveMasterWorkspaceDirectory();
        var masterNodeModules = Path.Combine(masterWorkspace, "node_modules");

        _linker.LinkDirectory(Path.Combine(safeDir, "node_modules"), masterNodeModules);
        CopyStaticConfigs(masterWorkspace, safeDir);

        var theme = MontageTheme.FromDto(montageSettings);
        var composition = sceneCode.Composition;

        var sceneFile = Path.Combine(safeDir, "SceneComponent.tsx");
        await File.WriteAllTextAsync(sceneFile, revision.SourceCode.Value, ct);

        var inputPropsObj = new
        {
            montage = montageSettings ?? new MontageSettingsDto(),
            theme,
            durationInFrames = composition.DurationInFrames,
            fps = composition.Fps
        };
        var propsFile = Path.Combine(safeDir, "inputProps.json");
        await File.WriteAllTextAsync(propsFile, _templateRenderer.RenderInputPropsJson(inputPropsObj), ct);

        var rootFile = Path.Combine(safeDir, "Root.tsx");
        await File.WriteAllTextAsync(rootFile, _templateRenderer.RenderRootTsx(composition, inputPropsObj), ct);

        var stylesFile = Path.Combine(safeDir, "styles.css");
        await File.WriteAllTextAsync(stylesFile, _templateRenderer.RenderStylesCss(theme), ct);

        var outputVideoPath = _pathResolver.ResolveSafePath(Path.Combine(safeDir, $"{jobId.Value}.mp4"));

        _logger.LogInformation("[Workspace] Окружение готово: {Root} → {Output}", rootFile, outputVideoPath);
        return new WorkspaceMount(safeDir, rootFile, propsFile, outputVideoPath);
    }

    public Task CleanupWorkspaceAsync(string workspaceDirectory, CancellationToken ct = default)
    {
        try
        {
            var safeDir = _pathResolver.ResolveSafePath(workspaceDirectory);
            if (Directory.Exists(safeDir))
            {
                _linker.RemoveLink(Path.Combine(safeDir, "node_modules"));
                Directory.Delete(safeDir, recursive: true);
                _logger.LogInformation("[Workspace] Очищена папка рендера: {Dir}", safeDir);
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "[Workspace] Ошибка удаления рабочей папки: {Dir}", workspaceDirectory);
        }

        return Task.CompletedTask;
    }

    private static void CopyStaticConfigs(string masterDir, string targetDir)
    {
        string[] configFiles = ["tsconfig.json", "tailwind.config.js", "postcss.config.js"];
        foreach (var file in configFiles)
        {
            var src = Path.Combine(masterDir, file);
            var dst = Path.Combine(targetDir, file);
            if (File.Exists(src))
            {
                File.Copy(src, dst, overwrite: true);
            }
        }
    }
}
