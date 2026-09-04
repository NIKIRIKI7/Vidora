using Kernel.Contracts;
using Kernel.Exceptions;
using Kernel.Ports;
using Microsoft.Extensions.Logging;
using MotionContext.Application.Commands;
using MotionContext.Contracts;
using MotionContext.Domain;
using MotionContext.Domain.Entities;
using MotionContext.Domain.Ports;
using MotionContext.Domain.ValueObjects;

namespace MotionContext.Application.Services;

public sealed class MotionModule : IMotionModule
{
    private readonly ISceneCodeRepository _sceneCodeRepository;
    private readonly IRenderJobRepository _renderJobRepository;
    private readonly IRenderJobQueue _renderJobQueue;
    private readonly IRenderTracker _renderTracker;
    private readonly IScenePromptComposer _promptComposer;
    private readonly ILlmCodeExtractor _codeExtractor;
    private readonly ILlmClient _llmClient;
    private readonly IPackageCapabilityRegistry _capabilityRegistry;
    private readonly ILogger<MotionModule> _logger;

    public MotionModule(
        ISceneCodeRepository sceneCodeRepository,
        IRenderJobRepository renderJobRepository,
        IRenderJobQueue renderJobQueue,
        IRenderTracker renderTracker,
        IScenePromptComposer promptComposer,
        ILlmCodeExtractor codeExtractor,
        ILlmClient llmClient,
        IPackageCapabilityRegistry capabilityRegistry,
        ILogger<MotionModule> logger)
    {
        _sceneCodeRepository = sceneCodeRepository;
        _renderJobRepository = renderJobRepository;
        _renderJobQueue = renderJobQueue;
        _renderTracker = renderTracker;
        _promptComposer = promptComposer;
        _codeExtractor = codeExtractor;
        _llmClient = llmClient;
        _capabilityRegistry = capabilityRegistry;
        _logger = logger;
    }

    public async Task<SceneCodeDto> GetSceneCodeAsync(string sceneCodeId, CancellationToken ct = default)
    {
        var id = ParseSceneCodeId(sceneCodeId);
        var entity = await _sceneCodeRepository.GetByIdAsync(id, ct)
            ?? throw new ResourceNotFoundException("SceneCode", sceneCodeId);

        return MapToDto(entity);
    }

    public async Task<SceneCodeDto?> FindSceneCodeBySceneAsync(string projectId, string sceneId, CancellationToken ct = default)
    {
        var entity = await _sceneCodeRepository.GetByProjectAndSceneAsync(projectId, sceneId, ct);
        return entity == null ? null : MapToDto(entity);
    }

    public async Task<SceneRevisionDto> GetRevisionAsync(string sceneCodeId, int revisionNumber, CancellationToken ct = default)
    {
        var id = ParseSceneCodeId(sceneCodeId);
        var entity = await _sceneCodeRepository.GetByIdAsync(id, ct)
            ?? throw new ResourceNotFoundException("SceneCode", sceneCodeId);

        var revision = entity.FindRevision(new RevisionNumber(revisionNumber))
            ?? throw new ResourceNotFoundException("SceneRevision", revisionNumber);

        return new SceneRevisionDto(
            revision.RevisionNumber.Value,
            revision.SourceHash,
            revision.Origin,
            revision.CreatedAt,
            revision.SourceCode.Value);
    }

    public async Task<SceneCodeDto> GenerateSceneCodeAsync(GenerateSceneCodeRequest request, CancellationToken ct = default)
    {
        _logger.LogInformation("[MotionModule] Старт кодогенерации сцены {Scene} (Проект: {Project})", request.SceneId, request.ProjectId);

        var theme = MontageTheme.FromDto(request.MontageSettings);
        int targetWidth = request.Width ?? request.MontageSettings?.Width ?? 1080;
        int targetHeight = request.Height ?? request.MontageSettings?.Height ?? 1920;
        int targetFps = request.Fps ?? request.MontageSettings?.Fps ?? 30;

        var composition = CompositionConfig.FromSeconds(targetWidth, targetHeight, targetFps, request.DurationSeconds);
        var activeCapabilities = (request.Capabilities ?? ["tailwind", "lucide-react"]).ToList();

        var spec = await _promptComposer.ComposePromptSpecAsync(
            request.ProjectId,
            request.SceneId,
            request.VisualDescription,
            request.VoiceText,
            composition,
            theme,
            activeCapabilities,
            ct);

        var rawOutput = await _llmClient.GenerateTextAsync(spec, ct);

        var sanitization = _codeExtractor.ExtractAndSanitize(rawOutput);

        var existing = await _sceneCodeRepository.GetByProjectAndSceneAsync(request.ProjectId, request.SceneId, ct);
        SceneCode aggregate;

        if (existing == null)
        {
            aggregate = SceneCode.Create(
                SceneCodeId.New(),
                request.ProjectId,
                request.SceneId,
                composition,
                sanitization.SanitizedCode,
                RevisionOrigin.AiGenerated,
                sanitization.DetectedCapabilities);

            await _sceneCodeRepository.AddAsync(aggregate, ct);
        }
        else
        {
            aggregate = existing;
            aggregate.UpdateComposition(composition);
            aggregate.AddRevision(sanitization.SanitizedCode, RevisionOrigin.AiGenerated, sanitization.DetectedCapabilities);
            await _sceneCodeRepository.UpdateAsync(aggregate, ct);
        }

        await _sceneCodeRepository.SaveChangesAsync(ct);
        _logger.LogInformation("[MotionModule] Сцена {Id} сохранена (активная ревизия #{Rev})", aggregate.Id.Value, aggregate.CurrentRevisionNumber.Value);
        return MapToDto(aggregate);
    }

