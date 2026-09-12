using System.Text.Json;
using System.Text.Json.Serialization;
using Integrations.Whisper.Audio;
using Kernel.Contracts;
using Kernel.Exceptions;
using Kernel.Platform.FileSystem;
using Kernel.Platform.Process;
using MediaContext.Contracts;
using MediaContext.Domain;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Routing;

namespace Api.Endpoints.Media;

public static class MediaEndpoints
{
    public static IEndpointRouteBuilder MapMediaEndpoints(this IEndpointRouteBuilder endpoints)
    {
        var group = endpoints.MapGroup("/api/v1/media").WithTags("Media");

        group.MapGet("/", async (
            string type = "",
            int page = 1,
            int pageSize = 20,
            IMediaModule media = null!,
            CancellationToken ct = default) =>
        {
            MediaType? filterType = null;
            if (!string.IsNullOrWhiteSpace(type) && Enum.TryParse<MediaType>(type, true, out var parsed))
            {
                filterType = parsed;
            }

            var result = await media.GetAssetsAsync(filterType, page, pageSize, ct);
            return Results.Ok(result);
        });

        group.MapGet("/{id}", async (
            string id,
            IMediaModule media,
            CancellationToken ct) =>
        {
            var asset = await media.GetAssetByIdAsync(id, ct);
            return Results.Ok(asset);
        });

        group.MapPost("/upload", async (
            IFormFile file,
            [FromForm] string? title,
            [FromForm] string? type,
            IMediaModule media,
            IProcessSupervisor processSupervisor,
            CancellationToken ct) =>
        {
            if (file is null || file.Length == 0)
            {
                throw new ValidationException("file", "Файл не загружен или пуст.");
            }

            var mediaType = ResolveMediaType(type, file.ContentType, file.FileName);
            var assetTitle = string.IsNullOrWhiteSpace(title)
                ? Path.GetFileNameWithoutExtension(file.FileName)
                : title!;

            var asset = await media.SaveUploadedAssetAsync(
                assetTitle,
                mediaType,
                file.OpenReadStream(),
                file.FileName,
                ct);

            var duration = await ProbeDurationAsync(processSupervisor, asset.StoragePath, ct);
            return Results.Ok(ToUploadResult(asset, duration));
        }).DisableAntiforgery();

        // Загрузка собственного аудио (озвучка/референс). Возвращает status/path/filename/duration.
        group.MapPost("/upload-audio", async (
            IFormFile file,
            IMediaModule media,
            IProcessSupervisor processSupervisor,
            CancellationToken ct) =>
        {
            if (file is null || file.Length == 0)
            {
                throw new ValidationException("file", "Аудиофайл не загружен или пуст.");
            }

            var asset = await media.SaveUploadedAssetAsync(
                Path.GetFileNameWithoutExtension(file.FileName),
                MediaType.Audio,
                file.OpenReadStream(),
                file.FileName,
                ct);

            var duration = await ProbeDurationAsync(processSupervisor, asset.StoragePath, ct);
            return Results.Ok(ToUploadResult(asset, duration));
        }).DisableAntiforgery();

        // Загрузка пользовательского музыкального трека (аудиотека проекта).
        group.MapPost("/upload-music", async (
            IFormFile file,
            IMediaModule media,
            IProcessSupervisor processSupervisor,
            CancellationToken ct) =>
        {
            if (file is null || file.Length == 0)
            {
                throw new ValidationException("file", "Аудиофайл не загружен или пуст.");
            }

            var asset = await media.SaveUploadedAssetAsync(
                Path.GetFileNameWithoutExtension(file.FileName),
                MediaType.Audio,
                file.OpenReadStream(),
                file.FileName,
                ct);

            var duration = await ProbeDurationAsync(processSupervisor, asset.StoragePath, ct);
            return Results.Ok(ToUploadResult(asset, duration));
        }).DisableAntiforgery();

        group.MapDelete("/{id}", async (
            string id,
            IMediaModule media,
            CancellationToken ct) =>
        {
            await media.DeleteAssetAsync(id, ct);
            return Results.NoContent();
        });

        group.MapPost("/{id}/normalize", async (
            string id,
            [FromBody] NormalizeBrollRequest request,
            IMediaModule media,
            CancellationToken ct) =>
        {
            var result = await media.NormalizeBrollAsync(
                id,
                request.Width,
                request.Height,
                request.Fps,
                ct);

            return Results.Ok(result);
        });

        group.MapGet("/music/catalog", async (
            string mood = "",
            IMediaModule media = null!,
            CancellationToken ct = default) =>
        {
            var catalog = await media.GetMusicCatalogAsync(mood, ct);
            return Results.Ok(catalog);
        });

        group.MapGet("/stock/search", async (
            string query = "",
            string orientation = "",
            int page = 1,
            int perPage = 15,
            IMediaModule media = null!,
            CancellationToken ct = default) =>
        {
            var videos = await media.SearchStockVideosAsync(
                query,
                string.IsNullOrEmpty(orientation) ? null : orientation,
                page,
                perPage,
                ct);

            return Results.Ok(videos);
        });

        group.MapPost("/stock/import", async (
            [FromBody] ImportStockVideoRequest request,
            IMediaModule media,
            CancellationToken ct) =>
        {
            var asset = await media.DownloadAndImportStockVideoAsync(
                request.DownloadUrl,
                request.Title,
                ct);

            return Results.Created($"/api/v1/media/{asset.Id}", asset);
        });

        group.MapPost("/process-broll", async ([FromBody] ProcessBrollCommand cmd, IMediaModule media, CancellationToken ct) =>
            Results.Ok(await media.ProcessBrollAsync(cmd, ct)));

        // --- Media streaming endpoint (Range/206 for video scrubbing) ---
        group.MapGet("/stream", (
            [FromQuery] string path,
            IPathResolver pathResolver) =>
        {
            if (string.IsNullOrWhiteSpace(path)) return Results.BadRequest();

            var cleanPath = path.Split('?')[0];
            var safePath = pathResolver.ResolveSafePath(cleanPath);

            if (!File.Exists(safePath)) return Results.NotFound(new { error = $"File not found: {path}" });

            var ext = Path.GetExtension(safePath).ToLowerInvariant();
            var contentType = ext switch
            {
                ".mp4" => "video/mp4",
                ".webm" => "video/webm",
                ".wav" => "audio/wav",
                ".mp3" => "audio/mpeg",
                ".m4a" => "audio/mp4",
                ".png" => "image/png",
                ".jpg" or ".jpeg" => "image/jpeg",
                _ => "application/octet-stream"
            };

            return Results.File(safePath, contentType, enableRangeProcessing: true);
        });

        // --- Compatibility aliases for frontend ---
        endpoints.MapGet("/api/v1/render/media", (
            [FromQuery] string path,
            IPathResolver pathResolver) =>
        {
            var cleanPath = path.Split('?')[0];
            var safePath = pathResolver.ResolveSafePath(cleanPath);
            if (!File.Exists(safePath)) return Results.NotFound();

            var ext = Path.GetExtension(safePath).ToLowerInvariant();
            var contentType = ext switch
            {
                ".mp4" => "video/mp4",
                ".webm" => "video/webm",
                ".wav" => "audio/wav",
                ".mp3" => "audio/mpeg",
                ".m4a" => "audio/mp4",
                _ => "application/octet-stream"
            };

            return Results.File(safePath, contentType, enableRangeProcessing: true);
        });

        endpoints.MapGet("/api/v1/media/search-stock", async (string query, string orientation = "", IMediaModule media = null!, CancellationToken ct = default) =>
            Results.Ok(new { status = "ok", videos = await media.SearchStockVideosAsync(query, orientation, 1, 15, ct) }));

        endpoints.MapPost("/api/v1/media/download-stock", async ([FromBody] JsonElement payload, IMediaModule media, CancellationToken ct) =>
        {
            var url = payload.GetProperty("url").GetString()!;
            var filename = payload.GetProperty("filename").GetString()!;
            var asset = await media.DownloadAndImportStockVideoAsync(url, filename, ct);
            return Results.Ok(new { status = "ok", path = asset.StoragePath });
        });

        endpoints.MapGet("/api/v1/media/music-library", async (IMediaModule media, CancellationToken ct) =>
        {
            var tracks = await media.GetMusicCatalogAsync(null, ct);
            return Results.Ok(new
            {
                status = "ok",
                categories = new[] { new { category = "default", category_title = "Standard Collection", tracks } },
                custom_tracks = Array.Empty<object>()
            });
        });

        return endpoints;
    }

