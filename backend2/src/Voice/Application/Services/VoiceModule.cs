using Kernel.Exceptions;
using Kernel.Platform.Config;
using Kernel.Platform.FileSystem;
using Integrations.Whisper.Audio;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using ProductionContext.Domain.ValueObjects;
using Voice.Application.Commands;
using Voice.Application.Contracts;
using Voice.Application.Services;
using Voice.Domain;
using Voice.Domain.Entities;
using Voice.Domain.Ports;
using Voice.Domain.ValueObjects;
using Voice.Infrastructure.Alignment;
using Voice.Infrastructure.Providers;
using Voice.Infrastructure.Providers.Local;

namespace Voice.Application.Services;

public sealed class VoiceModule : IVoiceModule
{
    private readonly ITtsJobRepository _repository;
    private readonly ISpeakerProfileRepository _speakerRepo;
    private readonly TtsProviderRegistry _providerRegistry;
    private readonly AlignmentProviderRegistry _alignmentRegistry;
    private readonly VoiceCloneProviderRegistry _cloneRegistry;
    private readonly IAudioDuckingService _audioService;
    private readonly IVoiceMediaRegistrar _mediaRegistrar;
    private readonly IPathResolver _pathResolver;
    private readonly AppStorageConfig _storageConfig;
    private readonly ILogger<VoiceModule> _logger;
    private readonly IVoiceEngineCatalog _engineCatalog;
    private readonly ILocalTtsClient _localTtsClient;

    public VoiceModule(
        ITtsJobRepository repository,
        ISpeakerProfileRepository speakerRepo,
        TtsProviderRegistry providerRegistry,
        AlignmentProviderRegistry alignmentRegistry,
        VoiceCloneProviderRegistry cloneRegistry,
        IVoiceEngineCatalog engineCatalog,
        IAudioDuckingService audioService,
        IVoiceMediaRegistrar mediaRegistrar,
        IPathResolver pathResolver,
        IOptions<AppStorageConfig> storageConfig,
        ILocalTtsClient localTtsClient,
        ILogger<VoiceModule> logger)
    {
        _repository = repository;
        _speakerRepo = speakerRepo;
        _providerRegistry = providerRegistry;
        _alignmentRegistry = alignmentRegistry;
        _cloneRegistry = cloneRegistry;
        _engineCatalog = engineCatalog;
        _audioService = audioService;
        _mediaRegistrar = mediaRegistrar;
        _pathResolver = pathResolver;
        _storageConfig = storageConfig.Value;
        _localTtsClient = localTtsClient;
        _logger = logger;
    }

    public async Task<VoiceJobDto> SynthesizeSpeechAsync(SynthesizeSpeechCommand cmd, CancellationToken ct = default)
    {
        var speaker = await _speakerRepo.GetBySpeakerIdAsync(new SpeakerId(cmd.SpeakerId), ct);

        var refAudio = cmd.ReferenceAudioPath;
        string? instruct = null;

        if (speaker != null)
        {
            if (speaker.SourceType == SpeakerSourceType.Cloned)
            {
                if (string.IsNullOrWhiteSpace(refAudio) && !string.IsNullOrWhiteSpace(speaker.CloneReferenceAudioPath))
                    refAudio = speaker.CloneReferenceAudioPath;
            }
            else if (speaker.SourceType == SpeakerSourceType.Designed)
            {
                instruct = speaker.DesignedDescription;
            }
        }

        var engine = cmd.Engine ?? speaker?.Engine ?? VoiceEngineType.CloudOpenAi;
        var spec = new VoiceSpec(
            engine, cmd.SpeakerId, cmd.AlignmentEngine, cmd.Speed, cmd.Pitch, refAudio,
            cmd.GuidanceScale, cmd.NumSteps, cmd.Denoise, cmd.Duration, cmd.PreprocessPrompt, cmd.PostprocessOutput)
        {
            // Данные локального ML-воркера и Voice Design пробрасываем из профиля диктора
            LocalEngineId = speaker?.LocalEngineId,
            LocalEmbeddingPath = speaker?.LocalEmbeddingPath,
            InstructPrompt = instruct
        };
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
                Pitch: item.Pitch,
                Filters: cmd.Filters,
                GuidanceScale: item.GuidanceScale,
                NumSteps: item.NumSteps);

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

    public async Task<IReadOnlyList<VoiceSpeakerDto>> GetAvailableSpeakersAsync(CancellationToken ct = default)
    {
        var profiles = await _speakerRepo.GetActiveAsync(ct);
        return profiles.Select(p => new VoiceSpeakerDto(p.SpeakerId.Value, p.Name, p.Engine, p.Language, p.Gender ?? "Unknown")).ToList();
    }

    public async Task<IReadOnlyList<SpeakerProfileDto>> GetAllSpeakersAsync(CancellationToken ct = default)
    {
        var profiles = await _speakerRepo.GetAllAsync(ct);
        return profiles.Select(SpeakerProfileDto.FromEntity).ToList();
    }

