using System.Text.Json;
using System.Text.Json.Serialization;
using Kernel.Exceptions;
using Kernel.Platform.Config;
using Kernel.Platform.FileSystem;
using Kernel.Platform.Gpu;
using Kernel.Platform.Process;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.Options;
using Voice.Contracts;
using Voice.Domain;
using Voice.Domain.Ports;
using Voice.Domain.ValueObjects;

namespace Api.Endpoints.Voice;

public static class VoiceEndpoints
{
    public static IEndpointRouteBuilder MapVoiceEndpoints(this IEndpointRouteBuilder endpoints)
    {
        var group = endpoints.MapGroup("/api/v1/voice").WithTags("Voice");

        group.MapGet("/engines", async (IVoiceModule voice, CancellationToken ct) =>
        {
            var engines = await voice.GetAvailableEnginesAsync(ct);
            return Results.Ok(engines);
        }).Produces<IReadOnlyList<VoiceEngineInfoDto>>();

        group.MapPost("/synthesize", async (SynthesizeSpeechRequest request, IVoiceModule voice, CancellationToken ct) =>
        {
            var command = new SynthesizeSpeechCommand(
                Text: request.Text,
                Engine: request.Engine,
                SpeakerId: request.SpeakerId,
                AlignmentEngine: request.AlignmentEngine ?? AlignmentEngineType.Whisper,
                Speed: request.EffectiveSpeed,
                Pitch: request.EffectivePitch,
                ReferenceAudioPath: request.ReferenceAudioPath,
                Filters: request.Filters,
                GuidanceScale: request.EffectiveGuidanceScale,
                NumSteps: request.EffectiveNumSteps,
                Denoise: request.EffectiveDenoise,
                Duration: request.EffectiveDuration,
                PreprocessPrompt: request.EffectivePreprocess,
                PostprocessOutput: request.EffectivePostprocess);

            var result = await voice.SynthesizeSpeechAsync(command, ct);
            return Results.Ok(result);
        }).Produces<VoiceJobDto>();

        group.MapPost("/batch", async (BatchSynthesizeRequest request, IVoiceModule voice, CancellationToken ct) =>
        {
            var items = request.Items.Select(i => new BatchItemSpec(
                i.Text,
                i.SpeakerId,
                i.Engine,
                i.AlignmentEngine ?? AlignmentEngineType.Whisper,
                i.Speed,
                i.Pitch,
                i.GuidanceScale,
                i.NumSteps)).ToList();

            var command = new BatchSynthesizeVoiceCommand(items, request.Filters);
            var result = await voice.BatchSynthesizeAsync(command, ct);
            return Results.Ok(result);
        }).Produces<BatchVoiceResultDto>();

        group.MapGet("/jobs/{id}", async (string id, IVoiceModule voice, CancellationToken ct) =>
        {
            var job = await voice.GetJobByIdAsync(id, ct);
            return Results.Ok(job);
        }).Produces<VoiceJobDto>();

        group.MapPost("/ducking", async (DuckingRequest request, IVoiceModule voice, CancellationToken ct) =>
        {
            var command = new ApplyAudioDuckingCommand(
                request.VoiceAssetId,
                request.BgmAssetId,
                new DuckingSpec
                {
                    MusicAttenuationDb = request.MusicAttenuationDb ?? -18.0,
                    AttackMs = request.AttackMs ?? 40,
                    ReleaseMs = request.ReleaseMs ?? 350
                });

            var result = await voice.ApplyDuckingAsync(command, ct);
            return Results.Ok(result);
        }).Produces<DuckedAudioResultDto>();

        group.MapGet("/speakers", async (IVoiceModule voice, CancellationToken ct) =>
        {
            var speakers = await voice.GetAvailableSpeakersAsync(ct);
            return Results.Ok(speakers);
        }).Produces<IReadOnlyList<VoiceSpeakerDto>>();

        var speakerGroup = group.MapGroup("/speakers/profiles").WithTags("Speaker Profiles");

        speakerGroup.MapGet("/", async (IVoiceModule voice, CancellationToken ct) =>
        {
            var profiles = await voice.GetAllSpeakersAsync(ct);
            return Results.Ok(profiles);
        }).Produces<IReadOnlyList<SpeakerProfileDto>>();

        speakerGroup.MapGet("/{id}", async (string id, IVoiceModule voice, CancellationToken ct) =>
        {
            var profile = await voice.GetSpeakerByIdAsync(id, ct);
            return profile is null ? Results.NotFound() : Results.Ok(profile);
        }).Produces<SpeakerProfileDto>();

        speakerGroup.MapPost("/clone", async (
            [FromForm] string name,
            [FromForm] VoiceEngineType engine,
            [FromForm] string? referenceText,
            [FromForm] string? language,
            [FromForm] string? localEngineId,
            IFormFile referenceAudio,
            IVoiceModule voice,
            IPathResolver pathResolver,
            IOptions<AppStorageConfig> storageConfig,
            CancellationToken ct) =>
        {
            if (referenceAudio is null || referenceAudio.Length == 0)
            {
                throw new ValidationException("referenceAudio", "Аудиофайл референса обязателен.");
            }

            // Сохраняем эталон внутри доверенной песочницы (data_storage/temp),
            // т.к. системный %TEMP% находится за пределами разрешённых корней IPathResolver.
            var cloneRefDir = pathResolver.ResolveSafePath(
                Path.Combine(storageConfig.Value.DataStorageDir, "temp", "voice", "clone_references"));
            Directory.CreateDirectory(cloneRefDir);

            var tempPath = Path.Combine(cloneRefDir, $"clone_ref_{Guid.NewGuid():N}{Path.GetExtension(referenceAudio.FileName)}");
            await using (var fs = File.Create(tempPath))
            {
                await referenceAudio.CopyToAsync(fs, ct);
            }

            var request = new CloneSpeakerRequest(name, engine, referenceText, language, localEngineId);
            var profile = await voice.CreateClonedSpeakerAsync(request, tempPath, ct);
            return Results.Created($"/api/v1/voice/speakers/profiles/{profile.Id}", profile);
        }).Produces<SpeakerProfileDto>(StatusCodes.Status201Created).DisableAntiforgery();

        speakerGroup.MapPost("/design", async (CreateDesignedSpeakerRequest request, IVoiceModule voice, CancellationToken ct) =>
        {
            var profile = await voice.CreateDesignedSpeakerAsync(request, ct);
            return Results.Created($"/api/v1/voice/speakers/profiles/{profile.Id}", profile);
        }).Produces<SpeakerProfileDto>(StatusCodes.Status201Created);

        speakerGroup.MapPut("/{id}", async (string id, UpdateSpeakerRequest request, IVoiceModule voice, CancellationToken ct) =>
        {
            var profile = await voice.UpdateSpeakerAsync(id, request, ct);
            return Results.Ok(profile);
        }).Produces<SpeakerProfileDto>();

        speakerGroup.MapDelete("/{id}", async (string id, IVoiceModule voice, CancellationToken ct) =>
        {
            await voice.DeleteSpeakerAsync(id, ct);
            return Results.NoContent();
        }).Produces(StatusCodes.Status204NoContent);

        speakerGroup.MapPost("/{id}/preview", async (string id, GeneratePreviewRequest request, IVoiceModule voice, CancellationToken ct) =>
        {
            var job = await voice.GenerateSpeakerPreviewAsync(id, request, ct);
            return Results.Ok(job);
        }).Produces<VoiceJobDto>();

        group.MapPost("/align", async (AlignSpeechRequest request, IVoiceModule voice, CancellationToken ct) =>
        {
            var result = await voice.AlignSpeechAsync(request, ct);
            return Results.Ok(result);
        }).Produces<AlignSpeechResponse>();

        group.MapPost("/transcribe", async (TranscribeAudioRequest request, IVoiceModule voice, CancellationToken ct) =>
        {
            var text = await voice.TranscribeAudioAsync(request.AudioPath, ct);
            return Results.Ok(new TranscribeAudioResponse("ok", text));
        }).Produces<TranscribeAudioResponse>();

        group.MapPost("/process-dsp", async (ProcessAudioDspRequest request, IVoiceModule voice, CancellationToken ct) =>
        {
            var res = await voice.ProcessAudioDspAsync(request, ct);
            return Results.Ok(res);
        }).Produces<ProcessAudioDspResponse>();

        group.MapPost("/concat", async (ConcatAudioRequest request, IVoiceModule voice, CancellationToken ct) =>
        {
            var outPath = await voice.ConcatenateAudioAsync(request.AudioPaths, request.OutputPath, ct);
            return Results.Ok(new { status = "ok", output_path = outPath });
        }).Produces<AudioConcatResponse>();

        group.MapPost("/vram/unload", async (IVoiceModule voice, IGpuManager gpu, CancellationToken ct) =>
        {
            await voice.UnloadVramAsync(ct); // локальный ML-воркер
            await gpu.CleanMemoryAsync(ct);  // нативный C# GPU-стек (Whisper и т.п.)
            return Results.Ok(new { status = "ok" });
        }).Produces<VoiceStatusResponse>();

        // --- Compatibility aliases for frontend ---
        endpoints.MapPost("/api/v1/audio/generate", async (SynthesizeSpeechRequest request, IVoiceModule voice, CancellationToken ct) =>
        {
            var cmd = new SynthesizeSpeechCommand(
                Text: request.Text,
                Engine: request.Engine,
                SpeakerId: request.SpeakerId,
                AlignmentEngine: request.AlignmentEngine ?? AlignmentEngineType.Whisper,
                Speed: request.EffectiveSpeed,
                Pitch: request.EffectivePitch,
                ReferenceAudioPath: request.ReferenceAudioPath,
                Filters: request.Filters,
                GuidanceScale: request.EffectiveGuidanceScale,
                NumSteps: request.EffectiveNumSteps,
                Denoise: request.EffectiveDenoise,
                Duration: request.EffectiveDuration,
                PreprocessPrompt: request.EffectivePreprocess,
                PostprocessOutput: request.EffectivePostprocess);

            var res = await voice.SynthesizeSpeechAsync(cmd, ct);
            return Results.Ok(new
            {
                status = "ok",
                audio_url = Path.GetFileName(res.AudioPath ?? "output.wav"),
                duration = res.DurationSeconds ?? 2.0
            });
        }).Produces<AudioGenerateResponse>();

        endpoints.MapPost("/api/v1/audio/sync", async (AlignSpeechRequest request, IVoiceModule voice, CancellationToken ct) =>
            Results.Ok(await voice.AlignSpeechAsync(request, ct)))
            .Produces<AlignSpeechResponse>();

        endpoints.MapPost("/api/v1/audio/process", async (ProcessAudioDspRequest request, IVoiceModule voice, CancellationToken ct) =>
            Results.Ok(await voice.ProcessAudioDspAsync(request, ct)))
            .Produces<ProcessAudioDspResponse>();

        endpoints.MapPost("/api/v1/audio/process/advanced-silence", async (ProcessAudioDspRequest request, IVoiceModule voice, CancellationToken ct) =>
            Results.Ok(await voice.ProcessAudioDspAsync(request with { Action = "silence" }, ct)))
            .Produces<ProcessAudioDspResponse>();

        endpoints.MapPost("/api/v1/audio/transcribe", async (TranscribeAudioRequest request, IVoiceModule voice, CancellationToken ct) =>
            Results.Ok(new TranscribeAudioResponse("ok", await voice.TranscribeAudioAsync(request.AudioPath, ct))))
            .Produces<TranscribeAudioResponse>();

        endpoints.MapPost("/api/v1/audio/concat", async (ConcatAudioRequest request, IVoiceModule voice, CancellationToken ct) =>
            Results.Ok(new { status = "ok", output_path = await voice.ConcatenateAudioAsync(request.AudioPaths, request.OutputPath, ct) }))
            .Produces<AudioConcatResponse>();

        endpoints.MapPost("/api/v1/audio/vram/unload", async (IVoiceModule voice, IGpuManager gpu, CancellationToken ct) =>
        {
            await voice.UnloadVramAsync(ct); // локальный ML-воркер
            await gpu.CleanMemoryAsync(ct);  // нативный C# GPU-стек (Whisper и т.п.)
            return Results.Ok(new { status = "ok" });
        }).Produces<VoiceStatusResponse>();

        // Тест-драйв ducking: собирает короткий предпросмотр микса голос+музыка.
        endpoints.MapPost("/api/v1/audio/preview-ducking", async (
            PreviewDuckingRequest request,
            IAudioDuckingService ducking,
            IProcessSupervisor processSupervisor,
            IPathResolver pathResolver,
            IOptions<AppStorageConfig> storageConfig,
            CancellationToken ct) =>
        {
            if (string.IsNullOrWhiteSpace(request.VoicePath) || string.IsNullOrWhiteSpace(request.MusicPath))
            {
                return Results.BadRequest(new { status = "error", detail = "voicePath и musicPath обязательны." });
            }

            var tempDir = pathResolver.ResolveSafePath(Path.Combine(storageConfig.Value.DataStorageDir, "temp"));
            Directory.CreateDirectory(tempDir);
            var outPath = pathResolver.ResolveSafePath(Path.Combine(tempDir, $"ducking_preview_{Guid.NewGuid():N}.m4a"));

            var attenuationDb = request.BaseVolume > 0 && request.DuckedVolume > 0
                ? 20.0 * Math.Log10(request.DuckedVolume / request.BaseVolume)
                : -18.0;

            var spec = new DuckingSpec
            {
                MusicAttenuationDb = Math.Clamp(attenuationDb, -60.0, 0.0),
                AttackMs = request.AttackMs,
                ReleaseMs = request.ReleaseMs,
                Threshold = request.Threshold,
            };

            var result = await ducking.ApplySidechainDuckingAsync(
                request.VoicePath!, request.MusicPath!, outPath, spec, ct);

            // Обрезаем микс до запрошенной длительности предпросмотра (по умолчанию 10 c).
            if (request.PreviewDuration > 0 && File.Exists(result))
            {
                var trimmed = pathResolver.ResolveSafePath(Path.Combine(tempDir, $"ducking_preview_trim_{Guid.NewGuid():N}.m4a"));
                var seconds = request.PreviewDuration.ToString(global::System.Globalization.CultureInfo.InvariantCulture);
                var trimResult = await processSupervisor.RunAsync(
                    "ffmpeg", $"-y -t {seconds} -i \"{result}\" -c copy \"{trimmed}\"", cancellationToken: ct);
                if (trimResult.ExitCode == 0 && File.Exists(trimmed))
                {
                    result = trimmed;
                }
            }

            return Results.Ok(new { status = "ok", preview_url = result });
        }).Produces<DuckingPreviewResponse>();

        // Пакетная загрузка аудио для нескольких сцен (multipart/form-data).
        endpoints.MapPost("/api/v1/audio/batch-upload-scenes", async (
            HttpRequest request,
            IVoiceModule voice,
            CancellationToken ct) =>
        {
            if (!request.HasFormContentType)
            {
                return Results.BadRequest(new { error = "Ожидался multipart/form-data запрос." });
            }

            var form = await request.ReadFormAsync(ct);
            var projectPath = form["project_path"].ToString();
            var sceneIdsJson = form["scene_ids"].ToString();

            if (string.IsNullOrWhiteSpace(projectPath))
            {
                return Results.BadRequest(new { error = "Поле 'project_path' обязательно." });
            }

            List<string> sceneIds;
            if (!string.IsNullOrWhiteSpace(sceneIdsJson))
            {
                try
                {
                    sceneIds = JsonSerializer.Deserialize<List<string>>(sceneIdsJson) ?? [];
                }
                catch
                {
                    sceneIds = sceneIdsJson
                        .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
                        .ToList();
                }
            }
            else
            {
                sceneIds = [];
            }

            var formFiles = form.Files.GetFiles("files");
            if (formFiles.Count == 0)
            {
                formFiles = form.Files;
            }

            var uploadFiles = new List<UploadedAudioFile>();
            foreach (var file in formFiles)
            {
                uploadFiles.Add(new UploadedAudioFile(file.FileName, file.OpenReadStream()));
            }

            var cmd = new BatchUploadScenesCommand(projectPath, sceneIds, uploadFiles);
            var response = await voice.BatchUploadScenesAsync(cmd, ct);
            return Results.Ok(response);
        }).Produces<BatchUploadScenesResponse>().DisableAntiforgery();

        return endpoints;
    }
}

