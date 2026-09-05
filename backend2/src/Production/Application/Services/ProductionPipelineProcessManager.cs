using Kernel.Platform.Config;
using Kernel.Platform.FileSystem;
using Kernel.Platform.WebSockets;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
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
    private readonly IMediaGateway _mediaGateway;
    private readonly IVideoStitcher _videoStitcher;
    private readonly IPathResolver _pathResolver;
    private readonly IWebSocketGateway _webSocketGateway;
    private readonly AppStorageConfig _storageConfig;
    private readonly ILogger<ProductionPipelineProcessManager> _logger;

    public ProductionPipelineProcessManager(
        IProjectRepository projectRepository,
        IVoiceGateway voiceGateway,
        IMotionGateway motionGateway,
        IMediaGateway mediaGateway,
        IVideoStitcher videoStitcher,
        IPathResolver pathResolver,
        IWebSocketGateway webSocketGateway,
        IOptions<AppStorageConfig> storageConfig,
        ILogger<ProductionPipelineProcessManager> logger)
    {
        _projectRepository = projectRepository;
        _voiceGateway = voiceGateway;
        _motionGateway = motionGateway;
        _mediaGateway = mediaGateway;
        _videoStitcher = videoStitcher;
        _pathResolver = pathResolver;
        _webSocketGateway = webSocketGateway;
        _storageConfig = storageConfig.Value;
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
        var baseDir = Path.Combine(_storageConfig.DataStorageDir, project.RelativePath);
        var safeProjectDir = _pathResolver.ResolveSafePath(baseDir);
        var outputDir = Path.Combine(safeProjectDir, "output");
        Directory.CreateDirectory(outputDir);

        try
        {
            // ШАГ 1: Озвучка фрагментов
            await TransitionStepAsync(project, PipelineStep.VoiceGeneration, ct);
            foreach (var scene in project.Scenes)
            {
                foreach (var frag in scene.Fragments)
                {
                    if (string.IsNullOrWhiteSpace(frag.Text)) continue;
                    if (!string.IsNullOrWhiteSpace(frag.VoiceAssetId) && !forceRerender) continue;

                    var voiceResult = await _voiceGateway.SynthesizeFragmentAudioAsync(frag.Text, speakerId, 1.0, ct);
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

            // ШАГ 4: Рендеринг видеосцен
            await TransitionStepAsync(project, PipelineStep.SceneRendering, ct);
            var renderedScenes = new List<StitchVideoItem>();

            for (int i = 0; i < project.Scenes.Count; i++)
            {
                var scene = project.Scenes[i];
                string videoPath;

                if (!string.IsNullOrWhiteSpace(scene.RenderedVideoAssetId) && !forceRerender)
                {
                    videoPath = await _mediaGateway.ResolveAssetFilePathAsync(scene.RenderedVideoAssetId, ct);
                }
                else
                {
                    if (string.IsNullOrWhiteSpace(scene.SceneCodeId))
                    {
                        throw new InvalidOperationException($"У сцены {scene.SceneId.Value} отсутствует SceneCodeId.");
                    }

                    int sceneIndex = i + 1;
                    var progressHandler = new Progress<double>(pct =>
                    {
                        _ = _webSocketGateway.BroadcastAsync("PRODUCTION_PROGRESS", new
                        {
                            project_id = project.Id.Value,
                            step = PipelineStep.SceneRendering.ToString(),
                            current_scene = sceneIndex,
                            total_scenes = project.Scenes.Count,
                            scene_id = scene.SceneId.Value,
                            percentage = pct
                        }, CancellationToken.None);
                    });

                    videoPath = await _motionGateway.RenderSceneVideoAsync(scene.SceneCodeId, progressHandler, ct);
                    var assetId = await _mediaGateway.RegisterVideoAssetAsync($"Render_{scene.Id}", videoPath, ct);
                    scene.AttachRenderedVideo(assetId);
                }

                renderedScenes.Add(new StitchVideoItem(videoPath, scene.DurationSeconds));
            }
            await SaveProjectAsync(project, ct);

            // ШАГ 5: Сведение аудио и дакинг BGM
            await TransitionStepAsync(project, PipelineStep.AudioMuxing, ct);
            string? duckedAudioPath = null;
            if (!string.IsNullOrWhiteSpace(bgmAssetId))
            {
                var firstVoiceAsset = project.Scenes.SelectMany(s => s.Fragments)
                    .Select(f => f.VoiceAssetId)
                    .FirstOrDefault(id => !string.IsNullOrWhiteSpace(id));

                if (!string.IsNullOrWhiteSpace(firstVoiceAsset))
                {
                    duckedAudioPath = await _voiceGateway.ApplyDuckingAsync(firstVoiceAsset, bgmAssetId, ct);
                }
            }

            // ШАГ 6: Финальная склейка
            await TransitionStepAsync(project, PipelineStep.FinalAssembly, ct);
            var stitchedVideoPath = Path.Combine(outputDir, "stitched_visual.mp4");
            var finalMasterPath = Path.Combine(outputDir, "master_output.mp4");

            await _videoStitcher.ConcatenateScenesAsync(renderedScenes, stitchedVideoPath, ct);

            if (!string.IsNullOrWhiteSpace(duckedAudioPath) && File.Exists(duckedAudioPath))
            {
                await _videoStitcher.MuxMasterAudioAsync(stitchedVideoPath, duckedAudioPath, finalMasterPath, ct);
            }
            else
            {
                if (File.Exists(finalMasterPath)) File.Delete(finalMasterPath);
                File.Copy(stitchedVideoPath, finalMasterPath, overwrite: true);
            }

            var fileInfo = new FileInfo(finalMasterPath);
            project.MarkCompleted(finalMasterPath, project.TotalDurationSeconds, fileInfo.Length);
            await SaveProjectAsync(project, ct);

            _logger.LogInformation("[Pipeline] Сборка проекта {ProjectId} завершена: {Path} ({SizeMb:F2} MB)",
                project.Id.Value, finalMasterPath, (double)fileInfo.Length / (1024 * 1024));

            await _webSocketGateway.BroadcastAsync("PRODUCTION_COMPLETED", new
            {
                project_id = project.Id.Value,
                output_path = finalMasterPath,
                duration_seconds = project.FinalDurationSeconds,
                file_size_bytes = project.FinalFileSizeBytes
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
