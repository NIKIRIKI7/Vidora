using System.Collections.Concurrent;
using System.Runtime.CompilerServices;
using System.Text.Json;
using System.Text.RegularExpressions;
using System.Threading.Channels;
using Kernel.Contracts;
using Kernel.Ports;
using Microsoft.Extensions.Logging;
using Research.Domain.Entities;
using Research.Domain.Ports;
using Research.Domain.Services;
using Research.Domain.ValueObjects;
using Skills.Contracts;
using Skills.Domain;

namespace Research.Application.Pipelines;

public sealed class YouTubeDeepTrendStreamingPipeline
{
    private readonly ISignalIngestor _signalIngestor;
    private readonly IYouTubeSearchIngestor _ytIngestor;
    private readonly MomentumEngine _momentumEngine;
    private readonly BlueOceanDetector _blueOceanDetector;
    private readonly ConfusionDetector _confusionDetector;
    private readonly CommentGoldmineExtractor _goldmineExtractor;
    private readonly TrendArbitrageEngine _arbitrageEngine;
    private readonly ISkillsCatalog _skillsCatalog;
    private readonly ILlmClient _llmClient;
    private readonly ILogger<YouTubeDeepTrendStreamingPipeline> _logger;

    public YouTubeDeepTrendStreamingPipeline(
        ISignalIngestor signalIngestor,
        IYouTubeSearchIngestor ytIngestor,
        MomentumEngine momentumEngine,
        BlueOceanDetector blueOceanDetector,
        ConfusionDetector confusionDetector,
        CommentGoldmineExtractor goldmineExtractor,
        TrendArbitrageEngine arbitrageEngine,
        ISkillsCatalog skillsCatalog,
        ILlmClient llmClient,
        ILogger<YouTubeDeepTrendStreamingPipeline> logger)
    {
        _signalIngestor = signalIngestor;
        _ytIngestor = ytIngestor;
        _momentumEngine = momentumEngine;
        _blueOceanDetector = blueOceanDetector;
        _confusionDetector = confusionDetector;
        _goldmineExtractor = goldmineExtractor;
        _arbitrageEngine = arbitrageEngine;
        _skillsCatalog = skillsCatalog;
        _llmClient = llmClient;
        _logger = logger;
    }

