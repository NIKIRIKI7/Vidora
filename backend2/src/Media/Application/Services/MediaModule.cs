using Kernel.Contracts;
using Kernel.Exceptions;
using Kernel.Platform.FileSystem;
using Kernel.Ports;
using MediaContext.Contracts;
using MediaContext.Domain;
using MediaContext.Domain.Entities;
using MediaContext.Domain.Ports;
using MediaContext.Domain.ValueObjects;
using Microsoft.Extensions.Logging;
using Skills.Contracts;
using Skills.Domain;
using System.Text.Json;

namespace MediaContext.Application.Services;

public sealed class MediaModule : IMediaModule
{
    private readonly IMediaAssetRepository _repository;
    private readonly IMediaStorageService _storageService;
    private readonly IBrollNormalizer _normalizer;
    private readonly IMusicCatalogProvider _musicCatalog;
    private readonly IPexelsClient _pexelsClient;
    private readonly IPathResolver _pathResolver;
    private readonly ILlmClient _llmClient;
    private readonly ISkillsCatalog _skillsCatalog;
    private readonly ILogger<MediaModule> _logger;

    public MediaModule(
        IMediaAssetRepository repository,
        IMediaStorageService storageService,
        IBrollNormalizer normalizer,
        IMusicCatalogProvider musicCatalog,
        IPexelsClient pexelsClient,
        IPathResolver pathResolver,
        ILlmClient llmClient,
        ISkillsCatalog skillsCatalog,
        ILogger<MediaModule> logger)
    {
        _repository = repository;
        _storageService = storageService;
        _normalizer = normalizer;
        _musicCatalog = musicCatalog;
        _pexelsClient = pexelsClient;
        _pathResolver = pathResolver;
        _llmClient = llmClient;
        _skillsCatalog = skillsCatalog;
        _logger = logger;
    }

    public async Task<MediaAssetDto> GetAssetByIdAsync(string assetId, CancellationToken ct = default)
    {
        if (!MediaAssetId.TryParse(assetId, out var id))
        {
            throw new ResourceNotFoundException("MediaAsset", assetId);
        }

        var asset = await _repository.GetByIdAsync(id, ct)
            ?? throw new ResourceNotFoundException("MediaAsset", assetId);

        return MapToDto(asset);
    }

    public async Task<PagedResult<MediaAssetDto>> GetAssetsAsync(MediaType? type, int page = 1, int pageSize = 50, CancellationToken ct = default)
    {
        page = Math.Max(1, page);
        pageSize = Math.Clamp(pageSize, 1, 200);

        int total = await _repository.CountAsync(type, ct);
        var items = await _repository.GetPagedAsync(type, (page - 1) * pageSize, pageSize, ct);

        return PagedResult<MediaAssetDto>.Create(
            items.Select(MapToDto).ToList(),
            total,
            page,
            pageSize);
    }

    public async Task<MediaAssetDto> SaveUploadedAssetAsync(string title, MediaType type, Stream stream, string originalFileName, CancellationToken ct = default)
    {
        var subDir = Path.Combine("uploads", type.ToString().ToLowerInvariant());
        var stored = await _storageService.SaveAsync(stream, subDir, originalFileName, ct);

        var asset = MediaAsset.Create(
            id: MediaAssetId.NewId(),
            title: title,
            type: type,
            source: AssetSource.UserUpload,
            storagePath: stored.StoragePath,
            extension: stored.Extension,
            fileSizeBytes: stored.SizeBytes,
            sha256Hash: stored.Sha256Hash);

        await _repository.AddAsync(asset, ct);
        await _repository.SaveChangesAsync(ct);

        _logger.LogInformation("[MediaModule] Ассет успешно сохранен: {AssetId} ({Title})", asset.Id.Value, asset.Title);
        return MapToDto(asset);
    }

