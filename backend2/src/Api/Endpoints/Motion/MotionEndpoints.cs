using System.Text.Json;
using Kernel.Ports;
using MotionContext.Application.Services;
using MotionContext.Contracts;
using MotionContext.Domain.Ports;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Routing;

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
        });

        group.MapGet("/scenes/{id}", async (string id, IMotionModule motion, CancellationToken ct) =>
        {
            var result = await motion.GetSceneCodeAsync(id, ct);
            return Results.Ok(result);
        });

        group.MapGet("/projects/{projectId}/scenes/{sceneId}", async (
            string projectId,
            string sceneId,
            IMotionModule motion,
            CancellationToken ct) =>
        {
            var result = await motion.FindSceneCodeBySceneAsync(projectId, sceneId, ct);
            return result != null ? Results.Ok(result) : Results.NotFound();
        });

        group.MapGet("/scenes/{id}/revisions/{revision:int}", async (
            string id,
            int revision,
            IMotionModule motion,
            CancellationToken ct) =>
        {
            var result = await motion.GetRevisionAsync(id, revision, ct);
            return Results.Ok(result);
        });

        group.MapPost("/scenes/generate", async (
            GenerateSceneCodeRequest request,
            IMotionModule motion,
            CancellationToken ct) =>
        {
            var result = await motion.GenerateSceneCodeAsync(request, ct);
            return Results.Created($"/api/v1/motion/scenes/{result.Id}", result);
        });

        group.MapPut("/scenes/{id}", async (
            string id,
            UpdateSceneCodeManualRequest request,
            IMotionModule motion,
            CancellationToken ct) =>
        {
            var result = await motion.UpdateManualCodeAsync(id, request, ct);
            return Results.Ok(result);
        });

        group.MapPost("/scenes/{id}/rollback", async (
            string id,
            RollbackSceneCodeRequest request,
            IMotionModule motion,
            CancellationToken ct) =>
        {
            var result = await motion.RollbackRevisionAsync(id, request, ct);
            return Results.Ok(result);
        });

        group.MapPost("/scenes/{id}/render", async (
            string id,
            StartRenderRequest request,
            IMotionModule motion,
            CancellationToken ct) =>
        {
            var job = await motion.StartRenderAsync(id, request, ct);
            return Results.Accepted($"/api/v1/motion/renders/{job.Id}", job);
        });

        group.MapGet("/renders/{jobId}", async (
            string jobId,
            IMotionModule motion,
            CancellationToken ct) =>
        {
            var status = await motion.GetRenderStatusAsync(jobId, ct);
            return Results.Ok(status);
        });

        group.MapPost("/renders/{jobId}/cancel", async (
            string jobId,
            IMotionModule motion,
            CancellationToken ct) =>
        {
            await motion.CancelRenderAsync(jobId, ct);
            return Results.Ok(new { message = "Задача рендеринга отменена." });
        });

        // --- Compatibility aliases for frontend ---
        endpoints.MapPost("/api/v1/code/generate", async (
            [FromBody] JsonElement payload,
            ILlmClient llm,
            ILlmCodeExtractor extractor,
            CancellationToken ct) =>
        {
            var prompt = payload.GetProperty("prompt").GetString()!;
            var spec = new LlmPromptSpec(
                Messages: [new LlmPromptMessage("user", prompt)],
                Temperature: 0.2f,
                MaxTokens: 4000);

            var rawOutput = await llm.GenerateTextAsync(spec, ct);
            var sanitized = extractor.ExtractAndSanitize(rawOutput);

            return Results.Ok(new
            {
                status = "ok",
                tsx_code = sanitized.SanitizedCode.Value
            });
        });

        endpoints.MapPost("/api/v1/render/start", async (
            [FromBody] JsonElement payload,
            IMotionModule motion,
            CancellationToken ct) =>
        {
            var targetId = payload.GetProperty("target_id").GetString()!;
            var job = await motion.StartRenderAsync(targetId, new StartRenderRequest(null, null), ct);
            return Results.Ok(new { status = "ok", task_id = job.Id });
        });

        endpoints.MapPost("/api/v1/render/cancel/{jobId}", async (string jobId, IMotionModule motion, CancellationToken ct) =>
        {
            await motion.CancelRenderAsync(jobId, ct);
            return Results.Ok(new { status = "ok" });
        });

        return endpoints;
    }
}