    public async IAsyncEnumerable<string> ExecuteDagStreamAsync(
        DeepTrendExecutionOptions options,
        [EnumeratorCancellation] CancellationToken ct = default)
    {
        var channel = Channel.CreateBounded<string>(new BoundedChannelOptions(400)
        {
            SingleWriter = false, SingleReader = true
        });

        async Task EmitAsync(string json)
        {
            await channel.Writer.WriteAsync(json + "\n", ct);
        }

        _ = Task.Run(async () =>
        {
            try
            {
                var nicheContext = await _signalIngestor.ResolveNicheContextAsync(options.Query, options.Language, ct);
                var effectiveQuery = nicheContext.EffectiveQuery;

                var formatTitle = options.VideoType == "short" ? "Shorts (<=60s)" : options.VideoType == "long" ? "Длинные (>60s)" : "Все";
                await EmitLog(EmitAsync, $"[DeepTrend] Поиск: '{effectiveQuery}' | за {options.DaysBack} дн. | Сабы: {options.MinSubs:N0} - {options.MaxSubs:N0} | Ratio >{options.MinRatio:F1}x | {formatTitle} | Язык: {options.Language.ToUpper()}");

                // 1. Google Trends первичный сбор
                IReadOnlyList<EarlySignal> earlySignals = [];
                if (!options.IsExpandSearch)
                {
                    await EmitLog(EmitAsync, "Сбор живых трендов (Google Trends / YouTube Autocomplete / Habr / Reddit)...");
                    try
                    {
                        earlySignals = await _signalIngestor.CollectEarlySignalsAsync(options.Query, options.Language, ct);
                        if (earlySignals.Count > 0)
                        {
                            var signalsDto = earlySignals.Select(s => new
                            {
                                id = s.Id, title = s.Topic, query = s.Topic,
                                vps_score = (int)s.GrowthVelocityPercent,
                                demand_score = s.GrowthVelocityPercent,
                                social_velocity = s.AggregateVph,
                                cross_platform_count = 3,
                                source_url = s.SourceUrl,
                                source_platform = s.SourcePlatform,
                                growth_pct = s.GrowthPct,
                                breakout = s.GrowthVelocityPercent > 85,
                                metrics = new
                                {
                                    upvotes = s.SupportingVideoCount * 25,
                                    comments = (int)(s.AggregateVph / 10),
                                    bookmarks = (int)s.GrowthVelocityPercent
                                },
                                keywords = JsonSerializer.Deserialize<List<string>>(s.KeywordClusterJson) ?? new List<string>()
                            }).ToList();
                            await EmitAsync(JsonSerializer.Serialize(new { type = "early_signals_ready", signals = signalsDto }));
                        }
                    }
                    catch (Exception ex)
                    {
                        await EmitLog(EmitAsync, $"Сбор сигналов: {ex.Message}", "warning");
                    }
                }

                // 2. Формируем прямой широкий запрос + ИИ-подборку
                var curYear = DateTime.UtcNow.Year;
                var isRu = options.Language.StartsWith("ru", StringComparison.OrdinalIgnoreCase);
                var broadDirectQueries = new List<string>
                {
                    effectiveQuery,
                    $"{effectiveQuery} {curYear}",
                    isRu ? $"{effectiveQuery} обзор" : $"{effectiveQuery} review",
                    isRu ? $"{effectiveQuery} топ" : $"{effectiveQuery} best"
                };

                var topTrendsKeywords = earlySignals.Take(10).Select(s => s.Topic).ToList();
                var aiSearchQueries = await GenerateDiverseShortYouTubeQueriesWithAiAsync(
                    effectiveQuery, topTrendsKeywords, options.Language, options.DaysBack, options.ExcludeQueries, options.IsExpandSearch, ct);

                var searchQueries = broadDirectQueries
                    .Concat(aiSearchQueries)
                    .Distinct(StringComparer.OrdinalIgnoreCase)
                    .ToList();

                // Конкуренты: разрешаем в channelId и сканируем каналы напрямую (точный режим)
                bool isCompetitorMode = options.SearchMode?.Equals("competitors", StringComparison.OrdinalIgnoreCase) == true;
                var resolvedCompetitors = new List<ChannelRef>();

                if (options.CompetitorChannels != null && options.CompetitorChannels.Count > 0)
                {
                    var compInputs = options.CompetitorChannels
                        .Where(c => !string.IsNullOrWhiteSpace(c))
                        .Select(c => c.Trim())
                        .Distinct(StringComparer.OrdinalIgnoreCase)
                        .ToList();

                    foreach (var comp in compInputs)
                    {
                        if (ct.IsCancellationRequested) break;
                        try
                        {
                            var channelRef = await _ytIngestor.ResolveChannelAsync(comp, options.Language, ct);
                            if (channelRef != null) resolvedCompetitors.Add(channelRef);
                        }
                        catch (Exception ex) when (ex is not OperationCanceledException)
                        {
                            _logger.LogDebug(ex, "Competitor resolve failed: {Comp}", comp);
                        }
                    }

                    resolvedCompetitors = resolvedCompetitors
                        .DistinctBy(c => c.ChannelId, StringComparer.OrdinalIgnoreCase)
                        .ToList();

                    if (resolvedCompetitors.Count > 0)
                    {
                        await EmitLog(EmitAsync, $"🎯 Распознаны каналы-конкуренты: {string.Join(", ", resolvedCompetitors.Take(6).Select(c => c.ChannelTitle))}", "info");
                    }
                    else if (compInputs.Count > 0)
                    {
                        // Фолбэк: каналы не разрешились — используем имена как поисковые запросы
                        searchQueries.InsertRange(0, compInputs);
                        if (isCompetitorMode)
                            searchQueries = searchQueries.Take(compInputs.Count + 3).ToList();
                        await EmitLog(EmitAsync, $"🎯 Каналы не распознаны, использую имена в поиске: {string.Join(", ", compInputs.Take(3))}...", "warning");
                    }
                }

                await EmitLog(EmitAsync, $"Сформировано {searchQueries.Count} запросов (включая прямой '{effectiveQuery}'): {string.Join(" • ", searchQueries.Take(6))}...");
                await EmitAsync(JsonSerializer.Serialize(new { type = "queries_executed", queries = searchQueries }));

                var candidatePool = new List<RawVideoSearchResult>();
                var seenVideoIds = new HashSet<string>(options.ExcludeVideoIds, StringComparer.OrdinalIgnoreCase);

                var seedPriorities = new Dictionary<string, double>(StringComparer.OrdinalIgnoreCase);
                var processedSeeds = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

                void EnqueueSeed(string vId, double priority)
                {
                    if (processedSeeds.Contains(vId)) return;
                    if (!seedPriorities.TryGetValue(vId, out var current) || priority > current)
                    {
                        seedPriorities[vId] = priority;
                    }
                }

                List<string> DequeueTopSeeds(int count)
                {
                    var top = seedPriorities
                        .Where(kvp => !processedSeeds.Contains(kvp.Key))
                        .OrderByDescending(kvp => kvp.Value)
                        .Take(count)
                        .Select(kvp => kvp.Key)
                        .ToList();

                    foreach (var s in top) processedSeeds.Add(s);
                    return top;
                }

                // 3a. Прямое сканирование каналов конкурентов (точно по channelId)
                if (resolvedCompetitors.Count > 0)
                {
                    foreach (var comp in resolvedCompetitors)
                    {
                        if (ct.IsCancellationRequested) break;
                        try
                        {
                            var found = await _ytIngestor.GetChannelCandidatesAsync(comp, 25, options.DaysBack, options.Language, ct);
                            foreach (var v in found)
                            {
                                if (seenVideoIds.Add(v.VideoId))
                                {
                                    candidatePool.Add(v);
                                    var m = _momentumEngine.CalculateMomentum(v.ViewCount, v.PublishedAt, v.SubscriberCount);
                                    double p = (m.IsRocket ? 1000 : 0) + m.ViewsPerHour;
                                    EnqueueSeed(v.VideoId, p);
                                }
                            }
                        }
                        catch (Exception ex) when (ex is not OperationCanceledException)
                        {
                            _logger.LogDebug(ex, "Channel scan failed: {ChannelId}", comp.ChannelId);
                        }
                    }

                    await EmitLog(EmitAsync, $"🎯 Прямое сканирование каналов: собрано {candidatePool.Count} видео.", "info");
                }

                // 3b. Поисковые запросы. В режиме "Конкуренты" с успешным резолвом широкий поиск пропускаем.
                bool skipBroadSearch = isCompetitorMode && resolvedCompetitors.Count > 0 && candidatePool.Count > 0;
                if (skipBroadSearch)
                {
                    await EmitLog(EmitAsync, "🎯 Режим 'Конкуренты': широкий поиск пропущен, работаем только по каналам.", "info");
                }
                else
                {
                    foreach (var sq in searchQueries)
                    {
                        if (ct.IsCancellationRequested) break;
                        try
                        {
                            var found = await _ytIngestor.SearchTopicCandidatesAsync(sq, 25, options.DaysBack, options.Language, ct);
                            foreach (var v in found)
                            {
                                if (seenVideoIds.Add(v.VideoId))
                                {
                                    candidatePool.Add(v);
                                    var m = _momentumEngine.CalculateMomentum(v.ViewCount, v.PublishedAt, v.SubscriberCount);
                                    double p = (m.IsRocket ? 1000 : 0) + m.ViewsPerHour;
                                    EnqueueSeed(v.VideoId, p);
                                }
                            }
                            if (candidatePool.Count >= 250) break;
                        }
                        catch (Exception ex)
                        {
                            _logger.LogDebug(ex, "Search query failed: {Query}", sq);
                        }
                    }
                }

                var cutoffDate = options.DaysBack > 0 ? DateTimeOffset.UtcNow.AddDays(-options.DaysBack) : DateTimeOffset.MinValue;
                var discoveredVideos = new List<Dictionary<string, object>>();
                var channelSubsCache = new ConcurrentDictionary<string, long>(StringComparer.OrdinalIgnoreCase);
                int totalEvaluated = candidatePool.Count;

                // 4. Оценка кандидатов первичного поиска
                foreach (var c in candidatePool)
                {
                    var (passed, item) = await EvaluateAndTryAddVideoAsync(
                        c, cutoffDate, options.DaysBack, options.MinSubs, options.MaxSubs, options.MinRatio,
                        options.VideoType, options.Language, discoveredVideos, channelSubsCache, ct);

                    if (passed && item != null)
                    {
                        await EmitAsync(JsonSerializer.Serialize(new { type = "single_video_found", video = item }));
                    }
                }

                int round = 0;
                int targetOutliers = Math.Max(options.IdeasCount * 2, 12);
                bool hasTriggeredGoogleTrendsPivot = false;
                int consecutiveStagnantRounds = 0;

                // 5. Цикл рекомендаций с детекцией стагнации после 2 раундов
                while (discoveredVideos.Count < targetOutliers && totalEvaluated < 350 && !ct.IsCancellationRequested)
                {
                    round++;
                    int prevDiscoveredCount = discoveredVideos.Count;

                    // В expand-режиме: пропускаем широкие запросы, сразу берём свежие Google Trends
                    if (options.IsExpandSearch && round == 1)
                    {
                        await EmitLog(EmitAsync, "🔄 [Expand] Пропускаем широкие запросы, загружаем свежие Google Trends...", "info");
                        var freshTrends = await _signalIngestor.FetchGoogleTrendsKeywordsAsync(effectiveQuery, options.Language, ct);
                        var bestFoundTitles = discoveredVideos.Take(5).Select(v => (string)v["title"]).ToList();
                        var expandQueries = await GeneratePivotQueriesFromGoogleTrendsAsync(
                            effectiveQuery, freshTrends, bestFoundTitles, options.Language,
                            options.ExcludeQueries.Concat(searchQueries).Distinct(StringComparer.OrdinalIgnoreCase).ToList(), ct);

                        await EmitLog(EmitAsync, $"[Expand ИИ] Сформированы свежие запросы: {string.Join(" • ", expandQueries.Take(5))}...", "info");
                        await EmitAsync(JsonSerializer.Serialize(new { type = "queries_executed", queries = expandQueries }));

                        foreach (var pq in expandQueries.Take(10))
                        {
                            if (ct.IsCancellationRequested) break;
                            try
                            {
                                var foundNew = await _ytIngestor.SearchTopicCandidatesAsync(pq, 25, options.DaysBack, options.Language, ct);
                                foreach (var v in foundNew)
                                {
                                    totalEvaluated++;
                                    if (!seenVideoIds.Add(v.VideoId)) continue;
                                    candidatePool.Add(v);
                                    var m = _momentumEngine.CalculateMomentum(v.ViewCount, v.PublishedAt, v.SubscriberCount);
                                    EnqueueSeed(v.VideoId, (m.IsRocket ? 1500 : 0) + m.ViewsPerHour * 1.5);
                                }
                            }
                            catch (Exception ex)
                            {
                                _logger.LogDebug(ex, "Expand search failed: {Query}", pq);
                            }
                        }
                    }

                    // Пивот через Google Trends при низкой отдаче за 2 прохода
                    if (round >= 2 && discoveredVideos.Count < Math.Min(6, targetOutliers) && !hasTriggeredGoogleTrendsPivot)
                    {
                        hasTriggeredGoogleTrendsPivot = true;
                        await EmitLog(EmitAsync, $"⚡ [Адаптивный пивот] За 2 прохода найдено {discoveredVideos.Count} аномалий. Запрашиваем новые данные Google Trends...", "warning");

                        var freshTrends = await _signalIngestor.FetchGoogleTrendsKeywordsAsync(effectiveQuery, options.Language, ct);
                        var bestFoundTitles = discoveredVideos.Take(5).Select(v => (string)v["title"]).ToList();
                        var pivotQueries = await GeneratePivotQueriesFromGoogleTrendsAsync(
                            effectiveQuery, freshTrends, bestFoundTitles, options.Language, options.ExcludeQueries, ct);

                        await EmitLog(EmitAsync, $"[Google Trends ИИ] Сформированы новые векторы поиска: {string.Join(" • ", pivotQueries.Take(5))}...", "info");

                        foreach (var pq in pivotQueries.Take(8))
                        {
                            if (ct.IsCancellationRequested) break;
                            try
                            {
                                var foundNew = await _ytIngestor.SearchTopicCandidatesAsync(pq, 25, options.DaysBack, options.Language, ct);
                                foreach (var v in foundNew)
                                {
                                    totalEvaluated++;
                                    if (!seenVideoIds.Add(v.VideoId)) continue;
                                    var m = _momentumEngine.CalculateMomentum(v.ViewCount, v.PublishedAt, v.SubscriberCount);
                                    EnqueueSeed(v.VideoId, (m.IsRocket ? 1500 : 0) + m.ViewsPerHour * 1.5);

                                    var (pPassed, pItem) = await EvaluateAndTryAddVideoAsync(
                                        v, cutoffDate, options.DaysBack, options.MinSubs, options.MaxSubs, options.MinRatio,
                                        options.VideoType, options.Language, discoveredVideos, channelSubsCache, ct);

                                    if (pPassed && pItem != null)
                                    {
                                        await EmitAsync(JsonSerializer.Serialize(new { type = "single_video_found", video = pItem }));
                                    }
                                }
                            }
                            catch (Exception ex)
                            {
                                _logger.LogDebug(ex, "Pivot search failed: {Query}", pq);
                            }
                        }
                    }

                    var currentBatch = DequeueTopSeeds(5);
                    if (currentBatch.Count == 0) break;

                    await EmitLog(EmitAsync, $"[Рекомендации: Проход {round}] Анализ рекомендаций топ-роликов (проверено: {totalEvaluated}, отобрано: {discoveredVideos.Count})...");

                    var crawlTasks = currentBatch.Select(id => _ytIngestor.GetRelatedCandidatesAsync(id, 25, options.DaysBack, options.Language, ct)).ToList();
                    var batchResults = await Task.WhenAll(crawlTasks);
                    int newFoundInRound = 0;

                    foreach (var relatedList in batchResults)
                    {
                        foreach (var c in relatedList)
                        {
                            totalEvaluated++;
                            if (!seenVideoIds.Add(c.VideoId)) continue;

                            var m = _momentumEngine.CalculateMomentum(c.ViewCount, c.PublishedAt, c.SubscriberCount);
                            EnqueueSeed(c.VideoId, (m.IsRocket ? 1200 : 0) + m.ViewsPerHour);

                            var (rPassed, rItem) = await EvaluateAndTryAddVideoAsync(
                                c, cutoffDate, options.DaysBack, options.MinSubs, options.MaxSubs, options.MinRatio,
                                options.VideoType, options.Language, discoveredVideos, channelSubsCache, ct);

                            if (rPassed && rItem != null)
                            {
                                newFoundInRound++;
                                await EmitAsync(JsonSerializer.Serialize(new { type = "single_video_found", video = rItem }));
                            }
                        }
                    }

                    if (newFoundInRound > 0)
                    {
                        consecutiveStagnantRounds = 0;
                        await EmitLog(EmitAsync, $"Проход {round}: обнаружено +{newFoundInRound} новых видео в рекомендациях!");
                    }
                    else
                    {
                        consecutiveStagnantRounds++;
                        if (consecutiveStagnantRounds >= 2)
                        {
                            await EmitLog(EmitAsync, $"⚠️ [Стагнация] {consecutiveStagnantRounds} проходов без новых видео. Прекращаем цикл рекомендаций.", "warning");
                            break;
                        }
                    }
                }

                // 6. Формирование результатов
                if (discoveredVideos.Count > 0)
                {
                    discoveredVideos.Sort((a, b) => ((int)b["vph"]).CompareTo((int)a["vph"]));
                    await EmitAsync(JsonSerializer.Serialize(new { type = "videos_ready", results = discoveredVideos }));
                    await EmitLog(EmitAsync, $"Поиск завершен: проверено {totalEvaluated} роликов, отобрано +{discoveredVideos.Count} аномалий (Топ VPH: {discoveredVideos[0]["vph"]})", "success");

                    // 6.1 Анализ болей и споров из комментариев (Comment Goldmine)
                    await EmitLog(EmitAsync, "Анализ болей и когнитивных барьеров из комментариев...", "info");
                    var goldmineReports = new List<object>();
                    foreach (var v in discoveredVideos.Take(8))
                    {
                        var commStr = v.TryGetValue("comments_summary", out var cs) && cs is string s ? s : "";
                        var comments = commStr.Split('\n', StringSplitOptions.RemoveEmptyEntries)
                            .Select(c => c.TrimStart('-', ' ').Trim())
                            .Where(c => c.Length > 5)
                            .ToList();

                        if (comments.Count > 0)
                        {
                            var friction = _confusionDetector.AnalyzeCommentsFriction(comments, (long)v["views"], (double)v["ratio"]);
                            var pains = _goldmineExtractor.ExtractTopPainPoints(comments, 3);
                            goldmineReports.Add(new
                            {
                                video_id = v["video_id"],
                                video_title = v["title"],
                                channel = v["channel"],
                                views = v["views"],
                                vph = v["vph"],
                                confusion_status = friction.Status,
                                confusion_index = friction.ConfusionIndex,
                                actionable_fix = friction.ActionableFix,
                                questions_count = Math.Max(2, friction.QuestionsCount),
                                frustrations_count = Math.Max(1, friction.FrustrationsCount),
                                debates_count = Math.Max(1, friction.DebatesCount),
                                top_pains = pains.Select(p => new { topic = p.TopicSummary, count = p.MentionCount, importance = p.ImportanceScore }).ToList()
                            });
                        }
                    }
                    if (goldmineReports.Count > 0)
                    {
                        await EmitAsync(JsonSerializer.Serialize(new { type = "comment_goldmine_ready", reports = goldmineReports }));
                    }

                    // 6.2 Синтез Голубых Океанов (Blue Ocean Opportunities)
                    await EmitLog(EmitAsync, "Детекция Голубых Океанов и незанятых ниш...", "info");
                    var topOutliers = discoveredVideos.Take(5).ToList();
                    double avgVph = topOutliers.Count > 0 ? topOutliers.Average(x => (int)x["vph"]) : 2000.0;
                    var topicsPool = earlySignals.Select(s => s.Topic)
                        .Concat(searchQueries.Skip(3))
                        .Distinct(StringComparer.OrdinalIgnoreCase)
                        .Take(9)
                        .ToList();

                    var opportunities = new List<object>();
                    foreach (var topic in topicsPool)
                    {
                        var eval = _blueOceanDetector.EvaluateTopicCompetition(topic, discoveredVideos.Count, 1, avgVph);
                        double oppScore = Math.Round(Math.Clamp(eval.CompetitionIndex * 100 * 0.5 + (eval.IsBlueOcean ? 46 : 25), 45.0, 99.0), 1);
                        opportunities.Add(new
                        {
                            topic = topic,
                            opportunity_score = oppScore,
                            status = eval.IsBlueOcean ? "BLUE_OCEAN_UNCONTESTED" : "MODERATE_COMPETITION",
                            actionable_angle = eval.AnalysisSummary,
                            demand_source = "Google Trends & Early Signals",
                            competition_index = eval.CompetitionIndex,
                            target_audience = "Разработчики и тех. энтузиасты"
                        });
                    }
                    if (opportunities.Count > 0)
                    {
                        await EmitAsync(JsonSerializer.Serialize(new { type = "blue_ocean_ready", opportunities = opportunities }));
                    }

                    var ideasList = discoveredVideos.Take(options.IdeasCount).Select(v => new
                    {
                        title = v["title"],
                        titles = new[] { (string)v["title"], $"Правда о {v["title"]}", $"Как применять {v["title"]} без ошибок" },
                        description = $"Разбор вирусного кейса канала {v["channel"]}: почему ролик набрал {v["views"]} просмотров.",
                        psychological_hook = "Разрыв шаблона + решение проблемы в первые 5 секунд",
                        thumbnail_concept = "Крупный эмоциональный заголовок, фокус внимания по центру, высокий контраст"
                    }).ToList();

                    await EmitAsync(JsonSerializer.Serialize(new
                    {
                        type = "done",
                        analysis = new
                        {
                            ideas = ideasList,
                            blue_ocean_gaps = opportunities
                        }
                    }));
                }
                else
                {
                    await EmitLog(EmitAsync, "По заданным критериям видео не найдены. Попробуйте смягчить фильтр подписчиков или увеличить количество дней.", "warning");
                    await EmitAsync(JsonSerializer.Serialize(new { type = "done" }));
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "[DeepTrend Streaming] Pipeline failure");
                await EmitLog(EmitAsync, $"Ошибка: {ex.Message}", "error");
            }
            finally
            {
                channel.Writer.Complete();
            }
        }, ct);

        await foreach (var line in channel.Reader.ReadAllAsync(ct))
        {
            yield return line;
        }
    }

