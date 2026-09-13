using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.Extensions.Logging;
using Kernel.Contracts;
using Kernel.Ports;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Research.Application.Pipelines;
using Research.Domain.Ports;
using Research.Domain.Services;
using Skills.Contracts;
using Skills.Domain;

namespace Api.Endpoints.Research;

public static class YouTubeAgentEndpoints
{
    public static IEndpointRouteBuilder MapYouTubeAgentEndpoints(this IEndpointRouteBuilder endpoints)
    {
        var group = endpoints.MapGroup("/api/v1/youtube").WithTags("YouTube DeepTrend Agent");

        // 1. NDJSON streaming trend analysis via DeepTrend DAG pipeline
        group.MapPost("/agent/stream", async (
            StreamAgentRequest request,
            HttpContext context,
            YouTubeDeepTrendStreamingPipeline pipeline,
            CancellationToken ct) =>
        {
            context.Response.ContentType = "application/x-ndjson; charset=utf-8";
            context.Response.Headers.Append("Cache-Control", "no-cache");
            context.Response.Headers.Append("Connection", "keep-alive");

            var settings = request.Settings ?? new StreamAgentSettings();

            // Сквозная передача всех параметров из фронтенда без перебивания дефолтами
            var options = new DeepTrendExecutionOptions
            {
                Query = request.Query,
                Language = settings.Language ?? "ru",
                DaysBack = settings.DaysBack,
                MinSubs = settings.MinSubs,
                MaxSubs = settings.MaxSubs,
                MinRatio = settings.MinRatio,
                SearchMode = settings.SearchMode ?? "trending",
                SearchEngine = settings.SearchEngine ?? "auto",
                VideoType = settings.VideoType ?? "all",
                IdeasCount = settings.IdeasCount > 0 ? settings.IdeasCount : 5,
                ChannelContext = settings.ChannelContext ?? "",
                CompetitorChannels = settings.Channels ?? [],
                ExcludeVideoIds = settings.ExcludeVideoIds ?? [],
                ExcludeQueries = settings.ExcludeQueries ?? [],
                IsExpandSearch = settings.IsExpandSearch,
                YouTubeApiKey = !string.IsNullOrWhiteSpace(request.YouTubeKey) ? request.YouTubeKey : null,
                LlmEngine = request.LlmEngine,
                ApiKeys = request.ApiKeys
            };

            await foreach (var line in pipeline.ExecuteDagStreamAsync(options, ct))
            {
                await context.Response.WriteAsync(line, ct);
                await context.Response.Body.FlushAsync(ct);
            }
        }).Accepts<StreamAgentRequest>("application/json").Produces<string>(StatusCodes.Status200OK, "application/x-ndjson");

        // 2. Competitor suggestions
        group.MapPost("/agent/suggest-competitors", async (
            SuggestCompetitorsRequest request,
            ILlmClient llm,
            IYouTubeSearchIngestor ingestor,
            CancellationToken ct) =>
        {
            if (string.IsNullOrWhiteSpace(request.Niche))
            {
                return Results.BadRequest(new { status = "error", error = "Niche required" });
            }

            var lang = string.IsNullOrWhiteSpace(request.Language) ? "ru" : request.Language!;
            var niche = request.Niche.Trim();

            // 1) DATA-DRIVEN (основной путь): ищем реальные видео в нише и собираем каналы,
            // которые там действительно публикуют контент. Это надёжнее маленькой LLM.
            try
            {
                var queryVariants = new[]
                {
                    niche,
                    $"{niche} обзор",
                    $"{niche} топ",
                    $"{niche} канал"
                };

                var candidates = new List<RawVideoSearchResult>();
                foreach (var q in queryVariants)
                {
                    if (ct.IsCancellationRequested) break;
                    try
                    {
                        var found = await ingestor.SearchTopicCandidatesAsync(q, maxResults: 25, daysBack: 0, lang: lang, ct: ct);
                        candidates.AddRange(found);
                    }
                    catch (Exception ex) when (ex is not OperationCanceledException)
                    {
                        // одна из формулировок может не дать результатов — не критично
                    }
                    if (candidates.Count >= 80) break;
                }

                var dataDrivenChannels = candidates
                    .Where(c => !string.IsNullOrWhiteSpace(c.ChannelTitle))
                    .GroupBy(c => c.ChannelTitle.Trim(), StringComparer.OrdinalIgnoreCase)
                    .Select(g => new
                    {
                        Name = g.Key,
                        VideoCount = g.Count(),
                        TotalViews = g.Sum(v => (double)v.ViewCount)
                    })
                    .OrderByDescending(g => g.VideoCount)
                    .ThenByDescending(g => g.TotalViews)
                    .Select(g => g.Name)
                    .Take(8)
                    .ToList();

                if (dataDrivenChannels.Count >= 3)
                {
                    return Results.Ok(new { status = "ok", channels = dataDrivenChannels });
                }
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                // игнорируем и падаем в LLM-fallback
            }

            // 2) LLM-FALLBACK: универсальный промпт без хардкода IT-каналов.
            var prompt = $$"""
            Ты — эксперт по анализу YouTube. Перечисли 6-8 самых популярных, активных и авторитетных YouTube-каналов в нише: "{{niche}}".
            Если ниша указана общими словами, подбери самых известных представителей этой тематики.
            ВЕРНИ СТРОГО JSON-МАССИВ СТРОК (только точные названия каналов, без ссылок и описаний).
            Пример формата:
            ["Канал 1", "Канал 2", "Канал 3"]
            """;

            var spec = new LlmPromptSpec([new LlmPromptMessage("user", prompt)], Temperature: 0.4f, JsonMode: true);
            try
            {
                var doc = await llm.GenerateJsonAsync<JsonElement>(spec, ct);
                var channels = new List<string>();

                // Гибкий парсинг: обрабатываем как прямой массив [...], так и обертку {"channels": [...]}
                if (doc.ValueKind == JsonValueKind.Array)
                {
                    foreach (var item in doc.EnumerateArray())
                    {
                        var val = item.GetString()?.Trim();
                        if (!string.IsNullOrWhiteSpace(val)) channels.Add(val);
                    }
                }
                else if (doc.ValueKind == JsonValueKind.Object)
                {
                    foreach (var prop in doc.EnumerateObject())
                    {
                        if (prop.Value.ValueKind == JsonValueKind.Array)
                        {
                            foreach (var item in prop.Value.EnumerateArray())
                            {
                                var val = item.GetString()?.Trim();
                                if (!string.IsNullOrWhiteSpace(val)) channels.Add(val);
                            }
                            break;
                        }
                    }
                }

                if (channels.Count == 0)
                {
                    return Results.Ok(new { status = "error", channels = Array.Empty<string>() });
                }

                return Results.Ok(new { status = "ok", channels });
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                return Results.Problem(ex.Message);
            }
        }).Accepts<SuggestCompetitorsRequest>("application/json").Produces<SuggestCompetitorsResponse>();

        // 3. Channel analysis
        group.MapPost("/agent/analyze-channel", async (
            AnalyzeChannelRequest request,
            IYouTubeVideoInspector inspector,
            CancellationToken ct) =>
        {
            if (string.IsNullOrWhiteSpace(request.UrlOrName))
            {
                return Results.BadRequest(new { status = "error", error = "UrlOrName required" });
            }

            try
            {
                var summary = await inspector.GetMetadataSummaryAsync(request.UrlOrName, ct);
                return Results.Ok(new
                {
                    status = "ok",
                    context = $"Канал {summary.ChannelTitle}: {summary.Title} — {summary.Description}"
                });
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                return Results.Problem(ex.Message);
            }
        }).Accepts<AnalyzeChannelRequest>("application/json").Produces<AnalyzeChannelResponse>();

        // 4. Hook analysis
        group.MapPost("/agent/analyze-hook", async (
            AnalyzeHookRequest request,
            ISkillsCatalog skillsCatalog,
            ILlmClient llm,
            IYouTubeVideoInspector inspector,
            ILoggerFactory loggerFactory,
            CancellationToken ct) =>
        {
            var logger = loggerFactory.CreateLogger("YouTube.AnalyzeHook");
            var targetVideoId = !string.IsNullOrWhiteSpace(request.VideoId)
                ? request.VideoId
                : (!string.IsNullOrWhiteSpace(request.VideoUrl) ? request.VideoUrl : null);

            string effectiveTranscript = request.Transcript ?? string.Empty;
            IReadOnlyList<HeatmapPointDto> rawHeatmap = [];

            if (!string.IsNullOrWhiteSpace(targetVideoId))
            {
                try
                {
                    var scrapedSubtitles = await inspector.GetTranscriptAsync(targetVideoId, ["en", "ru"], ct);
                    if (!string.IsNullOrWhiteSpace(scrapedSubtitles))
                    {
                        effectiveTranscript = scrapedSubtitles;
                    }
                }
                catch (Exception ex) when (ex is not OperationCanceledException)
                {
                    logger.LogDebug(ex, "[YouTube] Не удалось получить транскрипт для {VideoId}", targetVideoId);
                }

                try
                {
                    rawHeatmap = await inspector.GetHeatmapAsync(targetVideoId, ct);
                }
                catch (Exception ex) when (ex is not OperationCanceledException)
                {
                    logger.LogDebug(ex, "[YouTube] Не удалось получить heatmap для {VideoId}", targetVideoId);
                }
            }

            if (string.IsNullOrWhiteSpace(effectiveTranscript))
            {
                effectiveTranscript = request.Transcript ?? "Вступительные секунды видео";
            }

            // Берем первые 30-40 секунд (около 60-90 слов) для анализа хука
            var hookWords = effectiveTranscript.Split(' ', StringSplitOptions.RemoveEmptyEntries);
            var openingSnippet = string.Join(" ", hookWords.Take(70));

            var skillBundle = await skillsCatalog.GetSkillBundleForStageAsync(SkillStage.HookAnalysis, 2000, cancellationToken: ct);
            var prompt = $$"""
            {{skillBundle.SystemPrompt}}
            Analyze this video opening transcript (topic: {{request.Transcript}}):
            "{{openingSnippet}}"
            Output strictly JSON:
            {
              "original_hook": "{{openingSnippet.Substring(0, Math.Min(120, openingSnippet.Length))}}",
              "psychology": "Использование когнитивного диссонанса и открытой петли",
              "flaws_identified": "Слишком долгое приветствие перед переходом к сути",
              "stolen_hooks": [
                {
                  "angle": "Прямая провокация",
                  "hook_0_5s": "Все, что вам говорили об этом — чистый маркетинг.",
                  "hook_5_20s": "Вот реальные тесты, которые показывают правду.",
                  "why_it_converts": "Удар по скепсису зрителя"
                }
              ]
            }
            """;
            try
            {
                var data = await llm.GenerateJsonAsync<JsonElement>(new LlmPromptSpec([new LlmPromptMessage("user", prompt)], Temperature: 0.3f, JsonMode: true), ct);

                var stolenHooks = data.TryGetProperty("stolen_hooks", out var sh) && sh.ValueKind == JsonValueKind.Array
                    ? sh.Deserialize<List<StolenHookDto>>() ?? []
                    : [];

                var hookData = new HookAnalysisDto(
                    OriginalHook: data.TryGetProperty("original_hook", out var oh) ? oh.GetString() : openingSnippet,
                    TranscriptSnippet: openingSnippet,
                    Psychology: data.TryGetProperty("psychology", out var psy) ? psy.GetString() : "Удержание через когнитивный диссонанс и незакрытую петлю",
                    FlawsIdentified: data.TryGetProperty("flaws_identified", out var fl) ? fl.GetString() : "Недостаточно резкий визуальный хук в первые 2 секунды",
                    StolenHooks: stolenHooks,
                    Heatmap: rawHeatmap);

                return Results.Ok(new AnalyzeHookResponse("ok", hookData));
            }
            catch
            {
                return Results.Json(
                    new
                    {
                        status = "error",
                        error_code = "HOOK_ANALYSIS_FAILED",
                        data = new
                        {
                            original_hook = "",
                            transcript_snippet = openingSnippet,
                            psychology = "",
                            flaws_identified = "",
                            stolen_hooks = Array.Empty<object>(),
                            heatmap = Array.Empty<object>()
                        }
                    },
                    statusCode: StatusCodes.Status502BadGateway);
            }
        }).Accepts<AnalyzeHookRequest>("application/json").Produces<AnalyzeHookResponse>();

        // 5. Script drafting
        group.MapPost("/agent/draft-script", async (
            DraftScriptRequest request,
            ISkillsCatalog skillsCatalog,
            ILlmClient llm,
            CancellationToken ct) =>
        {
            var skillBundle = await skillsCatalog.GetSkillBundleForStageAsync(SkillStage.ScriptDrafting, 2500, cancellationToken: ct);
            var prompt = $$"""
            {{skillBundle.SystemPrompt}}
            Напиши полноценный сценарий ролика в формате Vidora Markdown по теме: "{{request.Title}}".
            Описание идеи: {{request.IdeaDescription ?? request.Title}}.
            Формат: {{request.VideoType ?? "long"}}. Длительность: ~{{request.TargetDuration ?? "3"}} мин.
            Формат оформления строго:
            ---
            title: "{{request.Title}}"
            fps: 30
            ---
            [Хук] (00:00:00)
            *(Постерный сплит: крупный неоновый текст)* Первые слова диктора.
            [Суть проблемы] (00:00:15)
            *(Инфографика: схема работы)* Продолжение мысли диктора.
            [Заключение] (00:01:00)
            *(Финальный кадр)* Подписывайтесь на канал.
            """;
            try
            {
                var script = await llm.GenerateTextAsync(new LlmPromptSpec([new LlmPromptMessage("user", prompt)], Temperature: 0.4f), ct);
                return Results.Ok(new { status = "ok", markdown = script });
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                return Results.Problem("Ошибка при генерации сценария: " + ex.Message);
            }
        }).Accepts<DraftScriptRequest>("application/json").Produces<DraftScriptResponse>();

        // 6. More videos
        group.MapPost("/more-videos", async (
            MoreVideosRequest request,
            IYouTubeSearchIngestor ingestor,
            MomentumEngine momentumEngine,
            CancellationToken ct) =>
        {
            var candidates = await ingestor.SearchTopicCandidatesAsync(request.Query, maxResults: 35, daysBack: request.Settings?.DaysBack ?? 30, lang: request.Settings?.Language ?? "ru", ct: ct);
            var excludeSet = request.ExcludeVideoIds?.ToHashSet(StringComparer.OrdinalIgnoreCase) ?? [];
            var results = candidates
                .Where(c => !excludeSet.Contains(c.VideoId))
                .Select(v =>
                {
                    var momentum = momentumEngine.CalculateMomentum(v.ViewCount, v.PublishedAt, v.SubscriberCount);
                    double ratio = v.SubscriberCount > 0 ? Math.Round((double)v.ViewCount / v.SubscriberCount, 2) : 1.5;
                    return new
                    {
                        video_id = v.VideoId,
                        title = v.Title,
                        channel = v.ChannelTitle,
                        views = v.ViewCount,
                        subs = v.SubscriberCount,
                        ratio = ratio,
                        vph = Math.Round(momentum.ViewsPerHour, 0),
                        url = $"https://www.youtube.com/watch?v={v.VideoId}",
                        thumbnail_url = v.ThumbnailUrl,
                        published_at = v.PublishedAt.ToString("o"),
                        duration_sec = v.DurationSeconds,
                        is_short = v.DurationSeconds <= 60 && v.DurationSeconds > 0,
                        transcript_status = "official_subtitles",
                        transcript_sample = v.Title,
                        m_score = momentum.Score,
                        is_rocket = momentumEngine.IsVelocityOutlier(momentum),
                        acceleration_pct = $"+{Math.Round(momentum.OutlierMultiplier * 40)}%"
                    };
                }).ToList();
            return Results.Ok(new { status = "ok", results });
        }).Accepts<MoreVideosRequest>("application/json").Produces<MoreVideosResponse>();

        // 7. Download metadata
        group.MapPost("/download-meta", async (
            DownloadMetaRequest request,
            IYouTubeVideoInspector inspector,
            CancellationToken ct) =>
        {
            var meta = await inspector.GetMetadataSummaryAsync(request.Url, ct);
            return Results.Ok(new
            {
                status = "ok",
                data = new
                {
                    title = meta.Title,
                    channel = meta.ChannelTitle,
                    transcript_full = string.IsNullOrWhiteSpace(meta.Description) ? meta.Title : meta.Description
                }
            });
        }).Accepts<DownloadMetaRequest>("application/json").Produces<DownloadMetaResponse>();

        // -------------------------------------------------------------
        // YouTube Video Deep-Dive & Retention Inspector
        // -------------------------------------------------------------
        var videoGroup = group.MapGroup("/video/{videoId}");

        videoGroup.MapGet("/heatmap", async (
            string videoId,
            IYouTubeVideoInspector inspector,
            CancellationToken ct) =>
        {
            if (string.IsNullOrWhiteSpace(videoId))
            {
                return Results.BadRequest(new { error = "Параметр videoId обязателен." });
            }

            var heatmap = await inspector.GetHeatmapAsync(videoId, ct);
            return Results.Ok(new { heatmap });
        }).Produces<VideoHeatmapResponse>();

        videoGroup.MapGet("/chapters", async (
            string videoId,
            IYouTubeVideoInspector inspector,
            CancellationToken ct) =>
        {
            if (string.IsNullOrWhiteSpace(videoId))
            {
                return Results.BadRequest(new { error = "Параметр videoId обязателен." });
            }

            var chapters = await inspector.GetChaptersAsync(videoId, ct);
            return Results.Ok(new { chapters });
        }).Produces<VideoChaptersResponse>();

        videoGroup.MapGet("/comments-detailed", async (
            string videoId,
            IYouTubeVideoInspector inspector,
            int maxComments = 50,
            CancellationToken ct = default) =>
        {
            if (string.IsNullOrWhiteSpace(videoId))
            {
                return Results.BadRequest(new { error = "Параметр videoId обязателен." });
            }

            maxComments = Math.Clamp(maxComments, 1, 100);
            var comments = await inspector.GetCommentsDetailedAsync(videoId, maxComments, ct);
            return Results.Ok(new { comments });
        }).Produces<VideoCommentsResponse>();

        videoGroup.MapGet("/deep-dive", async (
            string videoId,
            IYouTubeVideoInspector inspector,
            int maxComments = 50,
            CancellationToken ct = default) =>
        {
            if (string.IsNullOrWhiteSpace(videoId))
            {
                return Results.BadRequest(new { error = "Параметр videoId обязателен." });
            }

            maxComments = Math.Clamp(maxComments, 1, 100);

            // Параллельный сбор данных для минимизации задержки.
            var metaTask = TryFetchAsync(() => inspector.GetMetadataAsync(videoId, ct));
            var heatmapTask = TryFetchAsync(() => inspector.GetHeatmapAsync(videoId, ct));
            var chaptersTask = TryFetchAsync(() => inspector.GetChaptersAsync(videoId, ct));
            var commentsTask = TryFetchAsync(() => inspector.GetCommentsDetailedAsync(videoId, maxComments, ct));

            await Task.WhenAll(metaTask, heatmapTask, chaptersTask, commentsTask);

            var metadata = await metaTask;
            var heatmap = await heatmapTask ?? [];
            var chapters = await chaptersTask ?? [];
            var comments = await commentsTask ?? [];

            var result = new VideoDeepDiveDto(videoId, metadata, heatmap, chapters, comments);
            return Results.Ok(result);
        }).Produces<VideoDeepDiveDto>();

        static async Task<T?> TryFetchAsync<T>(Func<Task<T>> fetch)
        {
            try
            {
                return await fetch();
            }
            catch
            {
                return default;
            }
        }

        return endpoints;
    }
}