    public async Task<SceneCodeDto> UpdateManualCodeAsync(string sceneCodeId, UpdateSceneCodeManualRequest request, CancellationToken ct = default)
    {
        var id = ParseSceneCodeId(sceneCodeId);
        var aggregate = await _sceneCodeRepository.GetByIdAsync(id, ct)
            ?? throw new ResourceNotFoundException("SceneCode", sceneCodeId);

        var sanitization = _codeExtractor.ExtractAndSanitize(request.Code);
        aggregate.AddRevision(sanitization.SanitizedCode, RevisionOrigin.UserEdited, sanitization.DetectedCapabilities);

        await _sceneCodeRepository.UpdateAsync(aggregate, ct);
        await _sceneCodeRepository.SaveChangesAsync(ct);

        return MapToDto(aggregate);
    }

    public async Task<SceneCodeDto> RollbackRevisionAsync(string sceneCodeId, RollbackSceneCodeRequest request, CancellationToken ct = default)
    {
        var id = ParseSceneCodeId(sceneCodeId);
        var aggregate = await _sceneCodeRepository.GetByIdAsync(id, ct)
            ?? throw new ResourceNotFoundException("SceneCode", sceneCodeId);

        aggregate.RollbackTo(new RevisionNumber(request.TargetRevision));
        await _sceneCodeRepository.UpdateAsync(aggregate, ct);
        await _sceneCodeRepository.SaveChangesAsync(ct);

        return MapToDto(aggregate);
    }

    public async Task<RenderJobDto> StartRenderAsync(string sceneCodeId, StartRenderRequest request, CancellationToken ct = default)
    {
        var id = ParseSceneCodeId(sceneCodeId);
        var sceneCode = await _sceneCodeRepository.GetByIdAsync(id, ct)
            ?? throw new ResourceNotFoundException("SceneCode", sceneCodeId);

        var targetRevNumber = request.RevisionNumber.HasValue
            ? new RevisionNumber(request.RevisionNumber.Value)
            : sceneCode.CurrentRevisionNumber;

        var revision = sceneCode.FindRevision(targetRevNumber)
            ?? throw new ResourceNotFoundException("SceneRevision", targetRevNumber.Value);

        var job = RenderJob.Enqueue(sceneCode.Id, targetRevNumber, sceneCode.Composition.DurationInFrames);
        await _renderJobRepository.AddAsync(job, ct);
        await _renderJobRepository.SaveChangesAsync(ct);

        await _renderJobQueue.EnqueueAsync(job.Id, ct);

        _logger.LogInformation("[MotionModule] Задача рендера {JobId} поставлена в канал очереди", job.Id.Value);
        return MapRenderDto(job);
    }

    public async Task<RenderJobDto> GetRenderStatusAsync(string renderJobId, CancellationToken ct = default)
    {
        if (!RenderJobId.TryParse(renderJobId, out var id))
            throw new ResourceNotFoundException("RenderJob", renderJobId);

        var job = await _renderJobRepository.GetByIdAsync(id, ct)
            ?? throw new ResourceNotFoundException("RenderJob", renderJobId);

        if (job.Status == RenderJobStatus.Rendering && _renderTracker.TryGet(job.Id.Value, out var liveProgress))
        {
            return new RenderJobDto(
                job.Id.Value,
                job.SceneCodeId.Value,
                job.TargetRevisionNumber.Value,
                job.Status,
                liveProgress.RenderedFrames,
                liveProgress.TotalFrames,
                liveProgress.Percentage,
                liveProgress.CurrentFps,
                job.OutputPath,
                job.ErrorMessage,
                job.StartedAt,
                job.CompletedAt);
        }

        return MapRenderDto(job);
    }

    public async Task CancelRenderAsync(string renderJobId, CancellationToken ct = default)
    {
        if (!RenderJobId.TryParse(renderJobId, out var id))
            throw new ResourceNotFoundException("RenderJob", renderJobId);

        var job = await _renderJobRepository.GetByIdAsync(id, ct)
            ?? throw new ResourceNotFoundException("RenderJob", renderJobId);

        job.Cancel();
        _renderTracker.Remove(job.Id.Value);

        await _renderJobRepository.UpdateAsync(job, ct);
        await _renderJobRepository.SaveChangesAsync(ct);
    }

    public Task<IReadOnlyList<string>> GetAvailableCapabilitiesAsync(CancellationToken ct = default)
    {
        var list = _capabilityRegistry.GetAll().Select(c => c.Id).ToList();
        return Task.FromResult<IReadOnlyList<string>>(list);
    }

    private static SceneCodeId ParseSceneCodeId(string raw)
    {
        if (!SceneCodeId.TryParse(raw, out var id))
            throw new ResourceNotFoundException("SceneCode", raw);
        return id;
    }

    private static SceneCodeDto MapToDto(SceneCode s) => new(
        s.Id.Value,
        s.ProjectId,
        s.SceneId,
        s.CurrentRevisionNumber.Value,
        s.Composition.Width,
        s.Composition.Height,
        s.Composition.Fps,
        s.Composition.DurationInFrames,
        s.Composition.DurationSeconds,
        s.RequiredCapabilities,
        s.Revisions.Select(r => new SceneRevisionDto(r.RevisionNumber.Value, r.SourceHash, r.Origin, r.CreatedAt)).ToList(),
        s.GetCurrentRevision().SourceCode.Value);

    private static RenderJobDto MapRenderDto(RenderJob j) => new(
        j.Id.Value,
        j.SceneCodeId.Value,
        j.TargetRevisionNumber.Value,
        j.Status,
        j.Progress.RenderedFrames,
        j.Progress.TotalFrames,
        j.Progress.Percentage,
        j.Progress.CurrentFps,
        j.OutputPath,
        j.ErrorMessage,
        j.StartedAt,
        j.CompletedAt);
}