    private async Task<(bool Passed, Dictionary<string, object>? Item)> EvaluateAndTryAddVideoAsync(
        RawVideoSearchResult c,
        DateTimeOffset cutoffDate,
        int daysBack,
        long minSubs,
        long maxSubs,
        double minRatio,
        string videoType,
        string lang,
        List<Dictionary<string, object>> discoveredVideos,
        ConcurrentDictionary<string, long> channelSubsCache,
        CancellationToken ct)
    {
        // 1. Свежесть (окно расширено на 25%: "1 месяц назад" при daysBack=30 не отбрасываем)
        if (daysBack > 0)
        {
            var relaxedCutoff = cutoffDate.AddDays(-Math.Max(3, daysBack * 0.25));
            if (c.PublishedAt > DateTimeOffset.MinValue && c.PublishedAt < relaxedCutoff) return (false, null);
            if (c.PublishedAt == DateTimeOffset.MinValue && daysBack <= 7) return (false, null);
        }

        // 2. Формат видео
        bool isShort = c.DurationSeconds <= 60 && c.DurationSeconds > 0;
        if (videoType == "short" && !isShort) return (false, null);
        if (videoType == "long" && isShort) return (false, null);

        // 3. Подгрузка реального числа подписчиков (неудачи тоже кэшируем, чтобы не долбить YouTube и не ловить rate limit)
        long realSubs = c.SubscriberCount;
        if (realSubs <= 0 && !string.IsNullOrWhiteSpace(c.ChannelId))
        {
            if (channelSubsCache.TryGetValue(c.ChannelId, out var cachedSubs))
            {
                realSubs = cachedSubs;
            }
            else
            {
                try
                {
                    var subscriberCount = await _ytIngestor.GetChannelSubscribersAsync(c.ChannelId, ct);
                    realSubs = subscriberCount;
                    channelSubsCache[c.ChannelId] = subscriberCount;
                }
                catch
                {
                    channelSubsCache[c.ChannelId] = 0;
                }
            }
        }

        // 4. Оценка динамики ДО жёстких лимитов — нужна для обхода фильтров у безусловных хитов
        var momentum = _momentumEngine.CalculateMomentum(c.ViewCount, c.PublishedAt, realSubs > 0 ? realSubs : 1000);
        var ageHours = Math.Max(0.5, (DateTimeOffset.UtcNow - c.PublishedAt).TotalHours);

        // Байпас: если видео реально летит (VPH >= 40 или MScore >= 120), прощаем нехватку подписчиков/Ratio
        bool isAbsoluteViral = momentum.ViewsPerHour >= 40.0 || momentum.MScore >= 120;

        // 5. Фильтр подписчиков
        if (realSubs > 0)
        {
            if (minSubs > 0 && realSubs < minSubs && !isAbsoluteViral) return (false, null);
            if (maxSubs > 0 && realSubs > maxSubs && !isAbsoluteViral) return (false, null);
        }
        else if (c.ViewCount > maxSubs * 5 && maxSubs > 0 && !isAbsoluteViral)
        {
            return (false, null);
        }

        // 6. Фильтр Ratio (Просмотры / Подписчики)
        double ratio = realSubs > 0
            ? Math.Round((double)c.ViewCount / realSubs, 2)
            : 0.0;

        if (realSubs > 0 && ratio < minRatio && !isAbsoluteViral)
        {
            return (false, null);
        }

        // 7. Минимальный порог просмотров
        if (c.ViewCount < 300) return (false, null);
        if (momentum.ViewsPerHour < 5 && ageHours > 48 && c.ViewCount < 3000 && !isAbsoluteViral) return (false, null);

        // 8. Фильтр языка
        if (lang.StartsWith("en", StringComparison.OrdinalIgnoreCase) && Regex.IsMatch(c.Title, @"[\u0400-\u04FF]"))
            return (false, null);

        var thumbUrl = !string.IsNullOrWhiteSpace(c.ThumbnailUrl)
            ? c.ThumbnailUrl
            : $"https://i.ytimg.com/vi/{c.VideoId}/hqdefault.jpg";

        var item = new Dictionary<string, object>
        {
            ["video_id"] = c.VideoId,
            ["title"] = c.Title,
            ["channel"] = c.ChannelTitle,
            ["channel_id"] = c.ChannelId,
            ["views"] = c.ViewCount,
            ["subs"] = realSubs,
            ["ratio"] = ratio > 0 ? ratio : 1.5,
            ["vph"] = Math.Max(5, (int)Math.Round(momentum.ViewsPerHour)),
            ["url"] = $"https://www.youtube.com/watch?v={c.VideoId}",
            ["thumbnail_url"] = thumbUrl,
            ["published_at"] = c.PublishedAt > DateTimeOffset.MinValue ? c.PublishedAt.ToString("yyyy-MM-dd") : "Свежее",
            ["duration_sec"] = (int)Math.Round(c.DurationSeconds),
            ["is_short"] = isShort,
            ["m_score"] = momentum.MScore,
            ["velocity_stage"] = momentum.VelocityStage,
            ["acceleration_pct"] = momentum.AccelerationPct,
            ["is_rocket"] = momentum.IsRocket,
            ["engagement_multiplier"] = momentum.EngagementMultiplier,
            ["transcript_status"] = "official_subtitles",
            ["transcript_sample"] = c.Title,
            ["comments_summary"] = string.Join("\n", c.TopComments.Take(6).Select(cm => $"- {cm}"))
        };

        discoveredVideos.Add(item);
        return (true, item);
    }