    public async Task<NormalizedBrollDto> NormalizeBrollAsync(string assetId, int targetWidth, int targetHeight, double targetFps = 30.0, CancellationToken ct = default)
    {
        if (!MediaAssetId.TryParse(assetId, out var id))
        {
            throw new ResourceNotFoundException("MediaAsset", assetId);
        }

        var asset = await _repository.GetByIdAsync(id, ct)
            ?? throw new ResourceNotFoundException("MediaAsset", assetId);

        var targetDimensions = new MediaDimensions(targetWidth, targetHeight);
        var normDir = _storageService.ResolveSafeDirectory("normalized");
        var normFileName = $"{asset.Id.Value}_{targetDimensions}_{targetFps:F0}fps.mp4";
        var normPath = _pathResolver.ResolveSafePath(Path.Combine(normDir, normFileName));

        var generatedPath = await _normalizer.NormalizeVideoAsync(asset.StoragePath, normPath, targetDimensions, targetFps, ct);
        var fileInfo = new FileInfo(generatedPath);

        asset.MarkNormalized(generatedPath, targetDimensions, targetFps, fileInfo.Length);
        await _repository.UpdateAsync(asset, ct);
        await _repository.SaveChangesAsync(ct);

        return new NormalizedBrollDto(
            AssetId: asset.Id.Value,
            OriginalPath: asset.StoragePath,
            NormalizedPath: asset.NormalizedStoragePath!,
            Width: targetDimensions.Width,
            Height: targetDimensions.Height,
            Fps: asset.Fps ?? targetFps,
            DurationSeconds: asset.Duration?.TotalSeconds);
    }

    public async Task<IReadOnlyList<StockVideoDto>> SearchStockVideosAsync(string query, string? orientation = null, int page = 1, int perPage = 15, CancellationToken ct = default)
    {
        var filter = new PexelsSearchFilter(query, orientation, null, page, perPage);
        var results = await _pexelsClient.SearchVideosAsync(filter, ct);

        return results.Select(v =>
        {
            var bestFile = v.VideoFiles.OrderByDescending(f => f.Width).FirstOrDefault() ?? v.VideoFiles.FirstOrDefault();
            return new StockVideoDto(
                Id: v.Id,
                Title: $"Pexels: {query} ({v.Id})",
                Url: v.Url,
                ImagePreview: v.ImageUrl,
                DurationSeconds: v.DurationSeconds,
                DownloadUrl: bestFile?.Link ?? string.Empty,
                Width: bestFile?.Width ?? v.Width,
                Height: bestFile?.Height ?? v.Height);
        }).ToList();
    }

    public async Task<MediaAssetDto> DownloadAndImportStockVideoAsync(string downloadUrl, string title, CancellationToken ct = default)
    {
        var assetId = MediaAssetId.NewId("broll");
        var targetDir = _storageService.ResolveSafeDirectory("stocks");
        var fileName = $"{assetId.Value}_stock.mp4";
        var safeDest = _pathResolver.ResolveSafePath(Path.Combine(targetDir, fileName));

        var downloadedPath = await _pexelsClient.DownloadVideoAsync(downloadUrl, safeDest, null, ct);
        var fileInfo = new FileInfo(downloadedPath);

        var asset = MediaAsset.Create(
            id: assetId,
            title: title,
            type: MediaType.Video,
            source: AssetSource.StockPexels,
            storagePath: downloadedPath,
            extension: "mp4",
            fileSizeBytes: fileInfo.Length);

        await _repository.AddAsync(asset, ct);
        await _repository.SaveChangesAsync(ct);

        return MapToDto(asset);
    }

    public async Task<IReadOnlyList<MusicTrackDto>> GetMusicCatalogAsync(string? moodFilter = null, CancellationToken ct = default)
    {
        var tracks = await _musicCatalog.GetTracksAsync(moodFilter, ct);
        return tracks
            .Select(t => new MusicTrackDto(
                t.Id,
                t.Name,
                t.Genre,
                t.Mood,
                t.DurationSeconds,
                t.FilePath,
                t.TempoBpm))
            .ToList();
    }

    public async Task DeleteAssetAsync(string assetId, CancellationToken ct = default)
    {
        if (!MediaAssetId.TryParse(assetId, out var id))
        {
            throw new ResourceNotFoundException("MediaAsset", assetId);
        }

        var asset = await _repository.GetByIdAsync(id, ct)
            ?? throw new ResourceNotFoundException("MediaAsset", assetId);

        asset.PrepareDelete();
        await _storageService.DeletePhysicalFileAsync(asset.StoragePath, ct);

        if (!string.IsNullOrEmpty(asset.NormalizedStoragePath))
        {
            await _storageService.DeletePhysicalFileAsync(asset.NormalizedStoragePath, ct);
        }

        await _repository.DeleteAsync(asset, ct);
        await _repository.SaveChangesAsync(ct);

        _logger.LogInformation("[MediaModule] Ассет удален: {AssetId}", assetId);
    }

