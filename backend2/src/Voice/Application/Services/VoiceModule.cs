using Kernel.Exceptions;
using Kernel.Platform.Config;
using Kernel.Platform.FileSystem;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Voice.Application.Commands;
using Voice.Application.Contracts;
using Voice.Application.Services;
using Voice.Domain;
using Voice.Domain.Entities;
using Voice.Domain.Ports;
using Voice.Domain.ValueObjects;
using Voice.Infrastructure.Alignment;
using Voice.Infrastructure.Providers;

namespace Voice.Application.Services;

public sealed class VoiceModule : IVoiceModule
{
    private readonly ITtsJobRepository _repository;
    private readonly TtsProviderRegistry _providerRegistry;
    private readonly AlignmentProviderRegistry _alignmentRegistry;
    private readonly IAudioDuckingService _audioService;
    private readonly IVoiceMediaRegistrar _mediaRegistrar;
    private readonly IPathResolver _pathResolver;
    private readonly AppStorageConfig _storageConfig;
    private readonly ILogger<VoiceModule> _logger;

    public VoiceModule(
        ITtsJobRepository repository,
        TtsProviderRegistry providerRegistry,
        AlignmentProviderRegistry alignmentRegistry,
        IAudioDuckingService audioService,
        IVoiceMediaRegistrar mediaRegistrar,
        IPathResolver pathResolver,
        IOptions<AppStorageConfig> storageConfig,
        ILogger<VoiceModule> logger)
    {
        _repository = repository;
        _providerRegistry = providerRegistry;
        _alignmentRegistry = alignmentRegistry;
        _audioService = audioService;
        _mediaRegistrar = mediaRegistrar;
        _pathResolver = pathResolver;
        _storageConfig = storageConfig.Value;
        _logger = logger;
    }

