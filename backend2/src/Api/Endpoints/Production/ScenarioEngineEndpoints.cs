using System.Text.Json.Serialization;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Routing;
using ProductionContext.Application.Services;
using ProductionContext.Domain.Ports;
using ProductionContext.Domain.Services;
using ProductionContext.Domain.ValueObjects;

namespace Api.Endpoints.Production;

public static class ScenarioEngineEndpoints
{
    public static IEndpointRouteBuilder MapScenarioEngineEndpoints(this IEndpointRouteBuilder endpoints)
    {
        var group = endpoints.MapGroup("/api/v1/production/engine").WithTags("Scenario Engine");

        // Единая точка синхронизации IDE (Two-Way Data Binding: Markdown <-> AST <-> Blocks)
        group.MapPost("/{projectId}/sync", async (
            string projectId,
            [FromBody] EngineSyncRequest request,
            ScenarioEngineGateway gateway,
            CancellationToken ct) =>
        {
            var response = await gateway.SyncMarkdownAsync(projectId, request.Markdown, ct);
            return Results.Ok(new { status = "ok", data = response });
        }).Produces<EngineSyncEnvelopeResponse>();

        // Stateless-проверка черновика (ScenarioBuilder): парсер -> линтер, без сохранения в БД
        group.MapPost("/lint-draft", (
            [FromBody] EngineSyncRequest request,
            ScenarioEngineGateway gateway) =>
        {
            var response = gateway.LintDraftMarkdown(request.Markdown);
            return Results.Ok(new { status = "ok", data = response });
        }).Produces<DraftLintEnvelopeResponse>();

        // Правый блок: режиссёрский линтер (эвристики, без LLM). Фронт дергает с debounce.
        group.MapPost("/{projectId}/lint", async (
            string projectId,
            IProjectRepository projectRepo,
            ScenarioLinter linter,
            CancellationToken ct) =>
        {
            if (!ProjectId.TryParse(projectId, out var id))
            {
                return Results.NotFound(new { message = $"Проект '{projectId}' не найден." });
            }

            var project = await projectRepo.GetByIdAsync(id, ct);
            if (project == null)
            {
                return Results.NotFound(new { message = $"Проект '{projectId}' не найден." });
            }

            var issues = linter.LintProject(project);
            return Results.Ok(new
            {
                status = "ok",
                issues,
                summary = new
                {
                    scenes = project.Scenes.Count,
                    fragments = project.Scenes.Sum(s => s.Fragments.Count),
                    estimated_duration_seconds = Math.Round(project.Scenes.Sum(s => s.Fragments.Sum(f => f.EstimateDuration())), 2)
                }
            });
        }).Produces<ScenarioLintResponse>();

        // Центральный блок: ИИ-рерайтинг фрагмента (LLM Copilot, Structured Outputs)
        group.MapPost("/{projectId}/copilot/rewrite", async (
            string projectId,
            [FromBody] CopilotRewriteRequest request,
            IProjectRepository projectRepo,
            ScenarioCopilotService copilot,
            CancellationToken ct) =>
        {
            if (!ProjectId.TryParse(projectId, out var id))
            {
                return Results.NotFound(new { message = $"Проект '{projectId}' не найден." });
            }

            var project = await projectRepo.GetByIdAsync(id, ct);
            if (project == null)
            {
                return Results.NotFound(new { message = $"Проект '{projectId}' не найден." });
            }

            var fragment = project.Scenes
                .SelectMany(s => s.Fragments)
                .FirstOrDefault(f => f.FragmentId.Value == request.FragmentId?.Trim().ToLowerInvariant());

            if (fragment == null)
            {
                return Results.NotFound(new { message = $"Фрагмент '{request.FragmentId}' не найден в проекте." });
            }

            if (string.IsNullOrWhiteSpace(request.Command))
            {
                return Results.BadRequest(new { message = "Команда (command) обязательна: например, «короче», «кликбейтнее», «разбей на 3 фрагмента»." });
            }

            var suggestions = await copilot.RewriteFragmentAsync(
                project.Title,
                fragment.VisualNote,
                fragment.Text,
                request.Command,
                includeTrendContext: request.IncludeTrendContext ?? true,
                ct: ct);

            return Results.Ok(new { status = "ok", suggestions });
        }).Produces<CopilotRewriteResponse>();

        return endpoints;
    }
}

public sealed record CopilotRewriteRequest(
    [property: JsonPropertyName("fragment_id")] string FragmentId,
    [property: JsonPropertyName("command")] string Command,
    [property: JsonPropertyName("include_trend_context")] bool? IncludeTrendContext = null);

public sealed record EngineSyncRequest(
    [property: JsonPropertyName("markdown")] string Markdown);

public sealed record EngineSyncEnvelopeResponse(
    [property: JsonPropertyName("status")] string Status,
    [property: JsonPropertyName("data")] EngineSyncResponse Data);

public sealed record DraftLintEnvelopeResponse(
    [property: JsonPropertyName("status")] string Status,
    [property: JsonPropertyName("data")] DraftLintResponse Data);

public sealed record ScenarioLintSummaryResponse(
    [property: JsonPropertyName("scenes")] int Scenes,
    [property: JsonPropertyName("fragments")] int Fragments,
    [property: JsonPropertyName("estimated_duration_seconds")] double EstimatedDurationSeconds);

public sealed record ScenarioLintResponse(
    [property: JsonPropertyName("status")] string Status,
    [property: JsonPropertyName("issues")] IReadOnlyList<ScenarioIssue> Issues,
    [property: JsonPropertyName("summary")] ScenarioLintSummaryResponse Summary);

public sealed record CopilotRewriteResponse(
    [property: JsonPropertyName("status")] string Status,
    [property: JsonPropertyName("suggestions")] IReadOnlyList<ScenarioRewriteSuggestion> Suggestions);