    /// <summary>
    /// Определяет тип медиа: явный параметр → MIME-тип → расширение файла.
    /// </summary>
    private static MediaType ResolveMediaType(string? declared, string? contentType, string fileName)
    {
        if (!string.IsNullOrWhiteSpace(declared) && Enum.TryParse<MediaType>(declared, true, out var parsed))
        {
            return parsed;
        }

        var mime = (contentType ?? string.Empty).ToLowerInvariant();
        if (mime.StartsWith("image/")) return MediaType.Image;
        if (mime.StartsWith("audio/")) return MediaType.Audio;
        if (mime.StartsWith("video/")) return MediaType.Video;

        var ext = Path.GetExtension(fileName).ToLowerInvariant();
        return ext switch
        {
            ".png" or ".jpg" or ".jpeg" or ".webp" or ".gif" or ".bmp" or ".svg" => MediaType.Image,
            ".wav" or ".mp3" or ".m4a" or ".aac" or ".flac" or ".ogg" or ".opus" => MediaType.Audio,
            _ => MediaType.Video
        };
    }

    /// <summary>
    /// Длительность файла: быстрый путь для WAV из RIFF-заголовка, иначе ffprobe.
    /// </summary>
    private static async Task<double> ProbeDurationAsync(IProcessSupervisor processSupervisor, string path, CancellationToken ct)
    {
        if (path.EndsWith(".wav", StringComparison.OrdinalIgnoreCase))
        {
            try { return WavAudioDecoder.ProbeWavDuration(path); }
            catch { /* не-WAV или битый заголовок — падаем на ffprobe */ }
        }

        try
        {
            var res = await processSupervisor.RunAsync(
                "ffprobe",
                $"-v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 \"{path}\"",
                cancellationToken: ct);

            if (res.ExitCode == 0 && double.TryParse(
                    res.StandardOutput.Trim(),
                    global::System.Globalization.NumberStyles.Float,
                    global::System.Globalization.CultureInfo.InvariantCulture,
                    out var seconds))
            {
                return seconds;
            }
        }
        catch { /* ffprobe недоступен — длительность 0, фронт использует fallback */ }

        return 0;
    }

