using Kernel.Contracts;
using Kernel.Exceptions;
using Kernel.Platform.Persistence;
using ProductionContext.Domain.Events;
using ProductionContext.Domain.ValueObjects;

namespace ProductionContext.Domain.Entities;

public class Project : BaseEntity<ProjectId>
{
    public const int MaxTitleLength = 160;

    public string Title { get; private set; } = string.Empty;
    public ProjectSlug Slug { get; private set; }
    public string RelativePath { get; private set; } = string.Empty;
    public ProjectStatus Status { get; private set; }
    public PipelineStep CurrentStep { get; private set; }
    public MontageSettingsDto MontageSettings { get; private set; } = new();

    public string? FinalVideoPath { get; private set; }
    public double? FinalDurationSeconds { get; private set; }
    public long? FinalFileSizeBytes { get; private set; }
    public string? ErrorMessage { get; private set; }

    private readonly List<Scene> _scenes = [];
    public IReadOnlyList<Scene> Scenes => _scenes.AsReadOnly();

    public double TotalDurationSeconds => _scenes.Sum(s => s.DurationSeconds);

    protected Project() { }

    public static Project Create(
        ProjectId id,
        string title,
        MontageSettingsDto? montageSettings = null,
        string? customSlug = null)
    {
        if (string.IsNullOrWhiteSpace(title))
        {
            throw new ValidationException("title", "Название проекта обязательно для заполнения.");
        }

        if (title.Trim().Length > MaxTitleLength)
        {
            throw new ValidationException("title", $"Название проекта не может превышать {MaxTitleLength} знаков.");
        }

        var slug = !string.IsNullOrWhiteSpace(customSlug)
            ? new ProjectSlug(customSlug)
            : ProjectSlug.FromTitle(title);

        var project = new Project
        {
            Id = id,
            Title = title.Trim(),
            Slug = slug,
            RelativePath = Path.Combine("projects", $"{slug.Value}_{id.Value}").Replace('\\', '/'),
            Status = ProjectStatus.Draft,
            CurrentStep = PipelineStep.Drafting,
            MontageSettings = montageSettings ?? new MontageSettingsDto(),
            CreatedAt = DateTimeOffset.UtcNow,
            UpdatedAt = DateTimeOffset.UtcNow
        };

        project.AddDomainEvent(new ProjectCreatedEvent(project.Id.Value, project.Title, project.Slug.Value));
        return project;
    }

    public Scene AddScene(string sceneId, string title, string visualNote)
    {
        var sid = new SceneId(sceneId);
        if (_scenes.Any(s => s.SceneId == sid))
        {
            throw new DomainConflictException($"Сцена с идентификатором '{sid.Value}' уже присутствует в проекте.", "DUPLICATE_SCENE_ID");
        }

        int nextIndex = _scenes.Count;
        var scene = Scene.Create(Id, sid, nextIndex, title, visualNote);
        _scenes.Add(scene);

        RecalculateTimeline();
        UpdatedAt = DateTimeOffset.UtcNow;
        return scene;
    }

    public void SetScenes(IEnumerable<Scene> newScenes)
    {
        _scenes.Clear();
        foreach (var sc in newScenes)
        {
            if (_scenes.Any(s => s.SceneId == sc.SceneId))
            {
                throw new DomainConflictException($"Обнаружен дубликат сцены '{sc.SceneId.Value}' в новом сценарии.", "DUPLICATE_SCENE_ID");
            }
            _scenes.Add(sc);
        }

        RecalculateTimeline();
        Status = _scenes.Count > 0 ? ProjectStatus.Configured : ProjectStatus.Draft;
        UpdatedAt = DateTimeOffset.UtcNow;
        AddDomainEvent(new ScenarioParsedEvent(Id.Value, _scenes.Count, _scenes.Sum(s => s.Fragments.Count)));
    }

    public void RecalculateTimeline()
    {
        double currentOffset = 0.0;
        foreach (var scene in _scenes.OrderBy(s => s.Index))
        {
            scene.RecalculateSceneDurationFromFragments();
            scene.SetAbsoluteTimeWindow(currentOffset);
            currentOffset += scene.DurationSeconds;
        }

        AddDomainEvent(new SceneTimingsRecalculatedEvent(Id.Value, currentOffset));
    }

    public void UpdateMontageSettings(MontageSettingsDto newSettings)
    {
        ArgumentNullException.ThrowIfNull(newSettings);
        MontageSettings = newSettings;
        UpdatedAt = DateTimeOffset.UtcNow;
    }

    public void MarkStep(PipelineStep step)
    {
        CurrentStep = step;
        Status = step switch
        {
            PipelineStep.Completed => ProjectStatus.Ready,
            PipelineStep.Failed => ProjectStatus.Failed,
            _ => ProjectStatus.Processing
        };
        UpdatedAt = DateTimeOffset.UtcNow;
        AddDomainEvent(new PipelineStepChangedEvent(Id.Value, step));
    }

    public void MarkCompleted(string finalVideoPath, double durationSeconds, long fileSizeBytes)
    {
        if (string.IsNullOrWhiteSpace(finalVideoPath))
        {
            throw new ValidationException("final_video_path", "Путь к финальному видеофайлу обязателен.");
        }

        FinalVideoPath = finalVideoPath.Trim();
        FinalDurationSeconds = Math.Round(durationSeconds, 2);
        FinalFileSizeBytes = fileSizeBytes;
        ErrorMessage = null;
        MarkStep(PipelineStep.Completed);

        AddDomainEvent(new ProjectExportedEvent(Id.Value, FinalVideoPath, FinalDurationSeconds.Value, fileSizeBytes));
    }

    public void MarkFailed(PipelineStep failedStep, string errorMessage)
    {
        CurrentStep = failedStep;
        Status = ProjectStatus.Failed;
        ErrorMessage = errorMessage?.Trim() ?? "Неизвестная ошибка сборки проекта.";
        UpdatedAt = DateTimeOffset.UtcNow;
        AddDomainEvent(new ProjectBuildFailedEvent(Id.Value, failedStep, ErrorMessage));
    }

    public void Cancel()
    {
        if (Status is ProjectStatus.Ready or ProjectStatus.Failed) return;
        Status = ProjectStatus.Cancelled;
        ErrorMessage = "Сборка проекта отменена пользователем.";
        UpdatedAt = DateTimeOffset.UtcNow;
    }

    public Scene? FindScene(string sceneId) =>
        _scenes.FirstOrDefault(s => s.SceneId.Value.Equals(sceneId.Trim(), StringComparison.OrdinalIgnoreCase));
}
