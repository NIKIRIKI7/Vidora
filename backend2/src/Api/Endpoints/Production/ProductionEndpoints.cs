using System.IO.Compression;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using Kernel.Contracts;
using Kernel.Platform.FileSystem;
using ProductionContext.Contracts;
using ProductionContext.Domain.Ports;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Routing;

namespace Api.Endpoints.Production;

public static class ProductionEndpoints
{
    public static IEndpointRouteBuilder MapProductionEndpoints(this IEndpointRouteBuilder endpoints)
    {
        var group = endpoints.MapGroup("/api/v1/production").WithTags("Production");

        group.MapPost("/projects", async (CreateProjectRequest request, IProductionModule production, CancellationToken ct) =>
        {
            var project = await production.CreateProjectAsync(request, ct);
            return Results.Created($"/api/v1/production/projects/{project.Id}", project);
        }).Produces<ProjectDetailsDto>(StatusCodes.Status201Created);

        group.MapGet("/projects", async (int page = 1, int pageSize = 20, IProductionModule production = null!, CancellationToken ct = default) =>
        {
            var paged = await production.GetProjectsPagedAsync(page, pageSize, ct);
            return Results.Ok(paged);
        }).Produces<PagedResult<ProjectSummaryDto>>();

        group.MapGet("/projects/{id}", async (string id, IProductionModule production, CancellationToken ct) =>
        {
            var project = await production.GetProjectByIdAsync(id, ct);
            return Results.Ok(project);
        }).Produces<ProjectDetailsDto>();

        group.MapPost("/projects/{id}/scenario", async (string id, ParseScenarioRequest request, IProductionModule production, CancellationToken ct) =>
        {
            var project = await production.ParseScenarioAsync(id, request, ct);
            return Results.Ok(project);
        }).Produces<ProjectDetailsDto>();

        group.MapPut("/projects/{id}/scenes/{sceneId}", async (string id, string sceneId, UpdateSceneRequest request, IProductionModule production, CancellationToken ct) =>
        {
            var updated = await production.UpdateSceneAsync(id, sceneId, request, ct);
            return Results.Ok(updated);
        }).Produces<ProjectDetailsDto>();

        group.MapPost("/projects/{id}/build", async (string id, BuildProjectRequest? request, IProductionModule production, CancellationToken ct) =>
        {
            var status = await production.BuildProjectAsync(id, request, ct);
            return Results.Accepted($"/api/v1/production/projects/{id}/build/status", status);
        }).Produces<BuildStatusDto>(StatusCodes.Status202Accepted);

        group.MapGet("/projects/{id}/build/status", async (string id, IProductionModule production, CancellationToken ct) =>
        {
            var status = await production.GetBuildStatusAsync(id, ct);
            return Results.Ok(status);
        }).Produces<BuildStatusDto>();

        group.MapPost("/projects/{id}/cancel", async (string id, IProductionModule production, CancellationToken ct) =>
        {
            await production.CancelBuildAsync(id, ct);
            return Results.Ok(new { message = "Сборка проекта отменена." });
        }).Produces<ProductionMessageResponse>();

        group.MapDelete("/projects/{id}", async (string id, IProductionModule production, CancellationToken ct) =>
        {
            await production.DeleteProjectAsync(id, ct);
            return Results.NoContent();
        }).Produces(StatusCodes.Status204NoContent);

        group.MapGet("/projects/{id}/export/bridge", async (string id, IProductionModule production, CancellationToken ct) =>
        {
            var bridge = await production.ExportProjectBridgeSnapshotAsync(id, ct);
            return Results.Ok(bridge);
        }).Produces<ProjectDataDto>();

        // --- Compatibility aliases for frontend ---
        endpoints.MapPost("/api/v1/render/concat-video", async (
            [FromBody] JsonElement payload,
            IVideoStitcher stitcher,
            IPathResolver pathResolver,
            CancellationToken ct) =>
        {
            var videoPaths = payload.GetProperty("video_paths").EnumerateArray().Select(x => x.GetString()!).ToList();
            var outPath = payload.GetProperty("output_path").GetString()!;
            var items = videoPaths.Select(v => new StitchVideoItem(pathResolver.ResolveSafePath(v), 5.0)).ToList();

            await stitcher.ConcatenateScenesAsync(items, outPath, ct);
            return Results.Ok(new { status = "ok" });
        }).Produces<ProductionStatusResponse>();

        endpoints.MapPost("/api/v1/render/export", async (
            [FromBody] JsonElement payload,
            CancellationToken ct) =>
        {
            var projectName = payload.GetProperty("project_name").GetString()!;
            var markdown = payload.GetProperty("markdown").GetString()!;

            using var memoryStream = new MemoryStream();
            using (var archive = new ZipArchive(memoryStream, ZipArchiveMode.Create, true))
            {
                var entry = archive.CreateEntry("SCENARIO.md");
                await using var entryStream = entry.Open();
                await using var writer = new StreamWriter(entryStream, Encoding.UTF8);
                await writer.WriteAsync(markdown);
            }

            return Results.File(memoryStream.ToArray(), "application/zip", $"{projectName}.zip");
        }).Produces<byte[]>(StatusCodes.Status200OK, "application/zip");

        return endpoints;
    }
}

public sealed record ProductionMessageResponse(
    [property: JsonPropertyName("message")] string Message);

public sealed record ProductionStatusResponse(
    [property: JsonPropertyName("status")] string Status);
