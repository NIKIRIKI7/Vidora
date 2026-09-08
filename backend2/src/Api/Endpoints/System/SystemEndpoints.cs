using System.Text.Json.Serialization;
using Kernel.Events;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using SystemContext.Application.Services;
using SystemContext.Contracts;
using SystemContext.Domain;

namespace Api.Endpoints.System;

public static class SystemEndpoints
{
    public static IEndpointRouteBuilder MapSystemEndpoints(this IEndpointRouteBuilder endpoints)
    {
        var group = endpoints.MapGroup("/api/v1/system").WithTags("System");

        // Метрики железа, CPU, RAM, VRAM
        group.MapGet("/status", async (ISystemModule system, CancellationToken ct) =>
        {
            var status = await system.GetHardwareStatusAsync(ct);
            return Results.Ok(status);
        });

        // Список настроек системы
        group.MapGet("/settings", async (ISystemModule system, CancellationToken ct) =>
        {
            var settings = await system.GetAllSettingsAsync(ct);
            return Results.Ok(settings);
        });

        // Получение настройки по ключу
        group.MapGet("/settings/{key}", async (string key, ISystemModule system, CancellationToken ct) =>
        {
            var setting = await system.GetSettingAsync(key, ct);
            return Results.Ok(setting);
        });

        // Обновление настройки
        group.MapPut("/settings/{key}", async (string key, UpdateSettingRequest request, ISystemModule system, CancellationToken ct) =>
        {
            var updated = await system.SetSettingAsync(key, request.Value, ct);
            return Results.Ok(updated);
        });

        // Каталог AI моделей
        group.MapGet("/models", async (ISystemModule system, CancellationToken ct) =>
        {
            var models = await system.GetAiModelsAsync(ct);
            return Results.Ok(models);
        });

        // Единый каталог моделей по ролям конвейера
        group.MapGet("/models/catalog", async (
            ModelTaskRole? role,
            IModelCatalogService catalog,
            CancellationToken ct) =>
        {
            var entries = await catalog.GetCatalogAsync(role, ct);
            return Results.Ok(entries);
        });

        // Запуск загрузки весов модели
        group.MapPost("/models/{modelId}/download", async (string modelId, ISystemModule system, CancellationToken ct) =>
        {
            var result = await system.TriggerModelDownloadAsync(modelId, ct);
            return Results.Accepted($"/api/v1/system/models/{result.Id}", result);
        });

        // Очистка временных файлов
        group.MapPost("/maintenance/clean-temp", async (ISystemModule system, CancellationToken ct) =>
        {
            await system.CleanSystemTempFilesAsync(ct);
            return Results.Ok(new { message = "Временные файлы очищены успешно." });
        });

        // Мониторинг DLQ шины событий
        group.MapGet("/dead-letters", (IEventDeadLetterQueue dlq) =>
            Results.Ok(dlq.GetFailures().Select(f => new
            {
                event_id = f.Event.EventId,
                event_type = f.Event.EventType,
                handler = f.HandlerName,
                error = f.Error.Message,
                failed_at = f.FailedAt
            })));

        // Просмотр структурированных системных логов
        group.MapGet("/logs", async (
            int limit = 100,
            string level = "",
            ISystemModule system = null!,
            CancellationToken ct = default) =>
        {
            var logs = await system.GetRecentLogsAsync(limit, string.IsNullOrWhiteSpace(level) ? null : level, ct);
            return Results.Ok(logs);
        });

        return endpoints;
    }
}

public sealed record UpdateSettingRequest(
    [property: JsonPropertyName("value")] string Value);