public sealed record SynthesizeSpeechRequest(
    [property: JsonPropertyName("text")] string Text,
    [property: JsonPropertyName("speaker_id")] string SpeakerId,
    [property: JsonPropertyName("engine")] VoiceEngineType? Engine = null,
    [property: JsonPropertyName("alignment_engine")] AlignmentEngineType? AlignmentEngine = null,
    [property: JsonPropertyName("speed")] double? Speed = null,
    [property: JsonPropertyName("pitch")] double? Pitch = null,
    [property: JsonPropertyName("reference_audio_path")] string? ReferenceAudioPath = null,
    [property: JsonPropertyName("filters")] AudioFilterSpec? Filters = null,
    [property: JsonPropertyName("guidance_scale")] double? GuidanceScale = null,
    [property: JsonPropertyName("guidanceScale")] double? GuidanceScaleCamel = null,
    [property: JsonPropertyName("num_steps")] int? NumSteps = null,
    [property: JsonPropertyName("numSteps")] int? NumStepsCamel = null,
    [property: JsonPropertyName("steps")] int? Steps = null,
    [property: JsonPropertyName("denoise")] bool? Denoise = null,
    [property: JsonPropertyName("duration")] double? Duration = null,
    [property: JsonPropertyName("preprocess_prompt")] bool? PreprocessPrompt = null,
    [property: JsonPropertyName("postprocess_output")] bool? PostprocessOutput = null)
{
    public double EffectiveSpeed => Speed ?? 1.0;
    public double EffectivePitch => Pitch ?? 1.0;
    public double EffectiveGuidanceScale => GuidanceScale ?? GuidanceScaleCamel ?? 3.0;
    public int EffectiveNumSteps => NumSteps ?? NumStepsCamel ?? Steps ?? 32;
    public bool EffectiveDenoise => Denoise ?? true;
    public double EffectiveDuration => Duration ?? 0.0;
    public bool EffectivePreprocess => PreprocessPrompt ?? true;
    public bool EffectivePostprocess => PostprocessOutput ?? true;
}