    private async Task<List<string>> GenerateDiverseShortYouTubeQueriesWithAiAsync(
        string baseQuery, List<string> googleTrendsKeywords, string lang, int daysBack,
        IReadOnlyList<string>? excludeQueries, bool isExpandSearch, CancellationToken ct)
    {
        var curYear = DateTime.UtcNow.Year;
        var cleanTrends = googleTrendsKeywords
            .Select(CleanToShortQuery)
            .Where(k => k.Split(' ').Length is >= 1 and <= 4)
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .Take(8)
            .ToList();

        var trendsBlock = cleanTrends.Count > 0 ? string.Join(", ", cleanTrends) : "нет явных сигналов";
        var excludeBlock = (excludeQueries != null && excludeQueries.Count > 0)
            ? $"\nУЖЕ ИСПОЛЬЗОВАННЫЕ ЗАПРОСЫ (НЕ ПОВТОРЯЙ ИХ):\n- {string.Join("\n- ", excludeQueries.Take(35))}\n"
            : "";

        var prompt = $$"""
        Ты — ведущий аналитик YouTube и Google Trends в {{curYear}} году.
        Ниша: "{{baseQuery}}". Язык: {{lang}}.
        {{excludeBlock}}
        Google Trends подсказки: {{trendsBlock}}

        КЛЮЧЕВОЙ АЛГОРИТМ:
        1. ШИРОКИЙ ЗАПРОС (1-2 слова, напр. "AI", "Python", "Крипта"):
           - ЗАПРЕЩЕНО выдавать общие фразы ("ai 2026", "python tutorial").
           - Деконструируй нишу на: конкретные инструменты года, баги/ошибки, прикладные связки автоматизации, сравнения A vs B.
        2. УЗКИЙ ЗАПРОС (софт/баг/модель, напр. "Cursor vs Windsurf", "DeepSeek R1"):
           - ЗАПРЕЩЕНО расширять запрос до абстрактных слов. Удерживай 100% фокус на инструменте!
           - Ищи: сравнения с прямыми аналогами, ошибки и утечки, скрытые фичи, бенчмарки в проде.

        ТРЕБОВАНИЯ:
        - Ровно 12-16 фраз.
        - Длина КАЖДОЙ фразы СТРОГО от 2 до 4 слов!
        - Без знаков препинания и кавычек.

        ВЕРНИ СТРОГО JSON:
        {"queries": ["фраза 1", "фраза 2", "фраза 3", "фраза 4", "фраза 5", "фраза 6", "фраза 7", "фраза 8", "фраза 9", "фраза 10", "фраза 11", "фраза 12"]}
        """;

        try
        {
            var res = await _llmClient.GenerateJsonAsync<JsonElement>(
                new LlmPromptSpec([new LlmPromptMessage("user", prompt)], Temperature: isExpandSearch ? 0.75f : 0.45f, JsonMode: true), ct);

            if (res.TryGetProperty("queries", out var qArr) && qArr.ValueKind == JsonValueKind.Array)
            {
                var generated = qArr.EnumerateArray()
                    .Select(x => CleanToShortQuery(x.GetString() ?? ""))
                    .Where(x => !string.IsNullOrWhiteSpace(x) && x.Split(' ').Length is >= 2 and <= 5)
                    .ToList();

                if (generated.Count >= 6) return generated.Distinct(StringComparer.OrdinalIgnoreCase).ToList();
            }
        }
        catch (Exception ex)
        {
            _logger.LogDebug(ex, "AI query generation fallback");
        }

        return FallbackQueries(baseQuery, cleanTrends, curYear, isExpandSearch);
    }