    public async Task<ProcessBrollResponse> ProcessBrollAsync(ProcessBrollCommand command, CancellationToken ct = default)
    {
        var safeSource = _pathResolver.ResolveSafePath(command.SourcePath);
        var targetDir = _storageService.ResolveSafeDirectory(Path.Combine(command.ProjectPath, "assets", "b-roll"));
        var targetFileName = $"{command.FilenamePrefix}_{Guid.NewGuid().ToString("N")[..6]}.mp4";
        var safeDest = Path.Combine(targetDir, targetFileName);

        var isVertical = command.TargetFormat == "9:16";
        var dims = isVertical ? new MediaDimensions(1080, 1920) : new MediaDimensions(1920, 1080);

        var normalizedPath = await _normalizer.NormalizeVideoAsync(
            safeSource,
            safeDest,
            dims,
            command.Fps,
            ct);

        var fileInfo = new FileInfo(normalizedPath);
        var duration = command.TargetDuration ?? 3.0;

        string? extractedAudio = null;
        if (command.ExtractAudio)
        {
            extractedAudio = Path.ChangeExtension(safeDest, ".wav");
        }

        return new ProcessBrollResponse("ok", targetFileName, normalizedPath, duration, extractedAudio);
    }

    public async Task<AutoBrollResponse> AutoMatchBrollAsync(AutoBrollCommand command, CancellationToken ct = default)
    {
        if (command.Fragments is null || command.Fragments.Count == 0)
        {
            return new AutoBrollResponse("ok", []);
        }

        var isVertical = string.Equals(command.Format, "9:16", StringComparison.OrdinalIgnoreCase);
        var orientation = isVertical ? "portrait" : "landscape";
        var targetDimensions = isVertical ? MediaDimensions.FullHdVertical : MediaDimensions.FullHdLandscape;

        var rawDir = _storageService.ResolveSafeDirectory(Path.Combine(command.ProjectPath, "assets", "b-roll-raw"));
        var normDir = _storageService.ResolveSafeDirectory(Path.Combine(command.ProjectPath, "assets", "b-roll"));

        var searchQueries = await GenerateSearchQueriesAsync(command.Fragments, ct);

        var results = new List<AutoBrollMatchResult>();
        var usedStockIds = new HashSet<int>();

        foreach (var fragment in command.Fragments)
        {
            ct.ThrowIfCancellationRequested();

            if (!searchQueries.TryGetValue(fragment.Id, out var query) || string.IsNullOrWhiteSpace(query))
            {
                query = ExtractFallbackKeyword(fragment.VisualNote, fragment.Text);
            }

            try
            {
                _logger.LogInformation("[AutoBroll] Поиск футажа для {Id}: '{Query}' ({Orientation})",
                    fragment.Id, query, orientation);

                var filter = new PexelsSearchFilter(query, orientation, null, 1, 5);
                var stockVideos = await _pexelsClient.SearchVideosAsync(filter, ct);

                var candidateVideo = stockVideos.FirstOrDefault(v => !usedStockIds.Contains(v.Id))
                                     ?? stockVideos.FirstOrDefault();

                if (candidateVideo is null)
                {
                    _logger.LogWarning("[AutoBroll] Футаж для фрагмента {Id} не найден.", fragment.Id);
                    results.Add(new AutoBrollMatchResult(fragment.Id, false, null));
                    continue;
                }

                usedStockIds.Add(candidateVideo.Id);

                var chosenFile = candidateVideo.VideoFiles
                    .OrderByDescending(f => isVertical ? f.Height : f.Width)
                    .FirstOrDefault(f => (isVertical ? f.Height : f.Width) <= 1920)
                    ?? candidateVideo.VideoFiles.FirstOrDefault();

                if (chosenFile is null || string.IsNullOrWhiteSpace(chosenFile.Link))
                {
                    results.Add(new AutoBrollMatchResult(fragment.Id, false, null));
                    continue;
                }

                var safeFrag = _pathResolver.SanitizeFileName(fragment.Id);
                var rawFilename = $"pexels_{candidateVideo.Id}_{safeFrag}.mp4";
                var rawFilePath = Path.Combine(rawDir, rawFilename);
                await _pexelsClient.DownloadVideoAsync(chosenFile.Link, rawFilePath, null, ct);

                var normFilename = $"broll_{safeFrag}_{Guid.NewGuid().ToString("N")[..6]}.mp4";
                var normFilePath = Path.Combine(normDir, normFilename);

                await _normalizer.NormalizeVideoAsync(rawFilePath, normFilePath, targetDimensions, 30.0, ct);

                _logger.LogInformation("[AutoBroll] Фрагмент {Id} связан с {Filename}", fragment.Id, normFilename);
                results.Add(new AutoBrollMatchResult(fragment.Id, true, normFilename));
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                _logger.LogError(ex, "[AutoBroll] Сбой подбора B-Roll для фрагмента {Id}", fragment.Id);
                results.Add(new AutoBrollMatchResult(fragment.Id, false, null));
            }
        }

        return new AutoBrollResponse("ok", results);
    }