    public async Task<VoiceJobDto> SynthesizeSpeechAsync(SynthesizeSpeechCommand cmd, CancellationToken ct = default)
    {
        var spec = new VoiceSpec(cmd.Engine, cmd.SpeakerId, cmd.AlignmentEngine, cmd.Speed, cmd.Pitch, cmd.ReferenceAudioPath);
        var job = TtsJob.Create(TtsJobId.New(), cmd.Text, spec);

        await _repository.AddAsync(job, ct);
        await _repository.SaveChangesAsync(ct);

        try
        {
            var workingDir = PrepareDirectory(Path.Combine(_storageConfig.DataStorageDir, "temp", "voice"));
            var rawFilePath = Path.Combine(workingDir, $"{job.Id.Value}_raw.wav");
            var masterFilePath = Path.Combine(workingDir, $"{job.Id.Value}_master.wav");

            job.MarkSynthesizing();
            var provider = _providerRegistry.Resolve(spec.Engine);
            var synthResult = await provider.SynthesizeAsync(cmd.Text, spec, rawFilePath, ct);
            job.MarkSynthesized(synthResult.AudioFilePath, synthResult.DurationSeconds, synthResult.FileSizeBytes);

            var alignment = await DetermineAlignmentAsync(spec, synthResult, rawFilePath, cmd.Text, ct);
            job.AttachAlignment(alignment);

            var filterSpec = cmd.Filters ?? new AudioFilterSpec();
            await _audioService.PostProcessVoiceAsync(rawFilePath, masterFilePath, filterSpec, ct);

            var mediaAssetId = await _mediaRegistrar.RegisterAudioAsync(
                title: $"Voice_{spec.SpeakerId}_{DateTime.UtcNow:yyyyMMdd_HHmmss}",
                filePath: masterFilePath,
                ct: ct);

            job.MarkReady(masterFilePath, mediaAssetId);
            await _repository.UpdateAsync(job, ct);
            await _repository.SaveChangesAsync(ct);

            _logger.LogInformation("[VoiceModule] Задача TTS {JobId} выполнена успешно", job.Id.Value);
            return VoiceJobDto.FromEntity(job);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "[VoiceModule] Ошибка пайплайна озвучки: {JobId}", job.Id.Value);
            job.MarkFailed(ex.Message);
            await _repository.UpdateAsync(job, ct);
            await _repository.SaveChangesAsync(ct);
            throw;
        }
    }

    public async Task<BatchVoiceResultDto> BatchSynthesizeAsync(BatchSynthesizeVoiceCommand cmd, CancellationToken ct = default)
    {
        var batchId = $"batch-{Guid.NewGuid():N}"[..16];
        var jobs = new List<VoiceJobDto>();
        double totalDuration = 0;

        foreach (var item in cmd.Items)
        {
            var singleCmd = new SynthesizeSpeechCommand(
                Text: item.Text,
                Engine: item.Engine,
                SpeakerId: item.SpeakerId,
                AlignmentEngine: item.AlignmentEngine,
                Speed: item.Speed,
                Filters: cmd.Filters);

            var job = await SynthesizeSpeechAsync(singleCmd, ct);
            jobs.Add(job);
            totalDuration += job.DurationSeconds ?? 0;
        }

        return new BatchVoiceResultDto(batchId, jobs, Math.Round(totalDuration, 3));
    }

    public async Task<VoiceJobDto> GetJobByIdAsync(string jobId, CancellationToken ct = default)
    {
        if (!TtsJobId.TryParse(jobId, out var id))
        {
            throw new ResourceNotFoundException("TtsJob", jobId);
        }

        var job = await _repository.GetByIdAsync(id, ct)
            ?? throw new ResourceNotFoundException("TtsJob", jobId);

        return VoiceJobDto.FromEntity(job);
    }

    public async Task<DuckedAudioResultDto> ApplyDuckingAsync(ApplyAudioDuckingCommand cmd, CancellationToken ct = default)
    {
        _logger.LogInformation("[VoiceModule] Резолвинг ассетов аудио перед дакингом: Voice={VoiceId}, BGM={BgmId}", cmd.VoiceAssetId, cmd.BgmAssetId);

        var physicalVoicePath = await _mediaRegistrar.ResolveAudioPathAsync(cmd.VoiceAssetId, ct);
        var physicalBgmPath = await _mediaRegistrar.ResolveAudioPathAsync(cmd.BgmAssetId, ct);

        var workingDir = PrepareDirectory(Path.Combine(_storageConfig.DataStorageDir, "temp", "audio_mix"));
        var outputMixedPath = Path.Combine(workingDir, $"mix_{Guid.NewGuid():N}.m4a");

        var finalPath = await _audioService.ApplySidechainDuckingAsync(
            physicalVoicePath,
            physicalBgmPath,
            outputMixedPath,
            cmd.Ducking ?? new DuckingSpec(),
            ct);

        var mediaAssetId = await _mediaRegistrar.RegisterAudioAsync(
            title: $"Mix_{DateTime.UtcNow:yyyyMMdd_HHmmss}",
            filePath: finalPath,
            ct: ct);

        return new DuckedAudioResultDto(finalPath, mediaAssetId);
    }

    public Task<IReadOnlyList<VoiceSpeakerDto>> GetAvailableSpeakersAsync(CancellationToken ct = default)
    {
        IReadOnlyList<VoiceSpeakerDto> speakers =
        [
            new("ru_speaker_sergey", "Сергей (OmniVoice Deep)", VoiceEngineType.LocalOmniVoice, "ru-RU", "Male"),
            new("ru_speaker_elena", "Елена (OmniVoice Dynamic)", VoiceEngineType.LocalOmniVoice, "ru-RU", "Female"),
            new("alloy", "Alloy (OpenAI Speech)", VoiceEngineType.CloudOpenAi, "multilingual", "Neutral"),
            new("echo", "Echo (OpenAI Speech)", VoiceEngineType.CloudOpenAi, "multilingual", "Male"),
            new("shimmer", "Shimmer (OpenAI Speech)", VoiceEngineType.CloudOpenAi, "multilingual", "Female"),
            new("male-qn-qingse", "QingSe (MiniMax T2A)", VoiceEngineType.CloudMiniMax, "multilingual", "Male")
        ];

        return Task.FromResult(speakers);
    }

    private async Task<AlignmentData> DetermineAlignmentAsync(
        VoiceSpec spec,
        RawSynthesisResult synthResult,
        string rawFilePath,
        string expectedText,
        CancellationToken ct)
    {
        if (spec.AlignmentEngine == AlignmentEngineType.Passthrough)
        {
            return AlignmentData.Empty;
        }

        if (synthResult.NativeAlignment != null && synthResult.NativeAlignment.Words.Count > 0)
        {
            return synthResult.NativeAlignment;
        }

        var aligner = _alignmentRegistry.Resolve(spec.AlignmentEngine);
        return await aligner.AlignAsync(rawFilePath, expectedText, ct);
    }

    private string PrepareDirectory(string relativePath)
    {
        var safeDir = _pathResolver.ResolveSafePath(relativePath);
        if (!Directory.Exists(safeDir)) Directory.CreateDirectory(safeDir);
        return safeDir;
    }
}
