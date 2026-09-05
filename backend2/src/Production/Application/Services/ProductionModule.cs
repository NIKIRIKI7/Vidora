using Kernel.Contracts;
using Kernel.Exceptions;
using Kernel.Platform.Config;
using Kernel.Platform.FileSystem;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using ProductionContext.Contracts;
using ProductionContext.Domain;
using ProductionContext.Domain.Entities;
using ProductionContext.Domain.Ports;
using ProductionContext.Domain.ValueObjects;

namespace ProductionContext.Application.Services;

public sealed class ProductionModule : IProductionModule
{
    private readonly IProjectRepository _repository;
    private readonly IScenarioParser _scenarioParser;
    private readonly IProductionPipelineOrchestrator _orchestrator;
    private readonly IPathResolver _pathResolver;
    private readonly AppStorageConfig _storageConfig;
    private readonly ILogger<ProductionModule> _logger;

    public ProductionModule(
        IProjectRepository repository,
        IScenarioParser scenarioParser,
        IProductionPipelineOrchestrator orchestrator,
        IPathResolver pathResolver,
        IOptions<AppStorageConfig> storageConfig,
        ILogger<ProductionModule> logger)
    {
        _repository = repository;
        _scenarioParser = scenarioParser;
        _orchestrator = orchestrator;
        _pathResolver = pathResolver;
        _storageConfig = storageConfig.Value;
        _logger = logger;
    }

    public async Task<ProjectDetailsDto> CreateProjectAsync(CreateProjectRequest request, CancellationToken ct = default)
    {
        var projectId = ProjectId.New();
        var project = Project.Create(
            id: projectId,
            title: request.Title,
            montageSettings: request.Montage,
            customSlug: request.Slug);

        var fullProjDir = _pathResolver.ResolveSafePath(Path.Combine(_storageConfig.DataStorageDir, project.RelativePath));
        Directory.CreateDirectory(Path.Combine(fullProjDir, "src"));
        Directory.CreateDirectory(Path.Combine(fullProjDir, "assets"));
        Directory.CreateDirectory(Path.Combine(fullProjDir, "output"));
        Directory.CreateDirectory(Path.Combine(fullProjDir, "temp"));

        await _repository.AddAsync(project, ct);
        await _repository.SaveChangesAsync(ct);

        _logger.LogInformation("[Production] Проект инициализирован: {Id} ({Slug})", project.Id.Value, project.Slug.Value);
        return MapToDetailsDto(project);
    }

    public async Task<ProjectDetailsDto> GetProjectByIdAsync(string projectId, CancellationToken ct = default)
    {
        var id = ParseProjectId(projectId);
        var project = await _repository.GetByIdAsync(id, ct)
            ?? throw new ResourceNotFoundException("Project", projectId);

        return MapToDetailsDto(project);
    }

    public async Task<PagedResult<ProjectSummaryDto>> GetProjectsPagedAsync(int page = 1, int pageSize = 20, CancellationToken ct = default)
    {
        page = Math.Max(1, page);
        pageSize = Math.Clamp(pageSize, 1, 100);

        int total = await _repository.CountAsync(ct);
        var projects = await _repository.GetPagedAsync((page - 1) * pageSize, pageSize, ct);

        return PagedResult<ProjectSummaryDto>.Create(
            projects.Select(MapToSummaryDto).ToList(),
            total,
            page,
            pageSize);
    }

    public async Task<ProjectDetailsDto> ParseScenarioAsync(string projectId, ParseScenarioRequest request, CancellationToken ct = default)
    {
        var id = ParseProjectId(projectId);
        var project = await _repository.GetByIdAsync(id, ct)
            ?? throw new ResourceNotFoundException("Project", projectId);

        var parsedScenes = _scenarioParser.ParseMarkdown(project.Id, request.MarkdownContent);
        if (parsedScenes.Count == 0)
        {
            throw new ValidationException("markdown_content", "В переданном тексте сценария не удалось выделить ни одной сцены.");
        }

        project.SetScenes(parsedScenes);

        var safeSrcDir = _pathResolver.ResolveSafePath(Path.Combine(_storageConfig.DataStorageDir, project.RelativePath, "src"));
        await File.WriteAllTextAsync(Path.Combine(safeSrcDir, "SCENARIO.md"), request.MarkdownContent, ct);

        await _repository.UpdateAsync(project, ct);
        await _repository.SaveChangesAsync(ct);

        _logger.LogInformation("[Production] Сценарий распарсен для {Id}. Сцен: {Count}", project.Id.Value, project.Scenes.Count);
        return MapToDetailsDto(project);
    }

    public async Task<ProjectDetailsDto> UpdateSceneAsync(string projectId, string sceneId, UpdateSceneRequest request, CancellationToken ct = default)
    {
        var id = ParseProjectId(projectId);
        var project = await _repository.GetByIdAsync(id, ct)
            ?? throw new ResourceNotFoundException("Project", projectId);

        var scene = project.FindScene(sceneId)
            ?? throw new ResourceNotFoundException("Scene", sceneId);

        scene.UpdateMetadata(request.Title ?? scene.Title, request.VisualNote ?? scene.VisualNote);
        await _repository.UpdateAsync(project, ct);
        await _repository.SaveChangesAsync(ct);

        return MapToDetailsDto(project);
    }