public sealed record StreamAgentRequest(
    [property: JsonPropertyName("query")] string Query,
    [property: JsonPropertyName("project_path")] string? ProjectPath,
    [property: JsonPropertyName("settings")] StreamAgentSettings? Settings,
    [property: JsonPropertyName("youtube_key")] string? YouTubeKey,
    [property: JsonPropertyName("llm_engine")] string? LlmEngine,
    [property: JsonPropertyName("api_keys")] ApiKeysDto? ApiKeys);

public sealed record StreamAgentSettings(
    [property: JsonPropertyName("days_back")] int DaysBack = 30,
    [property: JsonPropertyName("min_subs")] long MinSubs = 1000,
    [property: JsonPropertyName("max_subs")] long MaxSubs = 90000,
    [property: JsonPropertyName("min_ratio")] double MinRatio = 1.5,
    [property: JsonPropertyName("search_mode")] string SearchMode = "trending",
    [property: JsonPropertyName("search_engine")] string SearchEngine = "auto",
    [property: JsonPropertyName("language")] string Language = "en",
    [property: JsonPropertyName("video_type")] string VideoType = "all",
    [property: JsonPropertyName("ideas_count")] int IdeasCount = 5,
    [property: JsonPropertyName("channel_context")] string? ChannelContext = "",
    [property: JsonPropertyName("channels")] IReadOnlyList<string>? Channels = null,
    [property: JsonPropertyName("exclude_video_ids")] IReadOnlyList<string>? ExcludeVideoIds = null,
    [property: JsonPropertyName("exclude_queries")] IReadOnlyList<string>? ExcludeQueries = null,
    [property: JsonPropertyName("is_expand_search")] bool IsExpandSearch = false);

