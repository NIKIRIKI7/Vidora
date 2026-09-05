using System.Collections.Concurrent;
using System.Runtime.CompilerServices;
using System.Text.Json;
using System.Text.RegularExpressions;
using System.Threading.Channels;
using Integrations.YouTube.Contracts;
using Integrations.YouTube.Innertube;
using Kernel.Ports;
using Microsoft.Extensions.Logging;
using Research.Domain.Entities;
using Research.Domain.Ports;
using Research.Domain.Services;
using Research.Domain.ValueObjects;
using Research.Infrastructure.Ingestors;
using Skills.Contracts;
using Skills.Domain;

namespace Research.Application.Pipelines;

public sealed class YouTubeDeepTrendStreamingPipeline
{
    private readonly ISignalIngestor _signalIngestor;
    private readonly IYouTubeSearchIngestor _ytIngestor;
    private readonly IYouTubeClient _ytClient;
    private readonly IInnerTubeClient? _innerTubeClient;
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
        IYouTubeClient ytClient,
        MomentumEngine momentumEngine,
        BlueOceanDetector blueOceanDetector,
        ConfusionDetector confusionDetector,
        CommentGoldmineExtractor goldmineExtractor,
        TrendArbitrageEngine arbitrageEngine,
        ISkillsCatalog skillsCatalog,
        ILlmClient llmClient,
        ILogger<YouTubeDeepTrendStreamingPipeline> logger,
        IInnerTubeClient? innerTubeClient = null)
    {
        _signalIngestor = signalIngestor;
        _ytIngestor = ytIngestor;
        _ytClient = ytClient;
        _innerTubeClient = innerTubeClient;
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
        string query, string lang = "ru", int daysBack = 14,
        long minSubs = 1000, long maxSubs = 90000, double minRatio = 1.5,
        string videoType = "all", int ideasCount = 5,
        string channelContext = "", string searchMode = "trending",
        IReadOnlyList<string>? competitorChannels = null,
        IReadOnlyList<string>? excludeVideoIds = null,
        IReadOnlyList<string>? excludeQueries = null,
        bool isExpandSearch = false,
        [EnumeratorCancellation] CancellationToken ct = default)
    {
        var channel = Channel.CreateBounded<string>(new BoundedChannelOptions(350)
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
                var effectiveQuery = Regex.Replace(query, @"[,;]+", " ").Trim();
                effectiveQuery = Regex.Replace(effectiveQuery, @"\s+", " ");
                if (lang.StartsWith("en", StringComparison.OrdinalIgnoreCase) && Regex.IsMatch(query, @"[\u0400-\u04FF]"))
                {
                    effectiveQuery = SignalIngestor.ToEnglishTechQuery(query);
                }

                var startLog = isExpandSearch
                    ? $"[DeepTrend] ⚡ Расширенный поиск: генерация НОВЫХ запросов на базе трендов (исключено {excludeVideoIds?.Count ?? 0} видео)..."
                    : $"Запуск DeepTrend конвейера [{lang.ToUpper()}] | Фильтр: {daysBack} дн., сабы {minSubs}-{maxSubs}, ratio >{minRatio}x | Тема: '{effectiveQuery}'";
                await EmitLog(EmitAsync, startLog);

                // 1. Google Trends первичный сбор
                IReadOnlyList<EarlySignal> earlySignals = [];
                if (!isExpandSearch)
                {
                    await EmitLog(EmitAsync, "Сбор живых трендов (Google Trends / YouTube Autocomplete / Habr / Reddit)...");
                    try
                    {
                        earlySignals = await _signalIngestor.CollectEarlySignalsAsync(query, lang, ct);
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

                // 2. Формируем поисковые запросы: ПРЯМОЙ ШИРОКИЙ ЗАПРОС + ПОДБОРКИ ИИ
                await EmitLog(EmitAsync, isExpandSearch
                    ? "ИИ формирует альтернативные, неиспользованные поисковые фразы под YouTube..."
                    : "Подготовка поисковой матрицы: прямой широкий запрос + вариации ИИ на базе трендов...");

                var topTrendsKeywords = earlySignals.Take(10).Select(s => s.Topic).ToList();
                var aiSearchQueries = await GenerateDiverseShortYouTubeQueriesWithAiAsync(
                    effectiveQuery, topTrendsKeywords, lang, daysBack, excludeQueries, isExpandSearch, ct);

                // === ГАРАНТИРОВАННЫЙ ПРЯМОЙ ПОИСК ПО ШИРОКОМУ ЗАПРОСУ ===
                var curYear = DateTime.UtcNow.Year;
                var isRu = lang.StartsWith("ru", StringComparison.OrdinalIgnoreCase);
                var broadDirectQueries = new List<string>
                {
                    effectiveQuery,                             // Прямой широкий запрос
                    $"{effectiveQuery} {curYear}",              // Свежие за текущий год
                    isRu ? $"{effectiveQuery} обзор" : $"{effectiveQuery} review",
                    isRu ? $"{effectiveQuery} топ" : $"{effectiveQuery} best"
                };

                // Объединяем: сначала прямой широкий запрос, затем деконструированные фразы ИИ
                var searchQueries = broadDirectQueries
                    .Concat(aiSearchQueries)
                    .Distinct(StringComparer.OrdinalIgnoreCase)
                    .ToList();

                await EmitLog(EmitAsync, $"Сформировано {searchQueries.Count} запросов (включая прямой '{effectiveQuery}'): {string.Join(" • ", searchQueries.Take(6))}...");

                var candidatePool = new List<RawVideoSearchResult>();
                var seenVideoIds = new HashSet<string>(excludeVideoIds ?? [], StringComparer.OrdinalIgnoreCase);

                // Smart Seed Priority: приоритетная очередь семян по VPH
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

                // 3. Выполняем поиск по начальным запросам
                foreach (var sq in searchQueries)
                {
                    if (ct.IsCancellationRequested) break;
                    try
                    {
                        var found = await _ytIngestor.SearchTopicCandidatesAsync(sq, 25, daysBack, lang, ct);
                        foreach (var v in found)
                        {
                            if (seenVideoIds.Add(v.VideoId))
                            {
                                candidatePool.Add(v);
                                var m = _momentumEngine.CalculateMomentum(v.ViewCount, v.PublishedAt, v.SubscriberCount);
                                double priority = (m.IsRocket ? 1000 : 0) + m.ViewsPerHour;
                                EnqueueSeed(v.VideoId, priority);
                            }
                        }
                        if (candidatePool.Count >= 80) break;
                    }
                    catch (Exception ex)
                    {
                        _logger.LogDebug(ex, "Search query failed: {Query}", sq);
                    }
                }

                var cutoffDate = daysBack > 0 ? DateTimeOffset.UtcNow.AddDays(-daysBack) : DateTimeOffset.MinValue;
                var discoveredVideos = new List<Dictionary<string, object>>();
                var channelSubsCache = new ConcurrentDictionary<string, long>(StringComparer.OrdinalIgnoreCase);
                int totalEvaluated = candidatePool.Count;

                // Оцениваем начальный пул
                foreach (var c in candidatePool)
                {
                    var (passed, item) = await EvaluateAndTryAddVideoAsync(c, cutoffDate, daysBack, minSubs, maxSubs, minRatio, videoType, lang, discoveredVideos, channelSubsCache, ct);
                    if (passed && item != null)
                    {
                        await EmitAsync(JsonSerializer.Serialize(new { type = "single_video_found", video = item }));
                    }
                }

                int round = 0;
                int targetOutliers = Math.Max(ideasCount * 2, 12);
                bool hasTriggeredGoogleTrendsPivot = false;

                // 4. Цикл рекомендаций с приоритетом и детекцией стагнации
                while (discoveredVideos.Count < targetOutliers && totalEvaluated < 350 && !ct.IsCancellationRequested)
                {
                    round++;

                    // === ПРОВЕРКА: ЕСЛИ ЗА 2 ПРОХОДА НАЙДЕНО МАЛО ВИДЕО -> ПИВОТ ЧЕРЕЗ GOOGLE TRENDS ===
                    if (round >= 2 && discoveredVideos.Count < Math.Min(6, targetOutliers) && !hasTriggeredGoogleTrendsPivot)
                    {
                        hasTriggeredGoogleTrendsPivot = true;
                        await EmitLog(EmitAsync, $"⚡ [Адаптивный пивот] За 2 прохода найдено лишь {discoveredVideos.Count} аномалий. Запрашиваем новые тренды из Google Trends...", "warning");

                        // 1. Собираем живые подсказки из Google Trends
                        var freshTrends = await _signalIngestor.FetchGoogleTrendsKeywordsAsync(effectiveQuery, lang, ct);

                        // 2. Генерируем совершенно новые ключевые слова на базе трендов через LLM
                        var bestFoundTitles = discoveredVideos.Take(5).Select(v => (string)v["title"]).ToList();
                        var pivotQueries = await GeneratePivotQueriesFromGoogleTrendsAsync(
                            effectiveQuery, freshTrends, bestFoundTitles, lang, excludeQueries, ct);

                        await EmitLog(EmitAsync, $"[Google Trends ИИ] Сформированы новые векторы поиска: {string.Join(" • ", pivotQueries.Take(5))}...", "info");

                        // 3. Выполняем поиск по этим свежим запросам
                        foreach (var pq in pivotQueries.Take(8))
                        {
                            if (ct.IsCancellationRequested) break;
                            try
                            {
                                var foundNew = await _ytIngestor.SearchTopicCandidatesAsync(pq, 25, daysBack, lang, ct);
                                foreach (var v in foundNew)
                                {
                                    totalEvaluated++;
                                    if (!seenVideoIds.Add(v.VideoId)) continue;
                                    var m = _momentumEngine.CalculateMomentum(v.ViewCount, v.PublishedAt, v.SubscriberCount);

                                    // Приоритетные семена в голову очереди рекомендаций
                                    double p = (m.IsRocket ? 1500 : 0) + m.ViewsPerHour * 1.5;
                                    EnqueueSeed(v.VideoId, p);

                                    var (passed, item) = await EvaluateAndTryAddVideoAsync(v, cutoffDate, daysBack, minSubs, maxSubs, minRatio, videoType, lang, discoveredVideos, channelSubsCache, ct);
                                    if (passed && item != null)
                                    {
                                        await EmitAsync(JsonSerializer.Serialize(new { type = "single_video_found", video = item }));
                                    }
                                }
                            }
                            catch (Exception ex)
                            {
                                _logger.LogDebug(ex, "Pivot search failed: {Query}", pq);
                            }
                        }

                        await EmitLog(EmitAsync, $"[Пивот завершен] База кандидатов расширена, переходим к топовым рекомендациям новых лидеров.", "success");
                    }

                    // Выбираем 5 лучших семян с самым высоким VPH
                    var currentBatch = DequeueTopSeeds(5);
                    if (currentBatch.Count == 0) break;

                    await EmitLog(EmitAsync, $"[Рекомендации: Проход {round}] Анализ рекомендаций топ-роликов (проверено: {totalEvaluated}, отобрано: {discoveredVideos.Count})...");

                    var crawlTasks = currentBatch.Select(id => _ytIngestor.GetRelatedCandidatesAsync(id, 25, daysBack, lang, ct)).ToList();
                    var batchResults = await Task.WhenAll(crawlTasks);
                    int newFoundInRound = 0;

                    foreach (var relatedList in batchResults)
                    {
                        foreach (var c in relatedList)
                        {
                            totalEvaluated++;
                            if (!seenVideoIds.Add(c.VideoId)) continue;

                            var m = _momentumEngine.CalculateMomentum(c.ViewCount, c.PublishedAt, c.SubscriberCount);
                            double p = (m.IsRocket ? 1200 : 0) + m.ViewsPerHour;
                            EnqueueSeed(c.VideoId, p);

                            var (passed, item) = await EvaluateAndTryAddVideoAsync(c, cutoffDate, daysBack, minSubs, maxSubs, minRatio, videoType, lang, discoveredVideos, channelSubsCache, ct);
                            if (passed && item != null)
                            {
                                newFoundInRound++;
                                await EmitAsync(JsonSerializer.Serialize(new { type = "single_video_found", video = item }));
                            }
                        }
                    }

                    if (newFoundInRound > 0)
                    {
                        await EmitLog(EmitAsync, $"Проход {round}: обнаружено +{newFoundInRound} новых растущих видео в рекомендациях!");
                    }
                }

                // 5. Отдаем результат
                if (discoveredVideos.Count > 0)
                {
                    discoveredVideos.Sort((a, b) => ((int)b["vph"]).CompareTo((int)a["vph"]));
                    await EmitAsync(JsonSerializer.Serialize(new { type = "videos_ready", results = discoveredVideos }));
                    await EmitLog(EmitAsync, $"Поиск завершен: проверено {totalEvaluated} роликов, отобрано +{discoveredVideos.Count} аномалий (Топ VPH: {discoveredVideos[0]["vph"]})", "success");
                }
                else
                {
                    await EmitLog(EmitAsync, "По заданным критериям новых видео не найдено. Попробуйте увеличить интервал дней или смягчить фильтр подписчиков.", "warning");
                }

                await EmitAsync(JsonSerializer.Serialize(new { type = "done" }));
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "[DeepTrend Streaming] Search failure");
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

    /// <summary>
    /// Строгая оценка и фильтрация ролика по критериям пользователя (подписчики, ratio, дни, тип видео)
    /// </summary>
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
        // 1. Фильтр свежести (days_back)
        if (daysBack > 0)
        {
            if (c.PublishedAt > DateTimeOffset.MinValue && c.PublishedAt < cutoffDate) return (false, null);
            if (c.PublishedAt == DateTimeOffset.MinValue && daysBack <= 7) return (false, null);
        }

        // 2. Фильтр формата видео (Shorts vs Long)
        bool isShort = c.DurationSeconds <= 60 && c.DurationSeconds > 0;
        if (videoType == "short" && !isShort) return (false, null);
        if (videoType == "long" && isShort) return (false, null);

        // 3. Подгрузка РЕАЛЬНЫХ подписчиков канала
        long realSubs = c.SubscriberCount;
        if (realSubs <= 0 && !string.IsNullOrWhiteSpace(c.ChannelId) && _innerTubeClient != null)
        {
            if (channelSubsCache.TryGetValue(c.ChannelId, out var cachedSubs))
            {
                realSubs = cachedSubs;
            }
            else
            {
                try
                {
                    realSubs = await _innerTubeClient.GetChannelSubscribersAsync(c.ChannelId, ct);
                    if (realSubs > 0) channelSubsCache[c.ChannelId] = realSubs;
                }
                catch { }
            }
        }

        // 4. ЖЕСТКИЙ ФИЛЬТР ПОДПИСЧИКОВ (НИКАКИХ ОБХОДОВ ПО VIEWCOUNT!)
        if (realSubs > 0)
        {
            if (minSubs > 0 && realSubs < minSubs) return (false, null);
            if (maxSubs > 0 && realSubs > maxSubs) return (false, null);
        }
        else if (c.ViewCount > maxSubs * 5 && maxSubs > 0)
        {
            // Если сабы неизвестны, но просмотров уже > 450k на узкой теме — это почти наверняка канал-гигант
            return (false, null);
        }

        // 5. ЖЕСТКИЙ ФИЛЬТР RATIO (Просмотры / Подписчики >= minRatio)
        double ratio = realSubs > 0
            ? Math.Round((double)c.ViewCount / realSubs, 2)
            : 0.0;

        if (realSubs > 0 && ratio < minRatio) return (false, null);

        // 6. Минимальный порог просмотров
        if (c.ViewCount < 300) return (false, null);

        var momentum = _momentumEngine.CalculateMomentum(c.ViewCount, c.PublishedAt, realSubs);
        var ageHours = Math.Max(0.5, (DateTimeOffset.UtcNow - c.PublishedAt).TotalHours);
        if (momentum.ViewsPerHour < 5 && ageHours > 48 && c.ViewCount < 3000) return (false, null);

        // 7. Фильтр языка
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

    /// <summary>
    /// Генерация адаптивных пивот-запросов на основе живых данных Google Trends, если за 2 круга мало находок
    /// </summary>
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
        Ты — senior growth-инженер YouTube.
        Мы проводим глубокий анализ темы "{{baseQuery}}" (язык: {{lang}}).
        Первые 2 круга стандартного поиска не принесли достаточного количества скрытых аномалий (выдача либо перенасыщена старьем, либо пуста).

        ЖИВЫЕ ДАННЫЕ GOOGLE TRENDS И YOUTUBE AUTOCOMPLETE (то, что люди вводят прямо сейчас):
        {{trendsSample}}

        РОЛИКИ, КОТОРЫЕ УЖЕ ПОКАЗАЛИ ХОРОШИЙ СТАРТОВЫЙ VPH:
        - {{bestTitlesSample}}

        СПИСОК ИСЧЕРПАННЫХ ЗАПРОСОВ (НЕ ПОВТОРЯЙ ИХ):
        {{excludeSample}}

        ================================================================================
        СТРАТЕГИЯ АДАПТИВНОГО ПИВОТА (GOOGLE TRENDS PIVOT)
        ================================================================================

        Определи глубину запроса "{{baseQuery}}":
        1. ЕСЛИ ТЕМА ШИРОКАЯ ("AI", "Python", "Crypto"):
           - Стандартные запросы исчерпаны. Обопрись на Google Trends!
           - Возьми самые узкие, специфические термины и связки из списка трендов выше.
           - Сфокусируйся на: "почему не работает X", "альтернатива X", "настройка в проде", "сравнение A и B".

        2. ЕСЛИ ТЕМА УЗКАЯ ("Cursor IDE", "DeepSeek R1", "Supabase auth"):
           - Не уходи в общие фразы ни на миллиметр!
           - Найди в Google Trends болевые точки именно этой технологии: ошибки версий, несовместимости, падения скорости, трюки с промптами, связки с другим софтом.

        ТРЕБОВАНИЯ:
        - 12–16 точных поисковых фраз.
        - Длина строго от 2 до 4 слов на фразу.
        - Без знаков препинания, кавычек и эмодзи.
        - Язык: {{lang}}.

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

    /// <summary>
    /// Генерация начальной матрицы запросов с разделением на широкие и узкие темы
    /// </summary>
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

        var trendsBlock = cleanTrends.Count > 0
            ? string.Join(", ", cleanTrends)
            : "нет явных сигналов";

        var excludeBlock = (excludeQueries != null && excludeQueries.Count > 0)
            ? $"\nУЖЕ ИСПОЛЬЗОВАННЫЕ ЗАПРОСЫ (СТРОГО НЕ ПОВТОРЯЙ ИХ И ИХ ПРЯМЫЕ СИНОНИМЫ!):\n- {string.Join("\n- ", excludeQueries.Take(25))}\n"
            : "";

        var prompt = $$"""
        Ты — ведущий аналитик поисковых алгоритмов YouTube и Google Trends в {{curYear}} году.
        Твоя задача — найти скрытые быстрорастущие вирусные аномалии (Outlier Videos) с высоким VPH от небольших и средних каналов по теме: "{{baseQuery}}".
        Язык вывода: {{lang}}.
        {{excludeBlock}}
        СВЕЖИЕ ДАННЫЕ ИЗ GOOGLE TRENDS И ПОДСКАЗОК ПОЛЬЗОВАТЕЛЕЙ:
        {{trendsBlock}}

        ================================================================================
        КЛЮЧЕВОЙ АЛГОРИТМ: ОПРЕДЕЛЕНИЕ ТИПА ЗАПРОСА (ШИРОКИЙ vs УЗКИЙ)
        ================================================================================

        ШАГ 1. ОПРЕДЕЛИ, К КАКОМУ ТИПУ ОТНОСИТСЯ ТЕМА "{{baseQuery}}":

        🔴 ТИП А: ШИРОКИЙ ЗАПРОС (1-2 общих слова или масштабная ниша, например: "AI", "Python", "Крипта", "Дизайн", "Бизнес", "Программирование"):
        - ПРОБЛЕМА: Если искать просто "{{baseQuery}} tutorial" или "{{baseQuery}} 2026", выдача забьется старыми видео каналов-миллионников с нулевой ценностью для новых идей.
        - ПРАВИЛО: КАТЕГОРИЧЕСКИ ЗАПРЕЩЕНО выдавать абстрактные запросы.
        - РЕШЕНИЕ: ДЕКОНСТРУИРУЙ широкую нишу на 4 острых суб-вектора:
          1. Конкретные новые инструменты/фреймворки года (не "ai tools", а конкретные библиотеки/модели из трендов).
          2. Провокации и разрыв шаблона ("почему бросают", "зачем учить", "скрытые проблемы").
          3. Практические сценарии автоматизации ("заменил отдел", "с нуля за вечер", "автоматизация рутины").
          4. Лобовые сравнения двух конкретных лидеров ниши (Tool A vs Tool B).

        🔵 ТИП Б: УЗКИЙ ЗАПРОС (Конкретный софт, модель, инструмент, связка, баг или узкая задача, например: "Cursor vs Windsurf", "DeepSeek R1 локально", "FastAPI background tasks", "Next.js 15 cache"):
        - ПРОБЛЕМА: Модели часто начинают "размывать" узкий запрос в общие слова ("programming", "ai", "coding"). Это убивает релевантность!
        - ПРАВИЛО: КАТЕГОРИЧЕСКИ ЗАПРЕЩЕНО расширять запрос до общих тем. Удерживай 100% фокус на объекте!
        - РЕШЕНИЕ: КОПАЙ ВГЛУБЬ этого инструмента:
          1. Прямые баттлы с главными альтернативами именно этого инструмента (Tool vs Rival).
          2. Частые ошибки, утечки памяти, зависания, лимиты контекста ("не работает", "ошибка", "troubleshooting").
          3. Скрытые фичи, трюки, хоткеи, тонкая настройка ("hidden features", "секреты", "лучшие плагины").
          4. Реальный опыт в проде и стресс-тесты ("in production", "benchmark", "30 days review").

        ================================================================================
        СТРОГИЕ ТРЕБОВАНИЯ К ФОРМАТУ:
        ================================================================================
        - Сгенерируй ровно 12-16 РАЗНООБРАЗНЫХ фраз.
        - Длина КАЖДОЙ фразы СТРОГО от 2 до 4 слов (идеальный размер поискового запроса YouTube).
        - Никаких точек, запятых, слэшей, кавычек или вопросительных знаков.
        - Только поисковые фразы, которые люди реально вводят в строку поиска.

        ВЕРНИ СТРОГО ВАЛИДНЫЙ JSON:
        {"queries": ["фраза 1", "фраза 2", "фраза 3", "фраза 4", "фраза 5", "фраза 6", "фраза 7", "фраза 8", "фраза 9", "фраза 10", "фраза 11", "фраза 12"]}
        """;

        try
        {
            var res = await _llmClient.GenerateJsonAsync<JsonElement>(
                new LlmPromptSpec([new LlmPromptMessage("user", prompt)], Temperature: isExpandSearch ? 0.65f : 0.45f, JsonMode: true), ct);

            if (res.TryGetProperty("queries", out var qArr) && qArr.ValueKind == JsonValueKind.Array)
            {
                var generated = qArr.EnumerateArray()
                    .Select(x => CleanToShortQuery(x.GetString() ?? ""))
                    .Where(x => !string.IsNullOrWhiteSpace(x) && x.Split(' ').Length is >= 2 and <= 5)
                    .Distinct(StringComparer.OrdinalIgnoreCase)
                    .ToList();

                if (generated.Count >= 6) return generated;
            }
        }
        catch (Exception ex)
        {
            _logger.LogDebug(ex, "AI query generation fallback");
        }

        return FallbackQueries(baseQuery, cleanTrends, curYear, isExpandSearch);
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
            fallback.Add($"{fullTerm} review");
            fallback.Add($"{fullTerm} vs");
            fallback.Add($"{fullTerm} mistakes");
            fallback.Add($"{fullTerm} tutorial");
            fallback.Add($"{fullTerm} in production");
            fallback.Add($"{fullTerm} {curYear}");
            fallback.Add($"how to use {fullTerm}");
            fallback.Add($"{fullTerm} hidden features");
        }
        else
        {
            if (cleanTrends.Count > 0) fallback.AddRange(cleanTrends);
            if (isExpandSearch)
            {
                fallback.Add($"{w1} advanced guide");
                fallback.Add($"{w1} in production");
                fallback.Add($"{w1} architecture");
                fallback.Add($"{w1} mistakes {curYear}");
                fallback.Add($"stop using {w1}");
                fallback.Add($"{w1} hidden features");
            }
            else
            {
                fallback.Add($"{w1} {w2}");
                fallback.Add($"{w1} tools {curYear}");
                fallback.Add($"{w1} review");
                fallback.Add($"{w1} tutorial");
                fallback.Add($"{w1} vs {w2}");
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

    private async Task<object> SynthesizeViralIdeasAsync(
        string query, string lang, List<Dictionary<string, object>> videos,
        List<object> blueOceans, int ideasCount, string channelContext,
        CancellationToken ct)
    {
        var curYear = DateTime.UtcNow.Year;
        var skillBundle = await _skillsCatalog.GetSkillBundleForStageAsync(
            SkillStage.TrendResearch, 3000, "Generate high-retention viral concepts.", ct);

        var topVids = string.Join("\n", videos.Take(6).Select(v => $"- {v["title"]} (Views: {v["views"]}, VPH: {v["vph"]}, Ratio: x{v["ratio"]})"));
        var contextBlock = !string.IsNullOrWhiteSpace(channelContext) ? $"Channel Specific Context: {channelContext}\n" : "";

        var userPrompt = $$"""
Topic: '{{query}}'
Current Year: {{curYear}}
Language: {{lang}}
Target Ideas Count: {{ideasCount}}
{{contextBlock}}
Top Outlier Videos (Real Viral Hits with High Views-Per-Hour):
{{topVids}}
Generate strictly {{ideasCount}} high-CTR, psychological video ideas that outperform the competition.
Return strictly JSON matching:
{
  "psychology": { "viewer_fear": "...", "viewer_aspiration": "...", "skepticism_barrier": "..." },
  "ideas": [
    { "concept_id": "A", "angle_type": "Contrarian", "titles": ["..."], "thumbnail_visual": "...", "thumbnail_overlay": "...", "description": "...", "psychological_hook": "..." }
  ],
  "best_concept_script": {
    "hook_0_5s": { "spoken": "...", "visual_cues": "..." },
    "stakes_5_20s": { "spoken": "...", "visual_cues": "..." },
    "open_loop_20_45s": { "spoken": "...", "visual_cues": "..." }
  },
  "seo": { "primary_keyword": "{{query}}", "description_above_fold": "...", "description_body": "...", "timestamps": [], "tags": ["{{query}}"], "pinned_comment": "..." }
}
""";
        try
        {
            var res = await _llmClient.GenerateTextAsync(
                new LlmPromptSpec([new LlmPromptMessage("system", skillBundle.SystemPrompt), new LlmPromptMessage("user", userPrompt)],
                    Temperature: 0.4f, JsonMode: true), ct);
            using var doc = JsonDocument.Parse(res);
            return doc.RootElement.Clone();
        }
        catch
        {
            return new
            {
                psychology = new { viewer_fear = "Страх отстать от технологий", viewer_aspiration = "Автоматизация рутины и рост дохода", skepticism_barrier = "Усталость от кликбейта" },
                ideas = Enumerable.Range(1, ideasCount).Select(i => new
                {
                    concept_id = $"Concept_{i}",
                    angle_type = "High-CTR Hook",
                    titles = new[] { $"{query}: Главный прорыв #{i} ({curYear})" },
                    thumbnail_visual = "Минималистичный контрастный фокусный элемент",
                    thumbnail_overlay = "СМОТРИ",
                    description = $"Глубокий разбор темы {query} с практическими выводами.",
                    psychological_hook = "Разрыв шаблона в первые 3 секунды"
                }).ToArray(),
                blue_ocean_gaps = blueOceans
            };
        }
    }

    private static double CalculateJaccardWords(string a, string b)
    {
        var wA = a.ToLowerInvariant().Split([' ', ',', '.', ':', '-', '/'], StringSplitOptions.RemoveEmptyEntries).ToHashSet();
        var wB = b.ToLowerInvariant().Split([' ', ',', '.', ':', '-', '/'], StringSplitOptions.RemoveEmptyEntries).ToHashSet();
        if (wA.Count == 0 || wB.Count == 0) return 0.0;
        int intersect = wA.Intersect(wB).Count();
        int union = wA.Union(wB).Count();
        return union == 0 ? 0.0 : (double)intersect / union;
    }

    private static async Task EmitLog(Func<string, Task> emit, string message, string status = "info")
    {
        await emit(JsonSerializer.Serialize(new { type = "log", message, status }));
    }
}
