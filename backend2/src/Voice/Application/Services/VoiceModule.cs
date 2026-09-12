using Kernel.Exceptions;
using Kernel.Platform.Config;
using Kernel.Platform.FileSystem;
using Kernel.Platform.Process;
using Kernel.Contracts;
using Kernel.Platform.Audio;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using ProductionContext.Domain.ValueObjects;
using System.Text.RegularExpressions;
using Voice.Contracts;
using Voice.Domain;
using Voice.Domain.Entities;
using Voice.Domain.Ports;
using Voice.Domain.ValueObjects;

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
    private readonly IProcessSupervisor _processSupervisor;

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
        IProcessSupervisor processSupervisor,
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
        _processSupervisor = processSupervisor;
        _logger = logger;
    }

    public async Task<BatchUploadScenesResponse> BatchUploadScenesAsync(BatchUploadScenesCommand cmd, CancellationToken ct = default)
    {
        if (cmd.Files.Count == 0)
        {
            return new BatchUploadScenesResponse("ok", [], []);
        }

        // 1. Целевая директория проекта внутри песочницы.
        string targetProjectDir;
        if (Path.IsPathRooted(cmd.ProjectPath) && _pathResolver.IsSafePath(cmd.ProjectPath))
        {
            targetProjectDir = _pathResolver.ResolveSafePath(cmd.ProjectPath);
        }
        else
        {
            var candidate = Path.Combine(_storageConfig.DataStorageDir, cmd.ProjectPath);
            targetProjectDir = _pathResolver.IsSafePath(candidate)
                ? _pathResolver.ResolveSafePath(candidate)
                : _pathResolver.ResolveSafePath(Path.Combine(_storageConfig.GetProjectsDirectory(), cmd.ProjectPath));
        }

        var voiceDir = Path.Combine(targetProjectDir, "assets", "voice");
        Directory.CreateDirectory(voiceDir);

        // 2. Сохранение файлов и замер длительности.
        var savedFiles = new List<(string OriginalName, string CleanName, string AbsolutePath, double Duration)>();

        foreach (var file in cmd.Files)
        {
            ct.ThrowIfCancellationRequested();
            var cleanName = _pathResolver.SanitizeFileName(file.FileName);
            var targetFilePath = Path.Combine(voiceDir, cleanName);

            await using (var fileStream = new FileStream(targetFilePath, FileMode.Create, FileAccess.Write, FileShare.None, 81920, true))
            {
                await file.ContentStream.CopyToAsync(fileStream, ct);
            }

            var duration = await ProbeAudioDurationAsync(targetFilePath, ct);
            savedFiles.Add((file.FileName, cleanName, targetFilePath.Replace('\\', '/'), duration));
        }

        // 3. Трёхуровневый matching engine.
        var matches = new Dictionary<string, (string AbsolutePath, double Duration)>(StringComparer.OrdinalIgnoreCase);
        var usedFiles = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var remainingScenes = new List<string>(cmd.SceneIds);

        // Уровень 1: прямое вхождение scene_id в имя файла.
        foreach (var sceneId in remainingScenes.ToList())
        {
            var found = savedFiles.FirstOrDefault(f =>
                !usedFiles.Contains(f.CleanName) &&
                Path.GetFileNameWithoutExtension(f.CleanName).Contains(sceneId, StringComparison.OrdinalIgnoreCase));

            if (found.CleanName != null)
            {
                matches[sceneId] = (found.AbsolutePath, found.Duration);
                usedFiles.Add(found.CleanName);
                remainingScenes.Remove(sceneId);
            }
        }

        // Уровень 2: числовой индекс в имени (voice_01, scene-2, track03...).
        var numberRegex = new Regex(@"(?:voice|scene|track|part)?[-_#\s]*0*(\d+)", RegexOptions.IgnoreCase);
        foreach (var file in savedFiles.Where(f => !usedFiles.Contains(f.CleanName)))
        {
            var nameWithoutExt = Path.GetFileNameWithoutExtension(file.CleanName);
            var match = numberRegex.Match(nameWithoutExt);
            if (match.Success && int.TryParse(match.Groups[1].Value, out var number))
            {
                var index = number - 1;
                if (index >= 0 && index < cmd.SceneIds.Count)
                {
                    var candidateSceneId = cmd.SceneIds[index];
                    if (remainingScenes.Contains(candidateSceneId))
                    {
                        matches[candidateSceneId] = (file.AbsolutePath, file.Duration);
                        usedFiles.Add(file.CleanName);
                        remainingScenes.Remove(candidateSceneId);
                    }
                }
            }
        }

        // Уровень 3: позиционный алфавитный фолбэк.
        var remainingFiles = savedFiles
            .Where(f => !usedFiles.Contains(f.CleanName))
            .OrderBy(f => f.CleanName, StringComparer.OrdinalIgnoreCase)
            .ToList();

        var pairCount = Math.Min(remainingFiles.Count, remainingScenes.Count);
        for (var i = 0; i < pairCount; i++)
        {
            var sceneId = remainingScenes[i];
            var file = remainingFiles[i];
            matches[sceneId] = (file.AbsolutePath, file.Duration);
            usedFiles.Add(file.CleanName);
        }

        // 4. Формирование ответа.
        var resultMatches = cmd.SceneIds
            .Where(id => matches.ContainsKey(id))
            .Select(id => new SceneAudioMatchDto(id, matches[id].AbsolutePath, matches[id].Duration))
            .ToList();

        var unmatchedFiles = savedFiles
            .Where(f => !usedFiles.Contains(f.CleanName))
            .Select(f => f.OriginalName)
            .ToList();

        _logger.LogInformation(
            "[VoiceModule:BatchUpload] Файлов: {Total}, сматчено: {Matched}, без соответствия: {Unmatched}",
            savedFiles.Count, resultMatches.Count, unmatchedFiles.Count);

        return new BatchUploadScenesResponse("ok", resultMatches, unmatchedFiles);
    }

    private async Task<double> ProbeAudioDurationAsync(string filePath, CancellationToken ct)
    {
        if (filePath.EndsWith(".wav", StringComparison.OrdinalIgnoreCase))
        {
            try
            {
                var wavDur = WavAudioDecoder.ProbeWavDuration(filePath);
                if (wavDur > 0) return Math.Round(wavDur, 2);
            }
            catch { /* не-WAV / битый заголовок — падаем на ffprobe */ }
        }

        try
        {
            var args = $"-v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 \"{filePath}\"";
            var result = await _processSupervisor.RunAsync("ffprobe", args, cancellationToken: ct);
            if (result.ExitCode == 0 && double.TryParse(
                    result.StandardOutput.Trim(),
                    System.Globalization.NumberStyles.Float,
                    System.Globalization.CultureInfo.InvariantCulture,
                    out var sec))
            {
                return Math.Round(sec, 2);
            }
        }
        catch (Exception ex)
        {
            _logger.LogDebug(ex, "[VoiceModule] Ошибка ffprobe при измерении длительности: {Path}", filePath);
        }

        return 0;
    }

    public async Task<VoiceJobDto> SynthesizeSpeechAsync(SynthesizeSpeechCommand cmd, CancellationToken ct = default)
    {
        var speaker = await _speakerRepo.GetBySpeakerIdAsync(new SpeakerId(cmd.SpeakerId), ct);

        var refAudio = cmd.ReferenceAudioPath;
        string? refText = null;
        string? instruct = null;

        if (speaker != null)
        {
            if (speaker.SourceType == SpeakerSourceType.Cloned)
            {
                if (string.IsNullOrWhiteSpace(refAudio) && !string.IsNullOrWhiteSpace(speaker.CloneReferenceAudioPath))
                    refAudio = speaker.CloneReferenceAudioPath;
                refText = speaker.CloneReferenceText;
            }
            else if (speaker.SourceType == SpeakerSourceType.Designed)
            {
                instruct = speaker.DesignedDescription;
            }
        }

        var engine = cmd.Engine ?? speaker?.Engine ?? VoiceEngineType.CloudOpenAi;
        var spec = new VoiceSpec(
            engine, cmd.SpeakerId, cmd.AlignmentEngine, cmd.Speed, cmd.Pitch, refAudio,
            cmd.GuidanceScale, cmd.NumSteps, cmd.Denoise, cmd.Duration, cmd.PreprocessPrompt, cmd.PostprocessOutput, refText)
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
            var audioFilePath = Path.Combine(workingDir, $"{job.Id.Value}.wav");

            job.MarkSynthesizing();
            var provider = _providerRegistry.Resolve(spec.Engine);

            // Очищаем текст от тегов <#X#> и [emotion:], если это не MiniMax
            var textToSynthesize = spec.Engine == VoiceEngineType.CloudMiniMax
                ? cmd.Text
                : VoiceTagSanitizer.NormalizeForSynthesis(cmd.Text);

            // Voice отвечает только за генерацию: чистый синтез без FFmpeg-мастеринга (LUFS, вырезание тишины).
            var synthResult = await provider.SynthesizeAsync(textToSynthesize, spec, audioFilePath, ct);

            // Честная длительность и размер готового файла (провайдер может вернуть 0.0).
            double actualDuration = synthResult.DurationSeconds > 0
                ? synthResult.DurationSeconds
                : WavAudioDecoder.ProbeWavDuration(synthResult.AudioFilePath);
            long actualSizeBytes = new FileInfo(synthResult.AudioFilePath).Length;
            job.MarkSynthesized(synthResult.AudioFilePath, actualDuration, actualSizeBytes);

            // Forced Alignment по уже сгенерированному чистому файлу.
            var alignment = await DetermineAlignmentAsync(spec, synthResult, synthResult.AudioFilePath, textToSynthesize, ct);
            job.AttachAlignment(alignment);

            var mediaAssetId = await _mediaRegistrar.RegisterAudioAsync(
                title: $"Voice_{spec.SpeakerId}_{DateTime.UtcNow:yyyyMMdd_HHmmss}",
                filePath: synthResult.AudioFilePath,
                ct: ct);

            job.MarkReady(synthResult.AudioFilePath, mediaAssetId);
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

        // Локальный воркер (OmniVoice) не должен сам скачивать Whisper ASR:
        // если текст эталона не задан, транскрибируем его нативным Whisper (C#)
        // и передаём в reference_text. Это исключает загрузку openai/whisper-*.
        var referenceText = request.ReferenceText;
        if (request.Engine == VoiceEngineType.LocalTts && string.IsNullOrWhiteSpace(referenceText))
        {
            _logger.LogInformation("[VoiceModule] Текст эталона не задан — транскрибирую через C# Whisper.");
            try
            {
                referenceText = await TranscribeAudioAsync(referenceAudioPath, ct);
                _logger.LogInformation("[VoiceModule] Whisper распознал эталон: '{Text}'", referenceText);
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                _logger.LogWarning(ex, "[VoiceModule] Не удалось распознать эталон клонирования через C# Whisper.");
            }
        }

        var spec = new ClonedVoiceSpec(
            request.Engine, referenceAudioPath, request.Name,
            referenceText, request.Language, request.LocalEngineId);

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
        var safeAudio = ResolveExistingAudioPath(request.AudioPath);
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
        var safeAudio = ResolveExistingAudioPath(audioFilePath);
        var aligner = _alignmentRegistry.Resolve(AlignmentEngineType.Whisper);
        var data = await aligner.AlignAsync(safeAudio, "", ct);
        return string.Join(" ", data.Words.Select(w => w.Word)).Trim();
    }

    public async Task<ProcessAudioDspResponse> ProcessAudioDspAsync(ProcessAudioDspRequest request, CancellationToken ct = default)
    {
        var safeInput = ResolveExistingAudioPath(request.AudioPath);
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
        var lines = audioPaths.Select(p => $"file '{ResolveExistingAudioPath(p).Replace('\\', '/')}'");
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

    public async Task<IReadOnlyList<VoiceEngineInfoDto>> GetAvailableEnginesAsync(CancellationToken ct = default)
    {
        var engines = await _engineCatalog.DiscoverEnginesAsync(ct);

        return engines
            .Select(e => new VoiceEngineInfoDto(
                e.Id,
                e.Name,
                e.Mode,
                e.Capabilities,
                e.SupportsClone,
                e.SupportsDesign,
                e.SupportsSynthesis,
                e.IsAvailable,
                e.StatusMessage,
                e.Description))
            .ToList();
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

    /// <summary>
    /// Умный резолвер аудио: находит физический файл, даже если клиент прислал
    /// относительный путь проекта ("test/assets/voice/x.wav") или просто имя файла,
    /// а сам файл лежит в temp/voice (после TTS) или в projects/{project}/assets/voice.
    /// </summary>
    private string ResolveExistingAudioPath(string inputPath, string? projectPath = null) =>
        StorageFileLocator.ResolveExistingAsset(_pathResolver, _storageConfig, _logger, inputPath, projectPath);

    private string PrepareDirectory(string relativePath)
    {
        var safeDir = _pathResolver.ResolveSafePath(relativePath);
        if (!Directory.Exists(safeDir)) Directory.CreateDirectory(safeDir);
        return safeDir;
    }
}