public sealed record BatchSynthesizeItemRequest(
    [property: JsonPropertyName("text")] string Text,
    [property: JsonPropertyName("speaker_id")] string SpeakerId,
    [property: JsonPropertyName("engine")] VoiceEngineType? Engine = null,
    [property: JsonPropertyName("alignment_engine")] AlignmentEngineType? AlignmentEngine = null,
    [property: JsonPropertyName("speed")] double Speed = 1.0,
    [property: JsonPropertyName("pitch")] double Pitch = 1.0,
    [property: JsonPropertyName("guidance_scale")] double GuidanceScale = 2.0,
    [property: JsonPropertyName("num_steps")] int NumSteps = 24);

public sealed record BatchSynthesizeRequest(
    [property: JsonPropertyName("items")] IReadOnlyList<BatchSynthesizeItemRequest> Items,
    [property: JsonPropertyName("filters")] AudioFilterSpec? Filters);

public sealed record DuckingRequest(
    [property: JsonPropertyName("voice_asset_id")] string VoiceAssetId,
    [property: JsonPropertyName("bgm_asset_id")] string BgmAssetId,
    [property: JsonPropertyName("music_attenuation_db")] double? MusicAttenuationDb,
    [property: JsonPropertyName("attack_ms")] int? AttackMs,
    [property: JsonPropertyName("release_ms")] int? ReleaseMs);

