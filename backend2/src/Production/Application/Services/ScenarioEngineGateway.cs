using Kernel.Exceptions;
using Kernel.Platform.Config;
using Kernel.Platform.FileSystem;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using ProductionContext.Domain.Entities;
using ProductionContext.Domain.Ports;
using ProductionContext.Domain.ScenarioEngine;
using ProductionContext.Domain.Services;
using ProductionContext.Domain.ValueObjects;

namespace ProductionContext.Application.Services;

/// <summary>Результат двусторонней синхронизации сценария через Шлюз.</summary>
public sealed record EngineSyncResponse(
    string FormattedMarkdown,
    ScenarioAstDocument AstTree,
    IReadOnlyList<ScenarioIssue> Issues,
    double ComputedDurationSeconds);

/// <summary>Результат stateless-проверки черновика (парсинг + линтер, без сохранения в БД).</summary>
public sealed record DraftLintResponse(
    IReadOnlyList<ScenarioIssue> Issues,
    double ComputedDurationSeconds);

/// <summary>
/// Единый Шлюз (Facade/Mediator) Сценарного движка — точка входа для UI.
/// Оркестрирует: левый блок (парсинг Markdown -&gt; AST, сериализация обратно),
/// валидацию медиа-ассетов в песочнице файловой системы и правый блок (эвристический линтер).
/// </summary>
public sealed class ScenarioEngineGateway
{
    private readonly IProjectRepository _projectRepo;
    private readonly IScenarioAstService _astParser;
    private readonly ScenarioLinter _linter;
    private readonly IPathResolver _pathResolver;
    private readonly AppStorageConfig _storageConfig;
    private readonly ILogger<ScenarioEngineGateway> _logger;

    public ScenarioEngineGateway(
        IProjectRepository projectRepo,
        IScenarioAstService astParser,
        ScenarioLinter linter,
        IPathResolver pathResolver,
        IOptions<AppStorageConfig> storageConfig,
        ILogger<ScenarioEngineGateway> logger)
    {
        _projectRepo = projectRepo;
        _astParser = astParser;
        _linter = linter;
        _pathResolver = pathResolver;
        _storageConfig = storageConfig.Value;
        _logger = logger;
    }

    /// <summary>
    /// Двусторонняя синхронизация: принимает Markdown от редактора, строит AST,
    /// обновляет сцены в БД, проверяет привязанные файлы (B-roll/анимации/SFX) в
    /// песочнице, пересчитывает тайминги и возвращает идеальный Markdown + замечания линтера.
    /// </summary>
    public async Task<EngineSyncResponse> SyncMarkdownAsync(
        string projectId,
        string rawMarkdown,
        CancellationToken ct = default)
    {
        if (!ProjectId.TryParse(projectId, out var id))
        {
            throw new ResourceNotFoundException("Project", projectId);
        }

        var project = await _projectRepo.GetByIdAsync(id, ct)
            ?? throw new ResourceNotFoundException("Project", projectId);

        // 1. Левый блок: Markdown -> AST + доменные сущности
        var ast = _astParser.ParseToAst(rawMarkdown);
        var parsedScenes = _astParser.MapAstToEntities(id, ast);
        project.SetScenes(parsedScenes);

        // 2. Валидация ассетов через песочницу (B-roll checker / анимации / SFX)
        ValidateLinkedAssets(project, ast);

        // 3. Физика времени: каскадный пересчёт таймкодов (SSOT для рендера)
        project.RecalculateTimeline();

        // 4. Персист: исходный Markdown на диск + сцены/фрагменты в БД
        await WriteScenarioToDiskAsync(project, rawMarkdown, ct);
        await _projectRepo.UpdateAsync(project, ct);
        await _projectRepo.SaveChangesAsync(ct);

        // 5. Правый блок: эвристический линтер + AST-подсказки (SFX на динамику)
        var issues = _linter.LintProject(project).ToList();
        issues.AddRange(BuildAstSuggestions(project, ast));

        var formattedMarkdown = _astParser.SerializeAstToMarkdown(ast);

        _logger.LogInformation(
            "[ScenarioEngine] Проект {Id} синхронизирован. Сцен: {Scenes}, замечаний линтера: {Issues}, хронометраж: {Duration:F1}s",
            project.Id.Value, ast.Scenes.Count, issues.Count, project.TotalDurationSeconds);

        return new EngineSyncResponse(
            FormattedMarkdown: formattedMarkdown,
            AstTree: ast,
            Issues: issues,
            ComputedDurationSeconds: project.TotalDurationSeconds);
    }

    /// <summary>
    /// Stateless-проверка черновика (используется в ScenarioBuilder до создания проекта):
    /// Левый блок (парсер) собирает временный проект в памяти — без персиста в БД и на диск, —
    /// Правый блок (режиссёрский линтер) возвращает замечания по драматургии/структуре.
    /// </summary>
    public DraftLintResponse LintDraftMarkdown(string rawMarkdown)
    {
        // 1. ЛЕВЫЙ БЛОК (Парсер): Markdown -> AST + доменные сущности в памяти
        var ast = _astParser.ParseToAst(rawMarkdown);

        var tempProject = Project.Create(ProjectId.New(), ast.Frontmatter.Title ?? "Draft");
        var parsedScenes = _astParser.MapAstToEntities(tempProject.Id, ast);
        tempProject.SetScenes(parsedScenes);

        // Физика времени: каскадный пересчёт таймкодов (SSOT для оценки хронометража)
        tempProject.RecalculateTimeline();

        // 2. ПРАВЫЙ БЛОК (Индикаторы/Линтер): эвристики + AST-подсказки
        var issues = _linter.LintProject(tempProject).ToList();
        issues.AddRange(BuildAstSuggestions(tempProject, ast));

        _logger.LogInformation(
            "[ScenarioEngine] Черновик проверен (stateless). Сцен: {Scenes}, замечаний линтера: {Issues}, хронометраж: {Duration:F1}s",
            ast.Scenes.Count, issues.Count, tempProject.TotalDurationSeconds);

        return new DraftLintResponse(issues, tempProject.TotalDurationSeconds);
    }