public sealed record SuggestCompetitorsRequest(
    [property: JsonPropertyName("niche")] string Niche,
    [property: JsonPropertyName("engine")] string? Engine,
    [property: JsonPropertyName("language")] string? Language,
    [property: JsonPropertyName("api_keys")] ApiKeysDto? ApiKeys);

public sealed record AnalyzeChannelRequest(
    [property: JsonPropertyName("url_or_name")] string UrlOrName,
    [property: JsonPropertyName("engine")] string? Engine,
    [property: JsonPropertyName("language")] string? Language,
    [property: JsonPropertyName("youtube_key")] string? YouTubeKey,
    [property: JsonPropertyName("api_keys")] ApiKeysDto? ApiKeys);

public sealed record AnalyzeHookRequest(
    [property: JsonPropertyName("transcript")] string? Transcript,
    [property: JsonPropertyName("video_id")] string? VideoId,
    [property: JsonPropertyName("video_url")] string? VideoUrl,
    [property: JsonPropertyName("engine")] string? Engine,
    [property: JsonPropertyName("language")] string? Language,
    [property: JsonPropertyName("api_keys")] ApiKeysDto? ApiKeys);

public sealed record DraftScriptRequest(
    [property: JsonPropertyName("title")] string Title,
    [property: JsonPropertyName("idea_description")] string? IdeaDescription,
    [property: JsonPropertyName("channel_context")] string? ChannelContext,
    [property: JsonPropertyName("engine")] string? Engine,
    [property: JsonPropertyName("language")] string? Language,
    [property: JsonPropertyName("target_duration")] string? TargetDuration,
    [property: JsonPropertyName("video_type")] string? VideoType,
    [property: JsonPropertyName("custom_prompt")] string? CustomPrompt,
    [property: JsonPropertyName("audio_engine")] string? AudioEngine);