    private async Task<List<string>> GeneratePivotQueriesFromGoogleTrendsAsync(
        string baseQuery,
        IReadOnlyList<string> googleTrends,
        IReadOnlyList<string> bestFoundTitles,
        string lang,
        IReadOnlyList<string>? excludeQueries,
        CancellationToken ct)
    {
        var curYear = DateTime.UtcNow.Year;
        var trendsSample = googleTrends.Count > 0 ? string.Join(", ", googleTrends.Take(15)) : "нет данных";
        var bestTitlesSample = bestFoundTitles.Count > 0 ? string.Join("\n- ", bestFoundTitles.Take(5)) : "пока нет явных лидеров";
        var excludeSample = (excludeQueries != null && excludeQueries.Count > 0) ? string.Join(", ", excludeQueries.Take(25)) : "нет";

        var prompt = $$"""
        Ты — senior growth-инженер YouTube в {{curYear}} году.
        Тема: "{{baseQuery}}" (язык: {{lang}}). Первые 2 круга дали мало результатов.
        СВЕЖИЕ ДАННЫЕ GOOGLE TRENDS: {{trendsSample}}
        ЛУЧШИЕ ВИДЕО: {{bestTitlesSample}}
        ИСКЛЮЧЕНИЯ: {{excludeSample}}

        ЗАДАЧА:
        На основе данных Google Trends сгенерируй 12–16 СВЕЖИХ запросов по 2–4 слова.
        - Для широких тем: найди узкие специфические термины и связки из Google Trends.
        - Для узких тем: найди болевые точки ("ошибка", "vs", "не работает", "в проде").

        ВЕРНИ СТРОГО JSON:
        {"queries": ["фраза 1", "фраза 2", "фраза 3", "фраза 4", "фраза 5", "фраза 6", "фраза 7", "фраза 8", "фраза 9", "фраза 10", "фраза 11", "фраза 12"]}
        """;

        try
        {
            var res = await _llmClient.GenerateJsonAsync<JsonElement>(
                new LlmPromptSpec([new LlmPromptMessage("user", prompt)], Temperature: 0.65f, JsonMode: true), ct);

            if (res.TryGetProperty("queries", out var qArr) && qArr.ValueKind == JsonValueKind.Array)
            {
                var list = qArr.EnumerateArray()
                    .Select(x => CleanToShortQuery(x.GetString() ?? ""))
                    .Where(x => !string.IsNullOrWhiteSpace(x) && x.Split(' ').Length is >= 2 and <= 5)
                    .Distinct(StringComparer.OrdinalIgnoreCase)
                    .ToList();

                if (list.Count >= 6) return list;
            }
        }
        catch (Exception ex)
        {
            _logger.LogDebug(ex, "Pivot AI queries fallback");
        }

        var fallback = googleTrends
            .Select(CleanToShortQuery)
            .Where(k => k.Split(' ').Length is >= 2 and <= 4)
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .Take(12)
            .ToList();

        if (fallback.Count == 0)
        {
            var words = baseQuery.Split(' ', StringSplitOptions.RemoveEmptyEntries);
            var w = words.Length > 0 ? words[0] : "tech";
            fallback.AddRange([$"{w} advanced", $"{w} hidden secrets", $"{w} vs", $"{w} real project", $"{w} errors {curYear}"]);
        }

        return fallback;
    }

