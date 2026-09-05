using System.Text.Json;
using System.Text.Json.Serialization;
using Kernel.Contracts;
using Kernel.Exceptions;
using Kernel.Platform.FileSystem;
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
            [FromForm] string title,
            [FromForm] string type,
            IFormFile file,
            IMediaModule media,
            CancellationToken ct) =>
        {
            if (!Enum.TryParse<MediaType>(type, true, out var mediaType))
            {
                throw new ValidationException("type", "Неверный тип медиа. Допустимы: Video, Image, Audio.");
            }

            if (file is null || file.Length == 0)
            {
                throw new ValidationException("file", "Файл не загружен или пуст.");
            }

            var asset = await media.SaveUploadedAssetAsync(
                title,
                mediaType,
                file.OpenReadStream(),
                file.FileName,
                ct);

            return Results.Created($"/api/v1/media/{asset.Id}", asset);
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
}

public sealed record NormalizeBrollRequest(
    [property: JsonPropertyName("width")] int Width,
    [property: JsonPropertyName("height")] int Height,
    [property: JsonPropertyName("fps")] double Fps = 30.0);

public sealed record ImportStockVideoRequest(
    [property: JsonPropertyName("download_url")] string DownloadUrl,
    [property: JsonPropertyName("title")] string Title);
