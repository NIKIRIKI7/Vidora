using System.Text.Json;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Research.Contracts;
using Research.Domain.Ports;

namespace Api.Endpoints.Research;

public static class ResearchEndpoints
{
    public static IEndpointRouteBuilder MapResearchEndpoints(this IEndpointRouteBuilder endpoints)
    {
        var group = endpoints.MapGroup("/api/v1/research").WithTags("Research (DeepTrend)");

        group.MapPost("/start", async (StartResearchRequest request, IResearchModule research, CancellationToken ct) =>
        {
            var summary = await research.StartSessionAsync(request, ct);
            return Results.Accepted($"/api/v1/research/runs/{summary.Id}", summary);
        });

        group.MapGet("/runs", async (int page = 1, int pageSize = 20, IResearchModule research = null!, CancellationToken ct = default) =>
        {
            var paged = await research.GetSessionsPagedAsync(page, pageSize, ct);
            return Results.Ok(paged);
        });

        group.MapGet("/runs/{id}", async (string id, IResearchModule research, CancellationToken ct) =>
        {
            var details = await research.GetSessionByIdAsync(id, ct);
            return Results.Ok(details);
        });

        group.MapGet("/runs/{id}/opportunities", async (string id, IResearchModule research, CancellationToken ct) =>
        {
            var opportunities = await research.GetOpportunitiesAsync(id, ct);
            return Results.Ok(opportunities);
        });

        group.MapGet("/runs/{id}/export", async (string id, IResearchModule research, CancellationToken ct) =>
        {
            var bytes = await research.ExportExcelReportAsync(id, ct);
            return Results.File(
                fileContents: bytes,
                contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                fileDownloadName: $"deeptrend_research_{id}.xlsx");
        });

        group.MapPost("/export/excel", async (
            AdHocExportData request,
            IResearchReportExporter exporter,
            CancellationToken ct) =>
        {
            var bytes = await exporter.ExportAdHocToExcelAsync(request, ct);
            var cleanQuery = string.IsNullOrWhiteSpace(request.Query) ? "deeptrend" : request.Query.Trim().Replace(' ', '_');
            return Results.File(
                fileContents: bytes,
                contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                fileDownloadName: $"vidora_{cleanQuery}_{DateTime.UtcNow:yyyyMMdd_HHmmss}.xlsx");
        });

        group.MapPost("/runs/{id}/cancel", async (string id, IResearchModule research, CancellationToken ct) =>
        {
            await research.CancelSessionAsync(id, ct);
            return Results.Ok(new { message = "Сессия исследования отменена." });
        });

        group.MapGet("/runs/{id}/stream", async (string id, IResearchModule research, HttpContext context, CancellationToken ct) =>
        {
            context.Response.Headers.Append("Content-Type", "text/event-stream");
            context.Response.Headers.Append("Cache-Control", "no-cache");
            context.Response.Headers.Append("Connection", "keep-alive");

            await foreach (var step in research.ExecuteDagStreamingAsync(id, ct))
            {
                var json = JsonSerializer.Serialize(step);
                await context.Response.WriteAsync($"data: {json}\n\n", ct);
                await context.Response.Body.FlushAsync(ct);
            }
        });

        return endpoints;
    }
}
