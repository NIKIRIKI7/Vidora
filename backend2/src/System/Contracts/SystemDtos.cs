using System.Text.Json.Serialization;
using SystemContext.Domain;

namespace SystemContext.Contracts;

public sealed record SystemHardwareStatusDto
{
    [JsonPropertyName("cpu_usage_percent")]
    public double CpuUsagePercent { get; init; }

    [JsonPropertyName("process_memory_mb")]
    public double ProcessMemoryMb { get; init; }

    [JsonPropertyName("managed_memory_mb")]
    public double ManagedMemoryMb { get; init; }

    [JsonPropertyName("storage_free_gb")]
    public double StorageFreeGb { get; init; }

    [JsonPropertyName("storage_total_gb")]
    public double StorageTotalGb { get; init; }

    [JsonPropertyName("gpu_available")]
    public bool GpuAvailable { get; init; }

    [JsonPropertyName("os_description")]
    public string OsDescription { get; init; } = string.Empty;

    [JsonPropertyName("uptime")]
    public TimeSpan Uptime { get; init; }
}

public sealed record SystemSettingDto(
    [property: JsonPropertyName("key")] string Key,
    [property: JsonPropertyName("value")] string Value,
    [property: JsonPropertyName("description")] string Description,
    [property: JsonPropertyName("data_type")] string DataType,
    [property: JsonPropertyName("is_readonly")] bool IsReadOnly,
    [property: JsonPropertyName("updated_at")] DateTimeOffset UpdatedAt);

public sealed record AiModelDto(
    [property: JsonPropertyName("id")] string Id,
    [property: JsonPropertyName("name")] string Name,
    [property: JsonPropertyName("category")] ModelCategory Category,
    [property: JsonPropertyName("target_directory")] string TargetDirectory,
    [property: JsonPropertyName("expected_size_mb")] double ExpectedSizeMb,
    [property: JsonPropertyName("downloaded_size_mb")] double DownloadedSizeMb,
    [property: JsonPropertyName("status")] ModelDownloadStatus Status,
    [property: JsonPropertyName("error_message")] string? ErrorMessage,
    [property: JsonPropertyName("version")] string Version,
    [property: JsonPropertyName("is_required")] bool IsRequired);

public sealed record SystemLogEntryDto(
    [property: JsonPropertyName("timestamp")] DateTimeOffset Timestamp,
    [property: JsonPropertyName("level")] string Level,
    [property: JsonPropertyName("category")] string Category,
    [property: JsonPropertyName("event_id")] int EventId,
    [property: JsonPropertyName("message")] string Message,
    [property: JsonPropertyName("exception")] object? Exception);

public sealed record ModelCatalogEntryDto(
    [property: JsonPropertyName("id")] string Id,
    [property: JsonPropertyName("name")] string Name,
    [property: JsonPropertyName("provider")] string Provider, // "local_gguf" | "local_voice" | "routerai" | "aitunnel" | "openai" | "minimax"
    [property: JsonPropertyName("mode")] string Mode,         // "local" | "cloud"
    [property: JsonPropertyName("roles")] IReadOnlyList<ModelTaskRole> Roles,
    [property: JsonPropertyName("is_available")] bool IsAvailable,
    [property: JsonPropertyName("status_details")] string? StatusDetails = null);

/// <summary>Плоский хардвар-статус для UI настроек.</summary>
public sealed record SystemHardwareInfoDto(
    [property: JsonPropertyName("device")] string Device,
    [property: JsonPropertyName("gpu_type")] string GpuType,
    [property: JsonPropertyName("vram_gb")] double VramGb,
    [property: JsonPropertyName("ram_gb")] double RamGb);

/// <summary>Запрос на загрузку/пулл модели по имени (HF id или ollama tag).</summary>
public sealed record PullModelRequest(
    [property: JsonPropertyName("engine")] string Engine);