    private async Task<Dictionary<string, string>> GenerateSearchQueriesAsync(
        IReadOnlyList<AutoBrollFragmentItem> fragments,
        CancellationToken ct)
    {
        var queries = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);

        try
        {
            var skillBundle = await _skillsCatalog.GetSkillBundleForStageAsync(SkillStage.BrollMatching, 2000, null, ct);

            var fragmentsSummary = string.Join("\n", fragments.Select(f =>
                $"- ID: {f.Id} | Visual: \"{f.VisualNote}\" | Spoken: \"{f.Text}\""));

            var systemPrompt =
                $"{skillBundle.SystemPrompt}\n" +
                "You are an expert video director. For each scene fragment, output a concise 1-3 word English search query for stock video footage (Pexels). " +
                "Always translate concepts to simple English (e.g., 'серверная' -> 'server room', 'код' -> 'programming code', 'успех' -> 'happy businessman'). " +
                "Output strictly valid JSON object: { \"queries\": [ { \"id\": \"frag-id\", \"query\": \"english search term\" } ] }";

            var spec = new LlmPromptSpec(
                Messages:
                [
                    new LlmPromptMessage("system", systemPrompt),
                    new LlmPromptMessage("user", $"Generate stock video queries for these fragments:\n{fragmentsSummary}")
                ],
                Temperature: 0.2f,
                JsonMode: true);

            using var doc = await _llmClient.GenerateJsonAsync<JsonDocument>(spec, ct);
            if (doc is not null
                && doc.RootElement.TryGetProperty("queries", out var queriesArray)
                && queriesArray.ValueKind == JsonValueKind.Array)
            {
                foreach (var item in queriesArray.EnumerateArray())
                {
                    if (item.TryGetProperty("id", out var idProp) && item.TryGetProperty("query", out var queryProp))
                    {
                        var id = idProp.GetString();
                        var q = queryProp.GetString();
                        if (!string.IsNullOrWhiteSpace(id) && !string.IsNullOrWhiteSpace(q))
                        {
                            queries[id] = q.Trim();
                        }
                    }
                }
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "[AutoBroll] LLM extraction failed, использую keyword-fallback.");
        }

        return queries;
    }

    private static string ExtractFallbackKeyword(string visualNote, string text)
    {
        var combined = $"{visualNote} {text}";
        var clean = System.Text.RegularExpressions.Regex.Replace(combined, @"\[.*?\]|\(.*?\)|[*_#]", " ");
        clean = System.Text.RegularExpressions.Regex.Replace(clean, @"\s+", " ").Trim();

        var words = clean
            .Split(' ', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Where(w => w.Length >= 4)
            .Take(2);

        var result = string.Join(" ", words);
        return string.IsNullOrWhiteSpace(result) ? "technology abstract" : result;
    }

    private static MediaAssetDto MapToDto(MediaAsset entity) => new()
    {
        Id = entity.Id.Value,
        Title = entity.Title,
        Type = entity.Type,
        Source = entity.Source,
        StoragePath = entity.StoragePath,
        Extension = entity.Extension,
        FileSizeBytes = entity.FileSizeBytes,
        Width = entity.Dimensions?.Width,
        Height = entity.Dimensions?.Height,
        AspectRatio = entity.Dimensions?.AspectRatio.ToString(),
        DurationSeconds = entity.Duration?.TotalSeconds,
        Fps = entity.Fps,
        IsNormalized = entity.IsNormalized,
        NormalizedStoragePath = entity.NormalizedStoragePath,
        CreatedAt = entity.CreatedAt
    };
}
