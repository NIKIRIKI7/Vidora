using System.Text.Json.Serialization;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Skills.Application.Commands;
using Skills.Application.Services;
using Skills.Contracts;
using Skills.Domain;

namespace Api.Endpoints.Skills;

public static class SkillsEndpoints
{
    public static IEndpointRouteBuilder MapSkillsEndpoints(this IEndpointRouteBuilder endpoints)
    {
        var group = endpoints.MapGroup("/api/v1/skills").WithTags("Skills");

        // Список скилов (с фильтрацией по stage, поддержка query: ?only_enabled=true или ?onlyEnabled=true)
        group.MapGet("/", async (
            string stage = "",
            bool? only_enabled = null,
            bool? onlyEnabled = null,
            ISkillManagementService service = null!,
            CancellationToken ct = default) =>
        {
            bool filterOnlyEnabled = only_enabled ?? onlyEnabled ?? false;

            if (!string.IsNullOrWhiteSpace(stage) && SkillStageExtensions.TryParseStage(stage, out var parsedStage))
            {
                var stageSkills = await service.GetSkillsByStageAsync(parsedStage, filterOnlyEnabled, ct);
                return Results.Ok(stageSkills);
            }

            var allSkills = await service.GetAllSkillsAsync(ct);
            return Results.Ok(allSkills);
        });

        // Получение скомпонованного бандла промптов (query: max_tokens / maxTokens, custom_header / customHeader)
        group.MapGet("/bundle/{stage}", async (
            string stage,
            int? max_tokens = null,
            int? maxTokens = null,
            string custom_header = "",
            string customHeader = "",
            ISkillsCatalog catalog = null!,
            CancellationToken ct = default) =>
        {
            if (!SkillStageExtensions.TryParseStage(stage, out var parsedStage))
            {
                return Results.BadRequest(new { error = $"Недопустимая стадия: '{stage}'" });
            }

            int? tokensLimit = max_tokens ?? maxTokens;
            string headerInstructions = custom_header.Length > 0 ? custom_header : customHeader;

            var bundle = await catalog.GetSkillBundleForStageAsync(parsedStage, tokensLimit, headerInstructions, ct);
            return Results.Ok(bundle);
        });

        // Получение скила по ID
        group.MapGet("/{id}", async (string id, ISkillManagementService service, CancellationToken ct) =>
        {
            var skill = await service.GetSkillByIdAsync(id, ct);
            return Results.Ok(skill);
        });

        // Создание нового пользовательского скила (поддержка snake_case и camelCase в теле)
        group.MapPost("/", async (CreateSkillRequest request, ISkillManagementService service, CancellationToken ct) =>
        {
            if (!SkillStageExtensions.TryParseStage(request.Stage, out var stage))
            {
                return Results.BadRequest(new { error = $"Недопустимая стадия: '{request.Stage}'" });
            }

            var command = new CreateCustomSkillCommand(
                Id: request.Id,
                Name: request.Name,
                Description: request.Description,
                Stage: stage,
                Content: request.Content,
                Priority: request.Priority ?? 100,
                Tags: request.Tags);

            var created = await service.CreateCustomSkillAsync(command, ct);
            return Results.Created($"/api/v1/skills/{created.Id}", created);
        });

        // Обновление скила (поддержка is_enabled и isEnabled)
        async Task<IResult> UpdateSkillHandler(string id, UpdateSkillRequest request, ISkillManagementService service, CancellationToken ct)
        {
            var command = new UpdateSkillCommand(
                Id: id,
                Name: request.Name,
                Description: request.Description,
                Content: request.Content,
                Priority: request.Priority,
                IsEnabled: request.IsEnabled,
                Tags: request.Tags);

            var updated = await service.UpdateSkillAsync(command, ct);
            return Results.Ok(updated);
        }

        group.MapPut("/{id}", UpdateSkillHandler);
        group.MapPatch("/{id}", UpdateSkillHandler);

        // Сброс базового скила до системного шаблона
        group.MapPost("/{id}/reset", async (string id, ISkillManagementService service, CancellationToken ct) =>
        {
            var updated = await service.ResetSkillToDefaultAsync(new ResetSkillToDefaultCommand(id), ct);
            return Results.Ok(updated);
        });

        // Удаление пользовательского скила
        group.MapDelete("/{id}", async (string id, ISkillManagementService service, CancellationToken ct) =>
        {
            await service.DeleteSkillAsync(new DeleteSkillCommand(id), ct);
            return Results.NoContent();
        });

        return endpoints;
    }
}

public sealed record CreateSkillRequest
{
    [JsonPropertyName("id")]
    public string Id { get; init; } = string.Empty;

    [JsonPropertyName("name")]
    public string Name { get; init; } = string.Empty;

    [JsonPropertyName("description")]
    public string Description { get; init; } = string.Empty;

    [JsonPropertyName("stage")]
    public string Stage { get; init; } = string.Empty;

    [JsonPropertyName("content")]
    public string Content { get; init; } = string.Empty;

    [JsonPropertyName("priority")]
    public int? Priority { get; init; }

    [JsonPropertyName("tags")]
    public IReadOnlyList<string>? Tags { get; init; }
}

public sealed record UpdateSkillRequest
{
    [JsonPropertyName("name")]
    public string Name { get; init; } = string.Empty;

    [JsonPropertyName("description")]
    public string Description { get; init; } = string.Empty;

    [JsonPropertyName("content")]
    public string Content { get; init; } = string.Empty;

    [JsonPropertyName("priority")]
    public int Priority { get; init; } = 100;

    private bool? _isEnabled;

    [JsonPropertyName("is_enabled")]
    public bool? IsEnabledSnake
    {
        get => _isEnabled;
        init => _isEnabled = value;
    }

    [JsonPropertyName("isEnabled")]
    public bool? IsEnabledCamel
    {
        get => _isEnabled;
        init => _isEnabled = value;
    }

    [JsonIgnore]
    public bool IsEnabled => _isEnabled ?? true;

    [JsonPropertyName("tags")]
    public IReadOnlyList<string>? Tags { get; init; }
}
