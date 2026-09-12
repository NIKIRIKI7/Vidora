using System.Text.Json;
using System.Text.Json.Serialization;
using System.Text.RegularExpressions;
using Kernel.Contracts;
using Kernel.Exceptions;
using Kernel.Ports;
using MotionContext.Application.Services;
using MotionContext.Contracts;
using MotionContext.Domain.Ports;
using MotionContext.Domain.ValueObjects;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Routing;
using Skills.Contracts;
using Skills.Domain;

namespace Api.Endpoints.Motion;

public static class MotionEndpoints
{
    public static IEndpointRouteBuilder MapMotionEndpoints(this IEndpointRouteBuilder endpoints)
    {
        var group = endpoints.MapGroup("/api/v1/motion").WithTags("Motion");

        group.MapGet("/capabilities", async (IMotionModule motion, CancellationToken ct) =>
        {
            var capabilities = await motion.GetAvailableCapabilitiesAsync(ct);
            return Results.Ok(capabilities);
        }).Produces<IReadOnlyList<string>>();

        group.MapGet("/scenes/{id}", async (string id, IMotionModule motion, CancellationToken ct) =>
        {
            var result = await motion.GetSceneCodeAsync(id, ct);
            return Results.Ok(result);
        }).Produces<SceneCodeDto>();

        group.MapGet("/projects/{projectId}/scenes/{sceneId}", async (
            string projectId,
            string sceneId,
            IMotionModule motion,
            CancellationToken ct) =>
        {
            var result = await motion.FindSceneCodeBySceneAsync(projectId, sceneId, ct);
            return result != null ? Results.Ok(result) : Results.NotFound();
        }).Produces<SceneCodeDto>();

        group.MapGet("/scenes/{id}/revisions/{revision:int}", async (
            string id,
            int revision,
            IMotionModule motion,
            CancellationToken ct) =>
        {
            var result = await motion.GetRevisionAsync(id, revision, ct);
            return Results.Ok(result);
        }).Produces<SceneRevisionDto>();

        group.MapPost("/scenes/generate", async (
            GenerateSceneCodeRequest request,
            IMotionModule motion,
            CancellationToken ct) =>
        {
            var result = await motion.GenerateSceneCodeAsync(request, ct);
            return Results.Created($"/api/v1/motion/scenes/{result.Id}", result);
        }).Produces<SceneCodeDto>(StatusCodes.Status201Created);

        group.MapPut("/scenes/{id}", async (
            string id,
            UpdateSceneCodeManualRequest request,
            IMotionModule motion,
            CancellationToken ct) =>
        {
            var result = await motion.UpdateManualCodeAsync(id, request, ct);
            return Results.Ok(result);
        }).Produces<SceneCodeDto>();

        group.MapPost("/scenes/{id}/rollback", async (
            string id,
            RollbackSceneCodeRequest request,
            IMotionModule motion,
            CancellationToken ct) =>
        {
            var result = await motion.RollbackRevisionAsync(id, request, ct);
            return Results.Ok(result);
        }).Produces<SceneCodeDto>();

        group.MapPost("/scenes/{id}/render", async (
            string id,
            StartRenderRequest request,
            IMotionModule motion,
            CancellationToken ct) =>
        {
            var job = await motion.StartRenderAsync(id, request, ct);
            return Results.Accepted($"/api/v1/motion/renders/{job.Id}", job);
        }).Produces<RenderJobDto>(StatusCodes.Status202Accepted);

        group.MapGet("/renders/{jobId}", async (
            string jobId,
            IMotionModule motion,
            CancellationToken ct) =>
        {
            var status = await motion.GetRenderStatusAsync(jobId, ct);
            return Results.Ok(status);
        }).Produces<RenderJobDto>();

        group.MapPost("/renders/{jobId}/cancel", async (
            string jobId,
            IMotionModule motion,
            CancellationToken ct) =>
        {
            await motion.CancelRenderAsync(jobId, ct);
            return Results.Ok(new { message = "Задача рендеринга отменена." });
        }).Produces<MotionMessageResponse>();

        // --- Compatibility aliases for frontend ---
        endpoints.MapPost("/api/v1/code/generate", async (
            CodeGenerateCompatRequest request,
            ILlmClient llm,
            ILlmCodeExtractor extractor,
            ISkillsCatalog skillsCatalog,
            IPackageCapabilityRegistry capabilityRegistry,
            CancellationToken ct) =>
        {
            var prompt = request.Prompt;

            var bundle = await skillsCatalog.GetSkillBundleForStageAsync(
                SkillStage.SceneGeneration,
                maxTokenLimit: 4000,
                customHeaderInstructions: null,
                cancellationToken: ct);

            var capabilityGuidelines = capabilityRegistry.GetCombinedPromptGuidelines();

            var systemPrompt = string.Join(
                "\n\n",
                new[]
                {
                    bundle.SystemPrompt,
                    capabilityGuidelines
                }.Where(p => !string.IsNullOrWhiteSpace(p)));

            var spec = new LlmPromptSpec(
                Messages:
                [
                    new LlmPromptMessage("system", systemPrompt),
                    new LlmPromptMessage("user", prompt)
                ],
                Temperature: 0.2f,
                MaxTokens: 4000);

            var rawOutput = await llm.GenerateTextAsync(spec, ct);
            var sanitized = extractor.ExtractAndSanitize(rawOutput);

            return Results.Ok(new
            {
                status = "ok",
                tsx_code = sanitized.SanitizedCode.Value,
                applied_stage = SkillStage.SceneGeneration.ToSnakeCase(),
                included_skills = bundle.IncludedSkills.Select(s => s.Id).ToArray()
            });
        }).Produces<CodeGenerateResponse>();

        endpoints.MapPost("/api/v1/render/start", async (
            RenderStartCompatRequest request,
            IMotionModule motion,
            CancellationToken ct) =>
        {
            if (string.IsNullOrWhiteSpace(request.TargetId))
            {
                throw new ValidationException("target_id", "Идентификатор цели рендера обязателен.");
            }

            var targetId = request.TargetId;
            var projectId = request.ProjectId;
            var tsxCode = request.TsxCode;

            SceneCodeDto? sceneCode = null;

            // 1. Редактор прислал актуальный TSX — идемпотентно сохраняем/обновляем ревизию сцены.
            if (!string.IsNullOrWhiteSpace(tsxCode) && !string.IsNullOrWhiteSpace(projectId))
            {
                var composition = ExtractComposition(tsxCode!);
                sceneCode = await motion.SaveSceneCodeAsync(
                    new SaveSceneCodeRequest(
                        projectId!,
                        targetId!,
                        tsxCode!,
                        composition.Width,
                        composition.Height,
                        composition.Fps,
                        composition.DurationInFrames),
                    ct);
            }
            else
            {
                // 2. Кода нет — ищем сцену по (project_id, scene_id), затем по SceneCodeId.
                if (!string.IsNullOrWhiteSpace(projectId))
                {
                    sceneCode = await motion.FindSceneCodeBySceneAsync(projectId!, targetId!, ct);
                }

                sceneCode ??= await motion.GetSceneCodeAsync(targetId!, ct);
            }

            var job = await motion.StartRenderAsync(sceneCode.Id, new StartRenderRequest(null, null), ct);
            return Results.Ok(new { status = "ok", task_id = job.Id });
        }).Produces<RenderStartResponse>();

        endpoints.MapPost("/api/v1/render/cancel/{jobId}", async (string jobId, IMotionModule motion, CancellationToken ct) =>
        {
            await motion.CancelRenderAsync(jobId, ct);
            return Results.Ok(new { status = "ok" });
        }).Produces<MotionStatusResponse>();

        return endpoints;
    }

