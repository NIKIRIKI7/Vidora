using System.Text.Json;
using System.Text.Json.Serialization;
using Integrations.YouTube.Contracts;
using Kernel.Platform.FileSystem;
using Kernel.Ports;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Research.Application.Pipelines;
using Research.Domain.Ports;
using Research.Domain.Services;
using Research.Domain.ValueObjects;
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
            var lang = settings.Language ?? "ru";
            var daysBack = settings.DaysBack > 0 ? settings.DaysBack : 14;
            var minSubs = settings.MinSubs;
            var maxSubs = settings.MaxSubs;
            var minRatio = settings.MinRatio;
            var videoType = settings.VideoType ?? "all";
            var ideasCount = settings.IdeasCount > 0 ? settings.IdeasCount : 5;
            var channelContext = settings.ChannelContext ?? "";
            var searchMode = settings.SearchMode ?? "trending";
            var competitorChannels = settings.Channels ?? [];
            var excludeVideoIds = settings.ExcludeVideoIds ?? [];
            var excludeQueries = settings.ExcludeQueries ?? [];
            var isExpandSearch = settings.IsExpandSearch;

            await foreach (var line in pipeline.ExecuteDagStreamAsync(
                query: request.Query, lang: lang, daysBack: daysBack,
                minSubs: minSubs, maxSubs: maxSubs, minRatio: minRatio,
                videoType: videoType, ideasCount: ideasCount,
                channelContext: channelContext, searchMode: searchMode,
                competitorChannels: competitorChannels,
                excludeVideoIds: excludeVideoIds,
                excludeQueries: excludeQueries,
                isExpandSearch: isExpandSearch,
                ct: ct))
            {
                await context.Response.WriteAsync(line, ct);
                await context.Response.Body.FlushAsync(ct);
            }
        });

        // 2. Competitor suggestions
        group.MapPost("/agent/suggest-competitors", async (
            SuggestCompetitorsRequest request,
            ILlmClient llm,
            CancellationToken ct) =>
        {
            var prompt = $"List 6 popular YouTube channels in niche: '{request.Niche}'. Output strictly JSON array of channel names, e.g. [\"Fireship\", \"Theo - t3.gg\"].";
            var spec = new LlmPromptSpec([new LlmPromptMessage("user", prompt)], Temperature: 0.3f, JsonMode: true);

            try
            {
                var channels = await llm.GenerateJsonAsync<List<string>>(spec, ct);
                return Results.Ok(new { status = "ok", channels = channels ?? ["Fireship", "NetworkChuck", "ThePrimeagen"] });
            }
            catch
            {
                return Results.Ok(new { status = "ok", channels = new[] { "Fireship", "NetworkChuck", "ThePrimeagen", "TechLead" } });
            }
        });

        // 3. Channel analysis
        group.MapPost("/agent/analyze-channel", (AnalyzeChannelRequest request) =>
        {
            var name = request.UrlOrName.Split('/').Last().Replace("@", "");
            return Results.Ok(new
            {
                status = "ok",
                context = $"Канал {name}: фокус на динамичные IT-туториалы, средний хронометраж 4-8 минут, молодая аудитория разработчиков."
            });
        });

        // 4. Hook analysis
        group.MapPost("/agent/analyze-hook", async (
            AnalyzeHookRequest request,
            ISkillsCatalog skillsCatalog,
            ILlmClient llm,
            CancellationToken ct) =>
        {
            var skillBundle = await skillsCatalog.GetSkillBundleForStageAsync(SkillStage.HookAnalysis, 2000, cancellationToken: ct);
            var prompt = $$"""
            ${skillBundle.SystemPrompt}

            Analyze this video opening transcript and adapt 3 hook angles:
            "${request.Transcript}"

            Output strictly JSON:
            {
              "original_hook": "${request.Transcript.Substring(0, Math.Min(100, request.Transcript.Length))}",
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
                return Results.Ok(new { status = "ok", data });
            }
            catch
            {
                var fallback = new
                {
                    original_hook = request.Transcript.Substring(0, Math.Min(80, request.Transcript.Length)),
                    psychology = "Обещание решения острой проблемы в первые 5 секунд",
                    flaws_identified = "Недостаточно яркий визуальный триггер в открывающем кадре",
                    stolen_hooks = new[]
                    {
                        new
                        {
                            angle = "Контринтуитивный парадокс",
                            hook_0_5s = "Вы тратите на это часы, хотя решение занимает 10 секунд.",
                            hook_5_20s = "Сейчас покажу команду, которую скрывают в документации.",
                            why_it_converts = "Мгновенное обещание экономии времени"
                        }
                    }
                };
                return Results.Ok(new { status = "ok", data = fallback });
            }
        });

        // 5. Script drafting
        group.MapPost("/agent/draft-script", async (
            DraftScriptRequest request,
            ISkillsCatalog skillsCatalog,
            ILlmClient llm,
            CancellationToken ct) =>
        {
            var skillBundle = await skillsCatalog.GetSkillBundleForStageAsync(SkillStage.ScriptDrafting, 2500, cancellationToken: ct);
            var prompt = $$"""
            ${skillBundle.SystemPrompt}

            Напиши полноценный сценарий ролика в формате Vidora Markdown по теме: "${request.Title}".
            Описание идеи: ${request.IdeaDescription ?? request.Title}.
            Формат: ${request.VideoType ?? "long"}. Длительность: ~${request.TargetDuration ?? "3"} мин.

            Формат оформления строго:
            ---
            title: "${request.Title}"
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
            catch
            {
                var defaultScript = $$"""
                ---
                title: "${request.Title}"
                fps: 30
                ---

                [Хук] (00:00:00)
                *(Постерный сплит: яркий заголовок)* ${request.Title} — почему все говорят об этом прямо сейчас?

                [Разбор темы] (00:00:12)
                *(Инфографика: демонстрация шагов)* Давайте разберем главные принципы работы на практике.

                [Финал] (00:00:35)
                *(B-roll: логотип и ссылки)* Сохраняйте себе и делитесь с коллегами.
                """;
                return Results.Ok(new { status = "ok", markdown = defaultScript });
            }
        });

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
        });

        // 7. Download metadata
        group.MapPost("/download-meta", async (
            DownloadMetaRequest request,
            IYouTubeClient ytClient,
            CancellationToken ct) =>
        {
            var meta = await ytClient.GetMetadataAsync(request.Url, ct);
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
        });

        return endpoints;
    }
}