    private static MediaUploadResult ToUploadResult(MediaAssetDto asset, double duration)
    {
        var effectiveDuration = duration > 0 ? duration : (asset.DurationSeconds ?? 0);
        return new MediaUploadResult(
            Status: "ok",
            Id: asset.Id,
            Title: asset.Title,
            Type: asset.Type,
            Source: asset.Source,
            StoragePath: asset.StoragePath,
            Path: asset.StoragePath,
            FileName: Path.GetFileName(asset.StoragePath),
            Extension: asset.Extension,
            FileSizeBytes: asset.FileSizeBytes,
            Duration: effectiveDuration,
            DurationSeconds: effectiveDuration > 0 ? effectiveDuration : null,
            Width: asset.Width,
            Height: asset.Height,
            CreatedAt: asset.CreatedAt);
    }
}

/// <summary>
/// Совместимый с фронтендом ответ загрузки: поля ассета + status/path/filename/duration.
/// </summary>
public sealed record MediaUploadResult(
    [property: JsonPropertyName("status")] string Status,
    [property: JsonPropertyName("id")] string Id,
    [property: JsonPropertyName("title")] string Title,
    [property: JsonPropertyName("type")] MediaType Type,
    [property: JsonPropertyName("source")] AssetSource Source,
    [property: JsonPropertyName("storage_path")] string StoragePath,
    [property: JsonPropertyName("path")] string Path,
    [property: JsonPropertyName("filename")] string FileName,
    [property: JsonPropertyName("extension")] string Extension,
    [property: JsonPropertyName("file_size_bytes")] long FileSizeBytes,
    [property: JsonPropertyName("duration")] double Duration,
    [property: JsonPropertyName("duration_seconds")] double? DurationSeconds,
    [property: JsonPropertyName("width")] int? Width,
    [property: JsonPropertyName("height")] int? Height,
    [property: JsonPropertyName("created_at")] DateTimeOffset CreatedAt);

public sealed record NormalizeBrollRequest(
    [property: JsonPropertyName("width")] int Width,
    [property: JsonPropertyName("height")] int Height,
    [property: JsonPropertyName("fps")] double Fps = 30.0);

public sealed record ImportStockVideoRequest(
    [property: JsonPropertyName("download_url")] string DownloadUrl,
    [property: JsonPropertyName("title")] string Title);