public sealed record MoreVideosRequest(
    [property: JsonPropertyName("query")] string Query,
    [property: JsonPropertyName("exclude_video_ids")] IReadOnlyList<string>? ExcludeVideoIds,
    [property: JsonPropertyName("settings")] StreamAgentSettings? Settings,
    [property: JsonPropertyName("language")] string? Language,
    [property: JsonPropertyName("youtube_key")] string? YouTubeKey,
    [property: JsonPropertyName("api_keys")] ApiKeysDto? ApiKeys);

public sealed record DownloadMetaRequest(
    [property: JsonPropertyName("url")] string Url,
    [property: JsonPropertyName("project_path")] string? ProjectPath);

public sealed record SuggestCompetitorsResponse(
    [property: JsonPropertyName("status")] string Status,
    [property: JsonPropertyName("channels")] IReadOnlyList<string> Channels);

public sealed record AnalyzeChannelResponse(
    [property: JsonPropertyName("status")] string Status,
    [property: JsonPropertyName("context")] string Context);

public sealed record StolenHookDto(
    [property: JsonPropertyName("angle")] string? Angle,
    [property: JsonPropertyName("hook_0_5s")] string? Hook05s,
    [property: JsonPropertyName("hook_5_20s")] string? Hook520s,
    [property: JsonPropertyName("why_it_converts")] string? WhyItConverts);