    private static List<string> FallbackQueries(string baseQuery, List<string> cleanTrends, int curYear, bool isExpandSearch)
    {
        var words = baseQuery.Split(' ', StringSplitOptions.RemoveEmptyEntries);
        bool isNarrow = words.Length >= 2;
        var w1 = words.Length > 0 ? words[0] : "ai";
        var w2 = words.Length > 1 ? words[1] : "coding";

        var fallback = new List<string>();

        if (isNarrow)
        {
            var fullTerm = $"{w1} {w2}";
            if (isExpandSearch)
            {
                fallback.Add($"{fullTerm} roadmap {curYear}");
                fallback.Add($"{fullTerm} architecture deep dive");
                fallback.Add($"{fullTerm} benchmark production");
                fallback.Add($"{fullTerm} hidden features");
                fallback.Add($"{fullTerm} advanced patterns");
                fallback.Add($"{fullTerm} vs alternative");
            }
            else
            {
                fallback.Add($"{fullTerm} review");
                fallback.Add($"{fullTerm} vs");
                fallback.Add($"{fullTerm} mistakes");
                fallback.Add($"{fullTerm} tutorial");
                fallback.Add($"{fullTerm} in production");
                fallback.Add($"{fullTerm} {curYear}");
            }
        }
        else
        {
            if (cleanTrends.Count > 0) fallback.AddRange(cleanTrends);
            if (isExpandSearch)
            {
                fallback.Add($"{w1} roadmap {curYear}");
                fallback.Add($"{w1} architecture deep dive");
                fallback.Add($"{w1} benchmark production");
                fallback.Add($"{w1} hidden features");
                fallback.Add($"{w1} advanced patterns");
                fallback.Add($"{w1} vs alternative");
            }
            else
            {
                fallback.Add($"{w1} {w2}");
                fallback.Add($"{w1} tools {curYear}");
                fallback.Add($"{w1} review");
                fallback.Add($"{w1} tutorial");
            }
        }

        return fallback.Select(CleanToShortQuery).Distinct(StringComparer.OrdinalIgnoreCase).Take(16).ToList();
    }

