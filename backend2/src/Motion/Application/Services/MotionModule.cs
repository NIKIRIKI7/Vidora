using Kernel.Contracts;
using Kernel.Exceptions;
using Kernel.Ports;
using Microsoft.Extensions.Logging;
using MotionContext.Contracts;
using MotionContext.Domain;
using MotionContext.Domain.Entities;
using MotionContext.Domain.Ports;
using MotionContext.Domain.ValueObjects;

namespace MotionContext.Application.Services;

public sealed class MotionModule : IMotionModule
{
    private readonly ISceneCodeRepository _sceneCodeRepository;
    private readonly IScenePromptComposer _promptComposer;
    private readonly ILlmCodeExtractor _codeExtractor;
    private readonly ILlmClient _llmClient;
    private readonly IPackageCapabilityRegistry _capabilityRegistry;
    private readonly ILogger<MotionModule> _logger;

    public MotionModule(
        ISceneCodeRepository sceneCodeRepository,
        IScenePromptComposer promptComposer,
        ILlmCodeExtractor codeExtractor,
        ILlmClient llmClient,
        IPackageCapabilityRegistry capabilityRegistry,
        ILogger<MotionModule> logger)
    {
        _sceneCodeRepository = sceneCodeRepository;
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

    public async Task<SceneCodeDto> SaveSceneCodeAsync(SaveSceneCodeRequest request, CancellationToken ct = default)
    {
        var sanitization = _codeExtractor.ExtractAndSanitize(request.TsxCode);
        var existing = await _sceneCodeRepository.GetByProjectAndSceneAsync(request.ProjectId, request.SceneId, ct);

        int width = request.Width is > 0 ? request.Width.Value : existing?.Composition.Width ?? 1920;
        int height = request.Height is > 0 ? request.Height.Value : existing?.Composition.Height ?? 1080;
        int fps = request.Fps is > 0 ? request.Fps.Value : existing?.Composition.Fps ?? 30;
        int durationInFrames = request.DurationInFrames is > 0
            ? request.DurationInFrames.Value
            : existing?.Composition.DurationInFrames ?? Math.Max(1, fps * 5);

        var composition = new CompositionConfig(width, height, fps, durationInFrames);

        if (existing == null)
        {
            var created = SceneCode.Create(
                SceneCodeId.New(),
                request.ProjectId,
                request.SceneId,
                composition,
                sanitization.SanitizedCode,
                RevisionOrigin.UserEdited,
                sanitization.DetectedCapabilities);

            await _sceneCodeRepository.AddAsync(created, ct);
            await _sceneCodeRepository.SaveChangesAsync(ct);
            _logger.LogInformation("[MotionModule] Создана сцена {Id} из кода редактора (проект {Project})", created.Id.Value, request.ProjectId);
            return MapToDto(created);
        }

        existing.UpdateComposition(composition);
        if (!string.Equals(existing.GetCurrentRevision().SourceHash, sanitization.SanitizedCode.Sha256Hash, StringComparison.OrdinalIgnoreCase))
        {
            existing.AddRevision(sanitization.SanitizedCode, RevisionOrigin.UserEdited, sanitization.DetectedCapabilities);
        }

        await _sceneCodeRepository.UpdateAsync(existing, ct);
        await _sceneCodeRepository.SaveChangesAsync(ct);
        _logger.LogInformation("[MotionModule] Обновлена сцена {Id} из кода редактора (ревизия #{Rev})", existing.Id.Value, existing.CurrentRevisionNumber.Value);
        return MapToDto(existing);
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

}