public sealed record HookAnalysisDto(
    [property: JsonPropertyName("original_hook")] string? OriginalHook,
    [property: JsonPropertyName("transcript_snippet")] string? TranscriptSnippet,
    [property: JsonPropertyName("psychology")] string? Psychology,
    [property: JsonPropertyName("flaws_identified")] string? FlawsIdentified,
    [property: JsonPropertyName("stolen_hooks")] IReadOnlyList<StolenHookDto>? StolenHooks,
    [property: JsonPropertyName("heatmap")] IReadOnlyList<HeatmapPointDto>? Heatmap);

public sealed record AnalyzeHookResponse(
    [property: JsonPropertyName("status")] string Status,
    [property: JsonPropertyName("data")] HookAnalysisDto Data);

public sealed record DraftScriptResponse(
    [property: JsonPropertyName("status")] string Status,
    [property: JsonPropertyName("markdown")] string Markdown);

public sealed record MoreVideoItemResponse(
    [property: JsonPropertyName("video_id")] string VideoId,
    [property: JsonPropertyName("title")] string Title,
    [property: JsonPropertyName("channel")] string Channel,
    [property: JsonPropertyName("views")] long Views,
    [property: JsonPropertyName("subs")] long Subs,
    [property: JsonPropertyName("ratio")] double Ratio,
    [property: JsonPropertyName("vph")] double Vph,
    [property: JsonPropertyName("url")] string Url,
    [property: JsonPropertyName("thumbnail_url")] string ThumbnailUrl,
    [property: JsonPropertyName("published_at")] string PublishedAt,
    [property: JsonPropertyName("duration_sec")] double DurationSec,
    [property: JsonPropertyName("is_short")] bool IsShort,
    [property: JsonPropertyName("transcript_status")] string TranscriptStatus,
    [property: JsonPropertyName("transcript_sample")] string TranscriptSample,
    [property: JsonPropertyName("m_score")] double MScore,
    [property: JsonPropertyName("is_rocket")] bool IsRocket,
    [property: JsonPropertyName("acceleration_pct")] string AccelerationPct);

public sealed record MoreVideosResponse(
    [property: JsonPropertyName("status")] string Status,
    [property: JsonPropertyName("results")] IReadOnlyList<MoreVideoItemResponse> Results);

public sealed record DownloadMetaDataResponse(
    [property: JsonPropertyName("title")] string Title,
    [property: JsonPropertyName("channel")] string Channel,
    [property: JsonPropertyName("transcript_full")] string TranscriptFull);

public sealed record DownloadMetaResponse(
    [property: JsonPropertyName("status")] string Status,
    [property: JsonPropertyName("data")] DownloadMetaDataResponse Data);

public sealed record VideoHeatmapResponse(
    [property: JsonPropertyName("heatmap")] IReadOnlyList<HeatmapPointDto> Heatmap);

public sealed record VideoChaptersResponse(
    [property: JsonPropertyName("chapters")] IReadOnlyList<VideoChapterDto> Chapters);

public sealed record VideoCommentsResponse(
    [property: JsonPropertyName("comments")] IReadOnlyList<DetailedCommentDto> Comments);
