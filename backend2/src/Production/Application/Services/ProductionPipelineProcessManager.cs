using Kernel.Platform.WebSockets;
using Microsoft.Extensions.Logging;
using ProductionContext.Domain;
using ProductionContext.Domain.Entities;
using ProductionContext.Domain.Ports;
using ProductionContext.Domain.ValueObjects;

namespace ProductionContext.Application.Services;

public sealed class ProductionPipelineProcessManager : IProductionPipelineOrchestrator
{
    private readonly IProjectRepository _projectRepository;
    private readonly IVoiceGateway _voiceGateway;
    private readonly IMotionGateway _motionGateway;
    private readonly IWebSocketGateway _webSocketGateway;
    private readonly ILogger<ProductionPipelineProcessManager> _logger;

    public ProductionPipelineProcessManager(
        IProjectRepository projectRepository,
        IVoiceGateway voiceGateway,
        IMotionGateway motionGateway,
        IWebSocketGateway webSocketGateway,
        ILogger<ProductionPipelineProcessManager> logger)
    {
        _projectRepository = projectRepository;
        _voiceGateway = voiceGateway;
        _motionGateway = motionGateway;
        _webSocketGateway = webSocketGateway;
        _logger = logger;
    }

    public async Task ExecuteAsync(
        ProjectId projectId,
        string speakerId,
        string? bgmAssetId,
        bool forceRerender,
        CancellationToken ct = default)
    {
        var project = await _projectRepository.GetByIdAsync(projectId, ct);
        if (project == null)
        {
            _logger.LogError("[Pipeline] Проект {ProjectId} не найден.", projectId.Value);
            return;
        }

        if (project.Scenes.Count == 0)
        {
            project.MarkFailed(PipelineStep.ScenarioParsing, "В проекте отсутствуют сцены для сборки.");
            await SaveProjectAsync(project, ct);
            return;
        }

        _logger.LogInformation("[Pipeline] Запуск сборки проекта: {Id} ({Title})", project.Id.Value, project.Title);

        try
        {
            project.MarkBuildStarted();
            await SaveProjectAsync(project, ct);

            // ШАГ 1: Озвучка фрагментов
            await TransitionStepAsync(project, PipelineStep.VoiceGeneration, ct);
            foreach (var scene in project.Scenes)
            {
                foreach (var frag in scene.Fragments)
                {
                    if (string.IsNullOrWhiteSpace(frag.Text)) continue;
                    if (!string.IsNullOrWhiteSpace(frag.VoiceAssetId) && !forceRerender) continue;

                    var voiceResult = await _voiceGateway.SynthesizeFragmentAudioAsync(frag.Text, speakerId, 1.0, ct);

                    // Фоновая музыка приходит из BuildProjectRequest и раньше просто
                    // игнорировалась. Сводим её с озвучкой сразу, чтобы в сцену
                    // попал уже готовый микс, а не «голос, а музыка добавится потом».
                    if (!string.IsNullOrWhiteSpace(bgmAssetId))
                    {
                        voiceResult = await _voiceGateway.ApplyDuckingAsync(
                            voiceResult.MediaAssetId, bgmAssetId, voiceResult.DurationSeconds, ct);
                    }

                    frag.AssignVoiceAsset(voiceResult.MediaAssetId, voiceResult.DurationSeconds);
                }
            }
            await SaveProjectAsync(project, ct);

            // ШАГ 2: Пересчет таймкодов
            await TransitionStepAsync(project, PipelineStep.TimingSynchronization, ct);
            project.RecalculateTimeline();
            await SaveProjectAsync(project, ct);

            // ШАГ 3: Генерация TSX-кода
            await TransitionStepAsync(project, PipelineStep.MotionCodeGeneration, ct);
            foreach (var scene in project.Scenes)
            {
                if (!string.IsNullOrWhiteSpace(scene.SceneCodeId) && !forceRerender) continue;

                var spokenText = string.Join(" ", scene.Fragments.Select(f => f.Text)).Trim();
                var codeId = await _motionGateway.GenerateSceneCodeAsync(
                    projectId: project.Id.Value,
                    sceneId: scene.SceneId.Value,
                    visualDescription: scene.VisualNote,
                    voiceText: spokenText,
                    durationSeconds: scene.DurationSeconds,
                    width: project.MontageSettings.Width,
                    height: project.MontageSettings.Height,
                    fps: project.MontageSettings.Fps,
                    ct: ct);

                scene.LinkSceneCode(codeId);
            }
            await SaveProjectAsync(project, ct);

            // ШАГ 4: Валидация артефактов сборки
            await TransitionStepAsync(project, PipelineStep.Validation, ct);
            var issues = project.CollectBuildIssues();
            if (issues.Count > 0)
            {
                var reason = string.Join(" ", issues);
                _logger.LogError("[Pipeline] Валидация не пройдена для {Id}: {Issues}", project.Id.Value, reason);
                project.MarkFailed(PipelineStep.Validation, reason);
                await SaveProjectAsync(project, ct);
                await _webSocketGateway.BroadcastAsync("PRODUCTION_FAILED", new
                {
                    project_id = project.Id.Value,
                    step = PipelineStep.Validation.ToString(),
                    error = reason
                }, CancellationToken.None);
                return;
            }

            project.MarkCompleted();
            await SaveProjectAsync(project, ct);

            _logger.LogInformation("[Pipeline] Сборка проекта {ProjectId} успешно завершена", project.Id.Value);

            await _webSocketGateway.BroadcastAsync("PRODUCTION_COMPLETED", new
            {
                project_id = project.Id.Value,
                duration_seconds = project.TotalDurationSeconds
            }, CancellationToken.None);
        }
        catch (OperationCanceledException)
        {
            _logger.LogWarning("[Pipeline] Сборка проекта {ProjectId} отменена.", project.Id.Value);
            project.Cancel();
            await SaveProjectAsync(project, CancellationToken.None);
            await _webSocketGateway.BroadcastAsync("PRODUCTION_CANCELLED", new { project_id = project.Id.Value }, CancellationToken.None);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "[Pipeline] Сбой сборки проекта {ProjectId} на этапе {Step}: {Error}",
                project.Id.Value, project.CurrentStep, ex.Message);
            project.MarkFailed(project.CurrentStep, ex.Message);
            await SaveProjectAsync(project, CancellationToken.None);

            await _webSocketGateway.BroadcastAsync("PRODUCTION_FAILED", new
            {
                project_id = project.Id.Value,
                step = project.CurrentStep.ToString(),
                error = ex.Message
            }, CancellationToken.None);
        }
    }

    private async Task TransitionStepAsync(Project project, PipelineStep step, CancellationToken ct)
    {
        project.MarkStep(step);
        await SaveProjectAsync(project, ct);

        await _webSocketGateway.BroadcastAsync("PRODUCTION_STEP_CHANGED", new
        {
            project_id = project.Id.Value,
            step = step.ToString(),
            timestamp = DateTimeOffset.UtcNow
        }, ct);
    }

    private Task SaveProjectAsync(Project project, CancellationToken ct)
    {
        return _projectRepository.SaveChangesAsync(ct);
    }
}
