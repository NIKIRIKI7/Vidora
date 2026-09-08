using System.Text.Json;
using System.Text.Json.Serialization;
using Kernel.Exceptions;
using Kernel.Platform.Gpu;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Routing;
using Voice.Application.Commands;
using Voice.Application.Contracts;
using Voice.Application.Services;
using Voice.Domain;
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
        });

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
                NumSteps: request.EffectiveNumSteps);

            var result = await voice.SynthesizeSpeechAsync(command, ct);
            return Results.Ok(result);
        });

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
        });

        group.MapGet("/jobs/{id}", async (string id, IVoiceModule voice, CancellationToken ct) =>
        {
            var job = await voice.GetJobByIdAsync(id, ct);
            return Results.Ok(job);
        });

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
        });

        group.MapGet("/speakers", async (IVoiceModule voice, CancellationToken ct) =>
        {
            var speakers = await voice.GetAvailableSpeakersAsync(ct);
            return Results.Ok(speakers);
        });

        var speakerGroup = group.MapGroup("/speakers/profiles").WithTags("Speaker Profiles");

        speakerGroup.MapGet("/", async (IVoiceModule voice, CancellationToken ct) =>
        {
            var profiles = await voice.GetAllSpeakersAsync(ct);
            return Results.Ok(profiles);
        });

        speakerGroup.MapGet("/{id}", async (string id, IVoiceModule voice, CancellationToken ct) =>
        {
            var profile = await voice.GetSpeakerByIdAsync(id, ct);
            return profile is null ? Results.NotFound() : Results.Ok(profile);
        });

        speakerGroup.MapPost("/design", async (DesignSpeakerRequest request, IVoiceModule voice, CancellationToken ct) =>
        {
            var profile = await voice.CreateDesignedSpeakerAsync(request, ct);
            return Results.Created($"/api/v1/voice/speakers/profiles/{profile.Id}", profile);
        });

        speakerGroup.MapPost("/clone", async (
            [FromForm] string name,
            [FromForm] VoiceEngineType engine,
            [FromForm] string? referenceText,
            [FromForm] string? language,
            IFormFile referenceAudio,
            IVoiceModule voice,
            CancellationToken ct) =>
        {
            if (referenceAudio is null || referenceAudio.Length == 0)
            {
                throw new ValidationException("referenceAudio", "Аудиофайл референса обязателен.");
            }

            var tempPath = Path.Combine(Path.GetTempPath(), $"clone_ref_{Guid.NewGuid():N}{Path.GetExtension(referenceAudio.FileName)}");
            await using (var fs = File.Create(tempPath))
            {
                await referenceAudio.CopyToAsync(fs, ct);
            }

            var request = new CloneSpeakerRequest(name, engine, referenceText, language);
            var profile = await voice.CreateClonedSpeakerAsync(request, tempPath, ct);
            return Results.Created($"/api/v1/voice/speakers/profiles/{profile.Id}", profile);
        }).DisableAntiforgery();

        speakerGroup.MapPut("/{id}", async (string id, UpdateSpeakerRequest request, IVoiceModule voice, CancellationToken ct) =>
        {
            var profile = await voice.UpdateSpeakerAsync(id, request, ct);
            return Results.Ok(profile);
        });

        speakerGroup.MapDelete("/{id}", async (string id, IVoiceModule voice, CancellationToken ct) =>
        {
            await voice.DeleteSpeakerAsync(id, ct);
            return Results.NoContent();
        });

        speakerGroup.MapPost("/{id}/preview", async (string id, GeneratePreviewRequest request, IVoiceModule voice, CancellationToken ct) =>
        {
            var job = await voice.GenerateSpeakerPreviewAsync(id, request, ct);
            return Results.Ok(job);
        });

        group.MapPost("/align", async (AlignSpeechRequest request, IVoiceModule voice, CancellationToken ct) =>
        {
            var result = await voice.AlignSpeechAsync(request, ct);
            return Results.Ok(result);
        });

        group.MapPost("/transcribe", async (TranscribeAudioRequest request, IVoiceModule voice, CancellationToken ct) =>
        {
            var text = await voice.TranscribeAudioAsync(request.AudioPath, ct);
            return Results.Ok(new TranscribeAudioResponse("ok", text));
        });

        group.MapPost("/process-dsp", async (ProcessAudioDspRequest request, IVoiceModule voice, CancellationToken ct) =>
        {
            var res = await voice.ProcessAudioDspAsync(request, ct);
            return Results.Ok(res);
        });

        group.MapPost("/concat", async (ConcatAudioRequest request, IVoiceModule voice, CancellationToken ct) =>
        {
            var outPath = await voice.ConcatenateAudioAsync(request.AudioPaths, request.OutputPath, ct);
            return Results.Ok(new { status = "ok", output_path = outPath });
        });

        group.MapPost("/vram/unload", async (IGpuManager gpu, CancellationToken ct) =>
        {
            await gpu.CleanMemoryAsync(ct);
            return Results.Ok(new { status = "ok" });
        });

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
                NumSteps: request.EffectiveNumSteps);

            var res = await voice.SynthesizeSpeechAsync(cmd, ct);
            return Results.Ok(new
            {
                status = "ok",
                audio_url = Path.GetFileName(res.AudioPath ?? "output.wav"),
                duration = res.DurationSeconds ?? 2.0
            });
        });

        endpoints.MapPost("/api/v1/audio/sync", async (AlignSpeechRequest request, IVoiceModule voice, CancellationToken ct) =>
            Results.Ok(await voice.AlignSpeechAsync(request, ct)));

        endpoints.MapPost("/api/v1/audio/process", async (ProcessAudioDspRequest request, IVoiceModule voice, CancellationToken ct) =>
            Results.Ok(await voice.ProcessAudioDspAsync(request, ct)));

        endpoints.MapPost("/api/v1/audio/process/advanced-silence", async (ProcessAudioDspRequest request, IVoiceModule voice, CancellationToken ct) =>
            Results.Ok(await voice.ProcessAudioDspAsync(request with { Action = "silence" }, ct)));

        endpoints.MapPost("/api/v1/audio/transcribe", async (TranscribeAudioRequest request, IVoiceModule voice, CancellationToken ct) =>
            Results.Ok(new TranscribeAudioResponse("ok", await voice.TranscribeAudioAsync(request.AudioPath, ct))));

        endpoints.MapPost("/api/v1/audio/concat", async (ConcatAudioRequest request, IVoiceModule voice, CancellationToken ct) =>
            Results.Ok(new { status = "ok", output_path = await voice.ConcatenateAudioAsync(request.AudioPaths, request.OutputPath, ct) }));

        endpoints.MapPost("/api/v1/audio/vram/unload", async (IGpuManager gpu, CancellationToken ct) =>
        {
            await gpu.CleanMemoryAsync(ct);
            return Results.Ok(new { status = "ok" });
        });

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
    [property: JsonPropertyName("steps")] int? Steps = null)
{
    public double EffectiveSpeed => Speed ?? 1.0;
    public double EffectivePitch => Pitch ?? 1.0;
    public double EffectiveGuidanceScale => GuidanceScale ?? GuidanceScaleCamel ?? 2.0;
    public int EffectiveNumSteps => NumSteps ?? NumStepsCamel ?? Steps ?? 24;
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