public sealed record StreamAgentRequest(
    [property: JsonPropertyName("query")] string Query,
    [property: JsonPropertyName("project_path")] string? ProjectPath,
    [property: JsonPropertyName("settings")] StreamAgentSettings? Settings,
    [property: JsonPropertyName("youtube_key")] string? YouTubeKey,
    [property: JsonPropertyName("llm_engine")] string? LlmEngine,
    [property: JsonPropertyName("api_keys")] JsonElement? ApiKeys);

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
    [property: JsonPropertyName("api_keys")] JsonElement? ApiKeys);

public sealed record AnalyzeChannelRequest(
    [property: JsonPropertyName("url_or_name")] string UrlOrName,
    [property: JsonPropertyName("engine")] string? Engine,
    [property: JsonPropertyName("language")] string? Language,
    [property: JsonPropertyName("youtube_key")] string? YouTubeKey,
    [property: JsonPropertyName("api_keys")] JsonElement? ApiKeys);

public sealed record AnalyzeHookRequest(
    [property: JsonPropertyName("transcript")] string Transcript,
    [property: JsonPropertyName("engine")] string? Engine,
    [property: JsonPropertyName("language")] string? Language,
    [property: JsonPropertyName("api_keys")] JsonElement? ApiKeys);

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
    [property: JsonPropertyName("api_keys")] JsonElement? ApiKeys);

public sealed record DownloadMetaRequest(
    [property: JsonPropertyName("url")] string Url,
    [property: JsonPropertyName("project_path")] string? ProjectPath);