    public async Task<BuildStatusDto> BuildProjectAsync(string projectId, BuildProjectRequest? request = null, CancellationToken ct = default)
    {
        var id = ParseProjectId(projectId);
        var project = await _repository.GetByIdAsync(id, ct)
            ?? throw new ResourceNotFoundException("Project", projectId);

        var speaker = request?.SpeakerId ?? "alloy";
        var bgm = request?.BgmAssetId;
        var rerender = request?.ForceRerender ?? false;

        _ = Task.Run(() => _orchestrator.ExecuteAsync(id, speaker, bgm, rerender, CancellationToken.None));

        return new BuildStatusDto(
            ProjectId: project.Id.Value,
            Status: ProjectStatus.Processing,
            CurrentStep: PipelineStep.VoiceGeneration,
            ErrorMessage: null,
            FinalVideoPath: null);
    }

    public async Task CancelBuildAsync(string projectId, CancellationToken ct = default)
    {
        var id = ParseProjectId(projectId);
        var project = await _repository.GetByIdAsync(id, ct)
            ?? throw new ResourceNotFoundException("Project", projectId);

        project.Cancel();
        await _repository.UpdateAsync(project, ct);
        await _repository.SaveChangesAsync(ct);
    }

    public async Task DeleteProjectAsync(string projectId, CancellationToken ct = default)
    {
        var id = ParseProjectId(projectId);
        var project = await _repository.GetByIdAsync(id, ct)
            ?? throw new ResourceNotFoundException("Project", projectId);

        var safeDir = _pathResolver.ResolveSafePath(Path.Combine(_storageConfig.DataStorageDir, project.RelativePath));
        if (Directory.Exists(safeDir))
        {
            Directory.Delete(safeDir, recursive: true);
        }

        await _repository.DeleteAsync(project, ct);
        await _repository.SaveChangesAsync(ct);
    }

    public async Task<BuildStatusDto> GetBuildStatusAsync(string projectId, CancellationToken ct = default)
    {
        var id = ParseProjectId(projectId);
        var project = await _repository.GetByIdAsync(id, ct)
            ?? throw new ResourceNotFoundException("Project", projectId);

        return new BuildStatusDto(
            ProjectId: project.Id.Value,
            Status: project.Status,
            CurrentStep: project.CurrentStep,
            ErrorMessage: project.ErrorMessage,
            FinalVideoPath: project.FinalVideoPath);
    }

    public async Task<ProjectDataDto> ExportProjectBridgeSnapshotAsync(string projectId, CancellationToken ct = default)
    {
        var id = ParseProjectId(projectId);
        var project = await _repository.GetByIdAsync(id, ct)
            ?? throw new ResourceNotFoundException("Project", projectId);

        return new ProjectDataDto
        {
            ProjectId = project.Id.Value,
            Slug = project.Slug.Value,
            ProjectPath = project.RelativePath,
            Montage = project.MontageSettings,
            Scenes = project.Scenes.Select(s => new SceneDto
            {
                SceneId = s.SceneId.Value,
                Title = s.Title,
                Timecode = s.Timecode.ToDisplayString(),
                Fragments = s.Fragments.Select(f => new SceneFragmentDto
                {
                    FragmentId = f.FragmentId.Value,
                    VisualNote = f.VisualNote,
                    Text = f.Text,
                    Timing = new FragmentTimingDto { Start = f.StartSeconds, End = f.EndSeconds },
                    VoiceAssetId = f.VoiceAssetId,
                    BrollAssetId = f.BrollAssetId
                }).ToList()
            }).ToList()
        };
    }

    private static ProjectId ParseProjectId(string raw)
    {
        if (!ProjectId.TryParse(raw, out var id))
        {
            throw new ResourceNotFoundException("Project", raw);
        }
        return id;
    }

    private static ProjectSummaryDto MapToSummaryDto(Project p) => new(
        Id: p.Id.Value,
        Title: p.Title,
        Slug: p.Slug.Value,
        Status: p.Status,
        CurrentStep: p.CurrentStep,
        ScenesCount: p.Scenes.Count,
        TotalDurationSeconds: p.TotalDurationSeconds,
        FinalVideoPath: p.FinalVideoPath,
        CreatedAt: p.CreatedAt,
        UpdatedAt: p.UpdatedAt);

    private static ProjectDetailsDto MapToDetailsDto(Project p) => new(
        Id: p.Id.Value,
        Title: p.Title,
        Slug: p.Slug.Value,
        RelativePath: p.RelativePath,
        Status: p.Status,
        CurrentStep: p.CurrentStep,
        Montage: p.MontageSettings,
        TotalDurationSeconds: p.TotalDurationSeconds,
        FinalVideoPath: p.FinalVideoPath,
        FinalFileSizeBytes: p.FinalFileSizeBytes,
        ErrorMessage: p.ErrorMessage,
        Scenes: p.Scenes.Select(s => new SceneDetailsDto(
            Id: s.Id,
            SceneId: s.SceneId.Value,
            Index: s.Index,
            Title: s.Title,
            VisualNote: s.VisualNote,
            StartSeconds: s.StartSeconds,
            EndSeconds: s.EndSeconds,
            DurationSeconds: s.DurationSeconds,
            SceneCodeId: s.SceneCodeId,
            RenderedVideoAssetId: s.RenderedVideoAssetId,
            Fragments: s.Fragments.Select(f => new SceneFragmentDetailsDto(
                Id: f.Id,
                FragmentId: f.FragmentId.Value,
                Index: f.Index,
                Text: f.Text,
                VisualNote: f.VisualNote,
                StartSeconds: f.StartSeconds,
                EndSeconds: f.EndSeconds,
                DurationSeconds: f.DurationSeconds,
                VoiceAssetId: f.VoiceAssetId,
                BrollAssetId: f.BrollAssetId)).ToList())).ToList(),
        CreatedAt: p.CreatedAt,
        UpdatedAt: p.UpdatedAt);
}
