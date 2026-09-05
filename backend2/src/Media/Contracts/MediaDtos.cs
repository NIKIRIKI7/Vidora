using System.Text.Json.Serialization;
using MediaContext.Domain;

namespace MediaContext.Contracts;

public sealed record MediaAssetDto
{
    [JsonPropertyName("id")]
    public required string Id { get; init; }

    [JsonPropertyName("title")]
    public required string Title { get; init; }

    [JsonPropertyName("type")]
    public MediaType Type { get; init; }

    [JsonPropertyName("source")]
    public AssetSource Source { get; init; }

    [JsonPropertyName("storage_path")]
    public required string StoragePath { get; init; }

    [JsonPropertyName("extension")]
    public required string Extension { get; init; }

    [JsonPropertyName("file_size_bytes")]
    public long FileSizeBytes { get; init; }

    [JsonPropertyName("width")]
    public int? Width { get; init; }

    [JsonPropertyName("height")]
    public int? Height { get; init; }

    [JsonPropertyName("aspect_ratio")]
    public string? AspectRatio { get; init; }

    [JsonPropertyName("duration_seconds")]
    public double? DurationSeconds { get; init; }

    [JsonPropertyName("fps")]
    public double? Fps { get; init; }

    [JsonPropertyName("is_normalized")]
    public bool IsNormalized { get; init; }

    [JsonPropertyName("normalized_storage_path")]
    public string? NormalizedStoragePath { get; init; }

    [JsonPropertyName("created_at")]
    public DateTimeOffset CreatedAt { get; init; }
}

public sealed record NormalizedBrollDto(
    [property: JsonPropertyName("asset_id")] string AssetId,
    [property: JsonPropertyName("original_path")] string OriginalPath,
    [property: JsonPropertyName("normalized_path")] string NormalizedPath,
    [property: JsonPropertyName("width")] int Width,
    [property: JsonPropertyName("height")] int Height,
    [property: JsonPropertyName("fps")] double Fps,
    [property: JsonPropertyName("duration_seconds")] double? DurationSeconds);

public sealed record StockVideoDto(
    [property: JsonPropertyName("id")] int Id,
    [property: JsonPropertyName("title")] string Title,
    [property: JsonPropertyName("url")] string Url,
    [property: JsonPropertyName("image_preview")] string ImagePreview,
    [property: JsonPropertyName("duration_seconds")] int DurationSeconds,
    [property: JsonPropertyName("download_url")] string DownloadUrl,
    [property: JsonPropertyName("width")] int Width,
    [property: JsonPropertyName("height")] int Height);

public sealed record MusicTrackDto(
    [property: JsonPropertyName("id")] string Id,
    [property: JsonPropertyName("name")] string Name,
    [property: JsonPropertyName("genre")] string Genre,
    [property: JsonPropertyName("mood")] string Mood,
    [property: JsonPropertyName("duration_seconds")] double DurationSeconds,
    [property: JsonPropertyName("file_path")] string FilePath,
    [property: JsonPropertyName("tempo_bpm")] int TempoBpm);

public sealed record ProcessBrollCommand(
    string SourcePath,
    string ProjectPath,
    string FilenamePrefix,
    string TargetFormat,
    string TargetResolution,
    int Fps,
    string FitMode,
    double? TargetDuration,
    bool LoopIfShorter,
    bool KeepAudio,
    bool ExtractAudio);

public sealed record ProcessBrollResponse(
    [property: JsonPropertyName("status")] string Status,
    [property: JsonPropertyName("filename")] string Filename,
    [property: JsonPropertyName("path")] string Path,
    [property: JsonPropertyName("duration")] double Duration,
    [property: JsonPropertyName("extracted_audio_path")] string? ExtractedAudioPath);
