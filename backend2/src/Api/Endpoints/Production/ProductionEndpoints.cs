using System.IO.Compression;
using System.Text;
using System.Text.Json;
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
        });

        group.MapGet("/projects", async (int page = 1, int pageSize = 20, IProductionModule production = null!, CancellationToken ct = default) =>
        {
            var paged = await production.GetProjectsPagedAsync(page, pageSize, ct);
            return Results.Ok(paged);
        });

        group.MapGet("/projects/{id}", async (string id, IProductionModule production, CancellationToken ct) =>
        {
            var project = await production.GetProjectByIdAsync(id, ct);
            return Results.Ok(project);
        });

        group.MapPost("/projects/{id}/scenario", async (string id, ParseScenarioRequest request, IProductionModule production, CancellationToken ct) =>
        {
            var project = await production.ParseScenarioAsync(id, request, ct);
            return Results.Ok(project);
        });

        group.MapPut("/projects/{id}/scenes/{sceneId}", async (string id, string sceneId, UpdateSceneRequest request, IProductionModule production, CancellationToken ct) =>
        {
            var updated = await production.UpdateSceneAsync(id, sceneId, request, ct);
            return Results.Ok(updated);
        });

        group.MapPost("/projects/{id}/build", async (string id, BuildProjectRequest? request, IProductionModule production, CancellationToken ct) =>
        {
            var status = await production.BuildProjectAsync(id, request, ct);
            return Results.Accepted($"/api/v1/production/projects/{id}/build/status", status);
        });

        group.MapGet("/projects/{id}/build/status", async (string id, IProductionModule production, CancellationToken ct) =>
        {
            var status = await production.GetBuildStatusAsync(id, ct);
            return Results.Ok(status);
        });

        group.MapPost("/projects/{id}/cancel", async (string id, IProductionModule production, CancellationToken ct) =>
        {
            await production.CancelBuildAsync(id, ct);
            return Results.Ok(new { message = "Сборка проекта отменена." });
        });

        group.MapDelete("/projects/{id}", async (string id, IProductionModule production, CancellationToken ct) =>
        {
            await production.DeleteProjectAsync(id, ct);
            return Results.NoContent();
        });

        group.MapGet("/projects/{id}/export/bridge", async (string id, IProductionModule production, CancellationToken ct) =>
        {
            var bridge = await production.ExportProjectBridgeSnapshotAsync(id, ct);
            return Results.Ok(bridge);
        });

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
        });

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
        });

        return endpoints;
    }
}