    public async Task<SpeakerProfileDto?> GetSpeakerByIdAsync(string id, CancellationToken ct = default)
    {
        var profile = await _speakerRepo.GetByIdAsync(id, ct);
        return profile == null ? null : SpeakerProfileDto.FromEntity(profile);
    }

    public async Task<SpeakerProfileDto> CreateClonedSpeakerAsync(CloneSpeakerRequest request, string referenceAudioPath, CancellationToken ct = default)
    {
        _logger.LogInformation("[VoiceModule] Клонирование голоса: '{Name}' через {Engine}", request.Name, request.Engine);

        var spec = new ClonedVoiceSpec(
            request.Engine, referenceAudioPath, request.Name,
            request.ReferenceText, request.Language, request.LocalEngineId);

        var provider = _cloneRegistry.Resolve(request.Engine);
        var result = await provider.CloneVoiceAsync(spec, ct);

        var speakerId = new SpeakerId(result.SpeakerId);
        var profile = SpeakerProfile.CreateCloned(speakerId, request.Engine, spec, result.LocalEmbeddingPath);
        profile.SetPreviewAudio(result.PreviewAudioPath!);

        await _speakerRepo.AddAsync(profile, ct);
        await _speakerRepo.SaveChangesAsync(ct);

        _logger.LogInformation("[VoiceModule] Голос клонирован: {Id} ({Name})", profile.Id, profile.Name);
        return SpeakerProfileDto.FromEntity(profile);
    }

    public async Task<SpeakerProfileDto> CreateDesignedSpeakerAsync(CreateDesignedSpeakerRequest request, CancellationToken ct = default)
    {
        _logger.LogInformation("[VoiceModule] Дизайн голоса через {Engine}. Промпт: '{Prompt}'", request.Engine, request.Prompt);

        var spec = new VoiceDesignSpec(
            prompt: request.Prompt,
            localEngineId: request.LocalEngineId);

        var speakerId = new SpeakerId($"des_{Guid.NewGuid():N}"[..16]);
        var instructString = spec.ToInstructString();

        var profile = SpeakerProfile.CreateDesigned(speakerId, request.Engine, spec, instructString);
        profile.UpdateName(request.Name);

        // Сохраняем профиль до генерации превью, т.к. синтез читает диктора из БД
        await _speakerRepo.AddAsync(profile, ct);
        await _speakerRepo.SaveChangesAsync(ct);

        try
        {
            // Превью автоматически подхватит DesignedDescription как instruct-промпт
            var previewText = "Привет! Это демонстрация моего нового голоса, созданного по текстовому описанию.";
            var previewJob = await SynthesizeSpeechAsync(new SynthesizeSpeechCommand(
                Text: previewText,
                SpeakerId: profile.SpeakerId.Value,
                Engine: profile.Engine,
                AlignmentEngine: AlignmentEngineType.Passthrough), ct);

            profile.SetPreviewAudio(previewJob.AudioPath);
            await _speakerRepo.UpdateAsync(profile, ct);
            await _speakerRepo.SaveChangesAsync(ct);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "[VoiceModule] Не удалось сгенерировать превью для дизайн-голоса '{Name}'.", request.Name);
        }