    /// <summary>
    /// Извлекает параметры композиции (width/height/fps/durationInFrames) из TSX-кода редактора.
    /// Если значение отсутствует — берётся безопасный дефолт (Full HD, 30 FPS).
    /// </summary>
    private static CompositionConfig ExtractComposition(string tsxCode)
    {
        int fps = MatchInt(tsxCode, @"fps\s*:\s*(\d+)", 30);
        int width = MatchInt(tsxCode, @"width\s*:\s*(\d+)", 1920);
        int height = MatchInt(tsxCode, @"height\s*:\s*(\d+)", 1080);
        int frames = MatchInt(tsxCode, @"durationInFrames\s*:\s*(\d+)", Math.Max(1, fps * 5));
        return new CompositionConfig(width, height, fps, Math.Max(1, frames));
    }

    private static int MatchInt(string text, string pattern, int fallback)
    {
        var match = Regex.Match(text, pattern);
        return match.Success && int.TryParse(match.Groups[1].Value, out var value) && value > 0 ? value : fallback;
    }
}

public sealed record MotionMessageResponse(
    [property: JsonPropertyName("message")] string Message);

public sealed record CodeGenerateResponse(
    [property: JsonPropertyName("status")] string Status,
    [property: JsonPropertyName("tsx_code")] string TsxCode,
    [property: JsonPropertyName("applied_stage")] string AppliedStage,
    [property: JsonPropertyName("included_skills")] IReadOnlyList<string> IncludedSkills);

public sealed record RenderStartResponse(
    [property: JsonPropertyName("status")] string Status,
    [property: JsonPropertyName("task_id")] string TaskId);

public sealed record MotionStatusResponse(
    [property: JsonPropertyName("status")] string Status);

/// <summary>
/// Тело запроса совместимости для /api/v1/code/generate.
/// Типизировано, чтобы Swagger и openapi-typescript генерировали схему запроса.
/// </summary>
public sealed record CodeGenerateCompatRequest(
    [property: JsonPropertyName("prompt")] string Prompt,
    [property: JsonPropertyName("target_id")] string? TargetId = null,
    [property: JsonPropertyName("project_path")] string? ProjectPath = null,
    [property: JsonPropertyName("engine")] string? Engine = null,
    [property: JsonPropertyName("project_data")] ProjectDataPayloadDto? ProjectData = null,
    [property: JsonPropertyName("api_keys")] ApiKeysDto? ApiKeys = null);

/// <summary>
/// Тело запроса совместимости для /api/v1/render/start.
/// Типизировано, чтобы Swagger и openapi-typescript генерировали схему запроса.
/// </summary>
public sealed record RenderStartCompatRequest(
    [property: JsonPropertyName("target_id")] string TargetId,
    [property: JsonPropertyName("project_id")] string? ProjectId = null,
    [property: JsonPropertyName("target")] string? Target = null,
    [property: JsonPropertyName("project_path")] string? ProjectPath = null,
    [property: JsonPropertyName("tsx_code")] string? TsxCode = null,
    [property: JsonPropertyName("audio_path")] string? AudioPath = null,
    [property: JsonPropertyName("broll_sources")] IReadOnlyList<string>? BrollSources = null,
    [property: JsonPropertyName("background_music")] BackgroundMusicSettingsDto? BackgroundMusic = null,
    [property: JsonPropertyName("render_quality")] string? RenderQuality = null);
