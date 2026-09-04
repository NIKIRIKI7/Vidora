using System.Text.Json.Serialization;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Voice.Application.Commands;
using Voice.Application.Services;
using Voice.Domain;
using Voice.Domain.ValueObjects;

namespace Api.Endpoints.Voice;

public static class VoiceEndpoints
{
    public static IEndpointRouteBuilder MapVoiceEndpoints(this IEndpointRouteBuilder endpoints)
    {
        var group = endpoints.MapGroup("/api/v1/voice").WithTags("Voice");

        group.MapPost("/synthesize", async (SynthesizeSpeechRequest request, IVoiceModule voice, CancellationToken ct) =>
        {
            var command = new SynthesizeSpeechCommand(
                Text: request.Text,
                Engine: request.Engine,
                SpeakerId: request.SpeakerId,
                AlignmentEngine: request.AlignmentEngine ?? AlignmentEngineType.Whisper,
                Speed: request.Speed ?? 1.0,
                Pitch: request.Pitch ?? 1.0,
                ReferenceAudioPath: request.ReferenceAudioPath,
                Filters: request.Filters);

            var result = await voice.SynthesizeSpeechAsync(command, ct);
            return Results.Ok(result);
        });

        group.MapPost("/batch", async (BatchSynthesizeRequest request, IVoiceModule voice, CancellationToken ct) =>
        {
            var items = request.Items.Select(i => new BatchItemSpec(
                i.Text,
                i.Engine,
                i.SpeakerId,
                i.AlignmentEngine ?? AlignmentEngineType.Whisper,
                i.Speed)).ToList();

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

        return endpoints;
    }
}

public sealed record SynthesizeSpeechRequest(
    [property: JsonPropertyName("text")] string Text,
    [property: JsonPropertyName("engine")] VoiceEngineType Engine,
    [property: JsonPropertyName("speaker_id")] string SpeakerId,
    [property: JsonPropertyName("alignment_engine")] AlignmentEngineType? AlignmentEngine,
    [property: JsonPropertyName("speed")] double? Speed,
    [property: JsonPropertyName("pitch")] double? Pitch,
    [property: JsonPropertyName("reference_audio_path")] string? ReferenceAudioPath,
    [property: JsonPropertyName("filters")] AudioFilterSpec? Filters);

public sealed record BatchSynthesizeItemRequest(
    [property: JsonPropertyName("text")] string Text,
    [property: JsonPropertyName("engine")] VoiceEngineType Engine,
    [property: JsonPropertyName("speaker_id")] string SpeakerId,
    [property: JsonPropertyName("alignment_engine")] AlignmentEngineType? AlignmentEngine,
    [property: JsonPropertyName("speed")] double Speed = 1.0);

public sealed record BatchSynthesizeRequest(
    [property: JsonPropertyName("items")] IReadOnlyList<BatchSynthesizeItemRequest> Items,
    [property: JsonPropertyName("filters")] AudioFilterSpec? Filters);

public sealed record DuckingRequest(
    [property: JsonPropertyName("voice_asset_id")] string VoiceAssetId,
    [property: JsonPropertyName("bgm_asset_id")] string BgmAssetId,
    [property: JsonPropertyName("music_attenuation_db")] double? MusicAttenuationDb,
    [property: JsonPropertyName("attack_ms")] int? AttackMs,
    [property: JsonPropertyName("release_ms")] int? ReleaseMs);