        _logger.LogInformation("[VoiceModule] Дизайн-голос создан: {Id} ({Name})", profile.Id, profile.Name);
        return SpeakerProfileDto.FromEntity(profile);
    }

    public async Task<SpeakerProfileDto> UpdateSpeakerAsync(string id, UpdateSpeakerRequest request, CancellationToken ct = default)
    {
        var profile = await _speakerRepo.GetByIdAsync(id, ct)
            ?? throw new ResourceNotFoundException("SpeakerProfile", id);

        profile.UpdateName(request.Name);
        await _speakerRepo.UpdateAsync(profile, ct);
        await _speakerRepo.SaveChangesAsync(ct);

        return SpeakerProfileDto.FromEntity(profile);
    }

    public async Task DeleteSpeakerAsync(string id, CancellationToken ct = default)
    {
        var profile = await _speakerRepo.GetByIdAsync(id, ct)
            ?? throw new ResourceNotFoundException("SpeakerProfile", id);

        profile.AssertCanDelete();
        DeleteAssociatedFiles(profile);

        await _speakerRepo.DeleteAsync(profile, ct);
        await _speakerRepo.SaveChangesAsync(ct);
    }

    private void DeleteAssociatedFiles(SpeakerProfile profile)
    {
        DeleteIfExists(profile.PreviewAudioPath);
        DeleteIfExists(profile.CloneReferenceAudioPath);
        DeleteIfExists(profile.LocalEmbeddingPath);
    }

    private void DeleteIfExists(string? filePath)
    {
        if (string.IsNullOrWhiteSpace(filePath))
            return;

        try
        {
            var safePath = _pathResolver.ResolveSafePath(filePath);
            if (File.Exists(safePath))
            {
                File.Delete(safePath);
                _logger.LogInformation("[VoiceModule] Удалён файл диктора: {Path}", safePath);
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "[VoiceModule] Не удалось удалить связанный файл диктора: {Path}", filePath);
        }
    }

    public async Task<VoiceJobDto> GenerateSpeakerPreviewAsync(string id, GeneratePreviewRequest request, CancellationToken ct = default)
    {
        var profile = await _speakerRepo.GetByIdAsync(id, ct)
            ?? throw new ResourceNotFoundException("SpeakerProfile", id);

        var cmd = new SynthesizeSpeechCommand(
            Text: request.Text,
            Engine: profile.Engine,
            SpeakerId: profile.SpeakerId.Value,
            Speed: request.Speed,
            ReferenceAudioPath: profile.CloneReferenceAudioPath);

        var job = await SynthesizeSpeechAsync(cmd, ct);

        profile.SetPreviewAudio(job.AudioPath);
        await _speakerRepo.UpdateAsync(profile, ct);
        await _speakerRepo.SaveChangesAsync(ct);

        return job;
    }

    public async Task<AlignSpeechResponse> AlignSpeechAsync(AlignSpeechRequest request, CancellationToken ct = default)
    {
        var safeAudio = _pathResolver.ResolveSafePath(request.AudioPath);
        var combinedText = string.Join(" ", request.Fragments.Select(f => f.Text));
        var aligner = _alignmentRegistry.Resolve(AlignmentEngineType.Whisper);
        var alignmentData = await aligner.AlignAsync(safeAudio, combinedText, ct);

        var timings = new List<FragmentTimingResultDto>();
        double curOffset = 0.0;

        foreach (var frag in request.Fragments)
        {
            var words = frag.Text.Split(' ', StringSplitOptions.RemoveEmptyEntries);
            double dur = Math.Max(SpeechPacingDefaults.MinFragmentSeconds, words.Length / SpeechPacingDefaults.WordsPerSecond);

            timings.Add(new FragmentTimingResultDto(
                Id: frag.Id,
                StartTime: Math.Round(curOffset, 3),
                EndTime: Math.Round(curOffset + dur, 3)));

            curOffset += dur;
        }

        return new AlignSpeechResponse("ok", timings, Fallback: alignmentData.Words.Count == 0);
    }

    public async Task<string> TranscribeAudioAsync(string audioFilePath, CancellationToken ct = default)
    {
        var safeAudio = _pathResolver.ResolveSafePath(audioFilePath);
        var aligner = _alignmentRegistry.Resolve(AlignmentEngineType.Whisper);
        var data = await aligner.AlignAsync(safeAudio, "", ct);
        return string.Join(" ", data.Words.Select(w => w.Word)).Trim();
    }

    public async Task<ProcessAudioDspResponse> ProcessAudioDspAsync(ProcessAudioDspRequest request, CancellationToken ct = default)
    {
        var safeInput = _pathResolver.ResolveSafePath(request.AudioPath);
        var ext = Path.GetExtension(safeInput);
        var dir = Path.GetDirectoryName(safeInput)!;
        var safeOutput = Path.Combine(dir, $"{Path.GetFileNameWithoutExtension(safeInput)}_dsp{ext}");

        var filterSpec = new AudioFilterSpec
        {
            TargetLufs = -14.0,
            RemoveSilence = request.Action.Contains("silence", StringComparison.OrdinalIgnoreCase),
            SilenceThresholdDb = request.ThresholdDb ?? -42.0
        };

        var processed = await _audioService.PostProcessVoiceAsync(safeInput, safeOutput, filterSpec, ct);
        double estimatedDuration = WavAudioDecoder.ProbeWavDuration(processed);

        return new ProcessAudioDspResponse("ok", processed, Math.Round(estimatedDuration, 2));
    }

    public async Task<string> ConcatenateAudioAsync(IReadOnlyList<string> audioPaths, string outputPath, CancellationToken ct = default)
    {
        var safeOut = _pathResolver.ResolveSafePath(outputPath);
        var dir = Path.GetDirectoryName(safeOut)!;
        Directory.CreateDirectory(dir);

        var listFile = Path.Combine(dir, $"concat_{Guid.NewGuid():N}.txt");
        var lines = audioPaths.Select(p => $"file '{_pathResolver.ResolveSafePath(p).Replace('\\', '/')}'");
        await File.WriteAllLinesAsync(listFile, lines, ct);

        try
        {
            var ffmpegArgs = $"-y -f concat -safe 0 -i \"{listFile}\" -c copy \"{safeOut}\"";
            using var proc = System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo
            {
                FileName = "ffmpeg",
                Arguments = ffmpegArgs,
                WorkingDirectory = dir,
                CreateNoWindow = true,
                UseShellExecute = false
            });
            if (proc != null) await proc.WaitForExitAsync(ct);
        }
        finally
        {
            if (File.Exists(listFile)) File.Delete(listFile);
        }

        return safeOut;
    }

    public async Task UnloadVramAsync(CancellationToken ct = default)
    {
        _logger.LogInformation("[VoiceModule] Запрос выгрузки VRAM локального ML-воркера.");
        await _localTtsClient.UnloadVramAsync(ct);
    }

    public Task<IReadOnlyList<VoiceEngineInfoDto>> GetAvailableEnginesAsync(CancellationToken ct = default)
    {
        return _engineCatalog.DiscoverEnginesAsync(ct);
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
