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

        return endpoints;
    }
}

public sealed record MotionMessageResponse(
    [property: JsonPropertyName("message")] string Message);

public sealed record CodeGenerateResponse(
    [property: JsonPropertyName("status")] string Status,
    [property: JsonPropertyName("tsx_code")] string TsxCode,
    [property: JsonPropertyName("applied_stage")] string AppliedStage,
    [property: JsonPropertyName("included_skills")] IReadOnlyList<string> IncludedSkills);
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