/// <summary>
/// Тест-драйв ducking из UI. Пути — из настроек музыки проекта; eq игнорируется на предпросмотре.
/// </summary>
public sealed record PreviewDuckingRequest(
    [property: JsonPropertyName("voicePath")] string? VoicePath,
    [property: JsonPropertyName("musicPath")] string? MusicPath,
    [property: JsonPropertyName("projectPath")] string? ProjectPath,
    [property: JsonPropertyName("previewDuration")] double PreviewDuration = 10,
    [property: JsonPropertyName("baseVolume")] double BaseVolume = 1.0,
    [property: JsonPropertyName("duckedVolume")] double DuckedVolume = 0.3,
    [property: JsonPropertyName("threshold")] double Threshold = 0.08,
    [property: JsonPropertyName("attackMs")] int AttackMs = 40,
    [property: JsonPropertyName("releaseMs")] int ReleaseMs = 350);

public sealed record AudioConcatResponse(
    [property: JsonPropertyName("status")] string Status,
    [property: JsonPropertyName("output_path")] string OutputPath);

public sealed record VoiceStatusResponse(
    [property: JsonPropertyName("status")] string Status);

public sealed record AudioGenerateResponse(
    [property: JsonPropertyName("status")] string Status,
    [property: JsonPropertyName("audio_url")] string AudioUrl,
    [property: JsonPropertyName("duration")] double Duration);

public sealed record DuckingPreviewResponse(
    [property: JsonPropertyName("status")] string Status,
    [property: JsonPropertyName("preview_url")] string PreviewUrl);