    private static string CleanToShortQuery(string raw)
    {
        var clean = Regex.Replace(raw, @"[^\w\s\u0400-\u04FF]", " ");
        clean = Regex.Replace(clean, @"\s+", " ").Trim();
        var words = clean.Split(' ', StringSplitOptions.RemoveEmptyEntries);
        return string.Join(" ", words.Take(4));
    }

    private static async Task EmitLog(Func<string, Task> emit, string message, string status = "info")
    {
        await emit(JsonSerializer.Serialize(new { type = "log", message, status }));
    }
}

public sealed record DeepTrendExecutionOptions
{
    public required string Query { get; init; }
    public string Language { get; init; } = "ru";
    public int DaysBack { get; init; } = 30;
    public long MinSubs { get; init; } = 1000;
    public long MaxSubs { get; init; } = 90000;
    public double MinRatio { get; init; } = 1.5;
    public string SearchMode { get; init; } = "trending";
    public string SearchEngine { get; init; } = "auto";
    public string VideoType { get; init; } = "all";
    public int IdeasCount { get; init; } = 5;
    public string ChannelContext { get; init; } = "";
    public IReadOnlyList<string> CompetitorChannels { get; init; } = [];
    public IReadOnlyList<string> ExcludeVideoIds { get; init; } = [];
    public IReadOnlyList<string> ExcludeQueries { get; init; } = [];
    public bool IsExpandSearch { get; init; } = false;
    public string? YouTubeApiKey { get; init; }
    public string? LlmEngine { get; init; }
    public ApiKeysDto? ApiKeys { get; init; }
}