    private void ValidateLinkedAssets(Project project, ScenarioAstDocument ast)
    {
        var storageRoot = Path.GetFullPath(_storageConfig.DataStorageDir);
        var projectDir = _pathResolver.ResolveSafePath(Path.Combine(storageRoot, project.RelativePath));
        var globalSfxDir = _pathResolver.ResolveSafePath(Path.Combine(storageRoot, "library", "sfx"));
        var globalAnimDir = _pathResolver.ResolveSafePath(Path.Combine(storageRoot, "library", "animations"));

        for (int sIdx = 0; sIdx < project.Scenes.Count; sIdx++)
        {
            var scene = project.Scenes[sIdx];
            var astFragments = sIdx < ast.Scenes.Count
                ? ast.Scenes[sIdx].Nodes.OfType<AstFragment>().ToList()
                : [];

            for (int fIdx = 0; fIdx < scene.Fragments.Count; fIdx++)
            {
                var fragment = scene.Fragments[fIdx];
                fragment.ClearMissingSfx();

                var astFragment = fIdx < astFragments.Count ? astFragments[fIdx] : null;
                if (astFragment == null)
                {
                    fragment.MarkMediaMissing(false);
                    fragment.MarkAnimationMissing(false);
                    continue;
                }

                // B-roll: файл ищем в папке проекта
                if (astFragment.MediaLink != null)
                {
                    fragment.MarkMediaMissing(!FileExistsInBase(projectDir, projectDir, astFragment.MediaLink));
                }
                else
                {
                    fragment.MarkMediaMissing(false);
                }

                // Анимации (Lottie/AE): сначала папка проекта, потом глобальная библиотека
                if (astFragment.AnimationAssetLink != null)
                {
                    bool exists = FileExistsInBase(projectDir, projectDir, astFragment.AnimationAssetLink)
                        || FileExistsInBase(globalAnimDir, globalAnimDir, astFragment.AnimationAssetLink);
                    fragment.MarkAnimationMissing(!exists);
                }
                else
                {
                    fragment.MarkAnimationMissing(false);
                }

                // SFX: папка проекта assets/sfx + глобальная библиотека
                foreach (var sfx in astFragment.SfxList)
                {
                    var projectSfxDir = Path.Combine(projectDir, "assets", "sfx");
                    bool exists = FileExistsInBase(projectSfxDir, projectDir, sfx)
                        || FileExistsInBase(globalSfxDir, globalSfxDir, sfx);

                    if (!exists)
                    {
                        fragment.AddMissingSfx(sfx);
                    }
                }
            }
        }
    }

    private IEnumerable<ScenarioIssue> BuildAstSuggestions(Project project, ScenarioAstDocument ast)
    {
        var suggestions = new List<ScenarioIssue>();

        for (int sIdx = 0; sIdx < project.Scenes.Count; sIdx++)
        {
            var scene = project.Scenes[sIdx];
            var astFragments = sIdx < ast.Scenes.Count
                ? ast.Scenes[sIdx].Nodes.OfType<AstFragment>().ToList()
                : [];

            for (int fIdx = 0; fIdx < scene.Fragments.Count && fIdx < astFragments.Count; fIdx++)
            {
                var fragment = scene.Fragments[fIdx];
                var astFragment = astFragments[fIdx];

                // У динамичной анимации должен быть звук (Whoosh/Swoosh), иначе — намёк звукорежиссёру
                if (astFragment.AnimationType != null
                    && astFragment.SfxList.Count == 0
                    && !string.IsNullOrWhiteSpace(astFragment.SpokenText))
                {
                    suggestions.Add(new ScenarioIssue(
                        fragment.FragmentId.Value,
                        scene.SceneId.Value,
                        IssueSeverity.Info,
                        "SUGGEST_SFX",
                        $"Динамичная анимация ({astFragment.AnimationType}) без звука. Рекомендуется добавить [SFX: whoosh.mp3] для усиления эффекта."));
                }
            }
        }

        return suggestions;
    }

    private bool FileExistsInBase(string candidateBase, string sandboxRoot, string relativeOrAbsolute)
    {
        if (Uri.TryCreate(relativeOrAbsolute, UriKind.Absolute, out var uri)
            && uri.Scheme is "http" or "https")
        {
            return true; // внешние URL не проверяем на диске
        }

        try
        {
            var normalized = relativeOrAbsolute.Replace('/', Path.DirectorySeparatorChar);
            var full = Path.GetFullPath(Path.Combine(candidateBase, normalized));
            var safe = _pathResolver.ResolveSafePath(full, sandboxRoot);
            return File.Exists(safe);
        }
        catch (Exception ex) when (ex is SecurityPathViolationException or ArgumentException or NotSupportedException)
        {
            _logger.LogDebug(ex, "[ScenarioEngine] Путь к ассету вне песочницы или невалиден: {Asset}", relativeOrAbsolute);
            return false;
        }
    }

    private async Task WriteScenarioToDiskAsync(Project project, string rawMarkdown, CancellationToken ct)
    {
        var safeSrcDir = _pathResolver.ResolveSafePath(Path.Combine(_storageConfig.DataStorageDir, project.RelativePath, "src"));
        Directory.CreateDirectory(safeSrcDir);
        await File.WriteAllTextAsync(Path.Combine(safeSrcDir, "SCENARIO.md"), rawMarkdown, ct);
    }
}
