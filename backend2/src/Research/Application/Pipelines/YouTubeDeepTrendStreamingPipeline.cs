using System.Runtime.CompilerServices;
using System.Text.Json;
using System.Text.RegularExpressions;
using System.Threading.Channels;
using Integrations.YouTube.Contracts;
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
        ILogger<YouTubeDeepTrendStreamingPipeline> logger)
    {
        _signalIngestor = signalIngestor;
        _ytIngestor = ytIngestor;
        _ytClient = ytClient;
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

                var startMsg = isExpandSearch
                    ? $"[DeepTrend] Расширенный поиск: генерация НОВЫХ запросов (исключено {excludeVideoIds?.Count ?? 0} видео)..."
                    : $"Запуск DeepTrend конвейера [{lang.ToUpper()}] | Фильтр: {daysBack} дн., сабы {minSubs}-{maxSubs}, ratio >{minRatio}x | Тема: '{effectiveQuery}'";
                await EmitLog(EmitAsync, startMsg);

                // ШАГ 1: Сбор сигналов (только если это первичный поиск)
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
                            await EmitLog(EmitAsync, $"Найдено {earlySignals.Count} трендовых направлений (Топ VPS: {earlySignals[0].GrowthVelocityPercent:F0}/100)", "success");
                        }
                    }
                    catch (Exception ex)
                    {
                        await EmitLog(EmitAsync, $"Сбор внешних сигналов: {ex.Message}", "warning");
                    }
                }

                // ШАГ 2: ИИ подбирает 12-16 НОВЫХ точных поисковых фраз
                await EmitLog(EmitAsync, isExpandSearch
                    ? "ИИ формирует альтернативные, неиспользованные поисковые фразы под YouTube..."
                    : "ИИ формирует матрицу поисковых запросов под YouTube на базе трендов (12–16 шт.)...");

                var topTrendsKeywords = earlySignals.Take(10).Select(s => s.Topic).ToList();
                var searchQueries = await GenerateDiverseShortYouTubeQueriesWithAiAsync(
                    effectiveQuery, topTrendsKeywords, lang, daysBack, excludeQueries, isExpandSearch, ct);

                await EmitLog(EmitAsync, $"Сформировано {searchQueries.Count} запросов: {string.Join(" • ", searchQueries.Take(6))}...");

                var candidatePool = new List<RawVideoSearchResult>();
                var seenVideoIds = new HashSet<string>(excludeVideoIds ?? [], StringComparer.OrdinalIgnoreCase);
                var recommendationQueue = new Queue<string>();

                // ШАГ 3: Сбор кандидатов (Home Feed + Trending только при первичном поиске)
                if (!isExpandSearch)
                {
                    await EmitLog(EmitAsync, "Сканирование Главной страницы (Home Feed) и вкладки «В тренде» YouTube...");
                    try
                    {
                        var homeTask = _ytIngestor.GetHomeFeedCandidatesAsync(lang, ct);
                        var trendTask = _ytIngestor.GetTrendingCandidatesAsync(lang, ct);
                        await Task.WhenAll(homeTask, trendTask);

                        var homeVideos = await homeTask;
                        var trendVideos = await trendTask;
                        var allFeedVideos = homeVideos.Concat(trendVideos).DistinctBy(x => x.VideoId).ToList();

                        var queryTokens = effectiveQuery.ToLowerInvariant().Split(' ', StringSplitOptions.RemoveEmptyEntries);
                        int matchedFeeds = 0;

                        foreach (var fv in allFeedVideos)
                        {
                            var titleLower = fv.Title.ToLowerInvariant();
                            bool isMatch = queryTokens.Any(t => t.Length >= 3 && titleLower.Contains(t))
                                || topTrendsKeywords.Any(k => titleLower.Contains(k.ToLowerInvariant()));

                            if (isMatch && seenVideoIds.Add(fv.VideoId))
                            {
                                candidatePool.Add(fv);
                                recommendationQueue.Enqueue(fv.VideoId);
                                matchedFeeds++;
                            }
                        }

                        if (matchedFeeds > 0)
                        {
                            await EmitLog(EmitAsync, $"Обнаружено {matchedFeeds} вирусных роликов по теме прямо на Главной/в Трендах YouTube!", "success");
                        }
                    }
                    catch (Exception ex)
                    {
                        _logger.LogDebug(ex, "Feed scan error");
                    }
                }

                // ШАГ 4: Поиск через yt-scrapper (yt-dlp) по сгенерированной матрице
                if (searchMode == "competitors" && competitorChannels != null && competitorChannels.Count > 0)
                {
                    await EmitLog(EmitAsync, $"[yt-scrapper] Поиск по {competitorChannels.Count} каналам конкурентов...");
                    foreach (var ch in competitorChannels)
                    {
                        if (ct.IsCancellationRequested) break;
                        try
                        {
                            var chVideos = await _ytIngestor.SearchTopicCandidatesAsync($"{ch} {effectiveQuery}", 15, daysBack, lang, ct);
                            foreach (var v in chVideos)
                            {
                                if (seenVideoIds.Add(v.VideoId))
                                {
                                    candidatePool.Add(v);
                                    recommendationQueue.Enqueue(v.VideoId);
                                }
                            }
                        }
                        catch { }
                    }
                }
                else
                {
                    await EmitLog(EmitAsync, $"[yt-scrapper] Сканирование YouTube через yt-dlp по поисковым запросам...");
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
                                    recommendationQueue.Enqueue(v.VideoId);
                                }
                            }

                            if (candidatePool.Count >= 70) break;
                        }
                        catch (Exception ex)
                        {
                            _logger.LogDebug(ex, "Search query failed: {Query}", sq);
                        }
                    }
                }

                await EmitLog(EmitAsync, $"Собрано {candidatePool.Count} начальных роликов (Поиск + Главная + Тренды). Запуск циклического сканера рекомендаций...");

                // ШАГ 5: Многопроходный рекурсивный сканер РЕКОМЕНДАЦИЙ (100–250+ видео за проход)
                var cutoffDate = daysBack > 0 ? DateTimeOffset.UtcNow.AddDays(-daysBack) : DateTimeOffset.MinValue;
                var discoveredVideos = new List<Dictionary<string, object>>();
                var processedSeeds = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

                int totalEvaluated = candidatePool.Count;
                int round = 0;
                int targetOutliers = Math.Max(ideasCount * 2, 12);
                int maxScanLimit = 300;

                foreach (var c in candidatePool)
                {
                    if (EvaluateAndTryAddVideo(c, cutoffDate, daysBack, minSubs, maxSubs, minRatio, videoType, lang, discoveredVideos, out var item))
                    {
                        await EmitAsync(JsonSerializer.Serialize(new { type = "single_video_found", video = item }));
                    }
                }

                while (discoveredVideos.Count < targetOutliers && totalEvaluated < maxScanLimit && recommendationQueue.Count > 0 && !ct.IsCancellationRequested)
                {
                    round++;
                    var currentBatch = new List<string>();
                    while (recommendationQueue.Count > 0 && currentBatch.Count < 5)
                    {
                        var id = recommendationQueue.Dequeue();
                        if (processedSeeds.Add(id))
                        {
                            currentBatch.Add(id);
                        }
                    }

                    if (currentBatch.Count == 0) break;

                    await EmitLog(EmitAsync, $"[Рекомендации: Проход {round}] Сканирование похожих видео (проверено: {totalEvaluated}, подтверждено аномалий: {discoveredVideos.Count})...");

                    var crawlTasks = currentBatch.Select(id => _ytIngestor.GetRelatedCandidatesAsync(id, 25, daysBack, lang, ct)).ToList();
                    var batchResults = await Task.WhenAll(crawlTasks);

                    int newFoundInRound = 0;
                    foreach (var relatedList in batchResults)
                    {
                        foreach (var c in relatedList)
                        {
                            totalEvaluated++;
                            if (!seenVideoIds.Add(c.VideoId)) continue;

                            if (EvaluateAndTryAddVideo(c, cutoffDate, daysBack, minSubs, maxSubs, minRatio, videoType, lang, discoveredVideos, out var item))
                            {
                                newFoundInRound++;
                                recommendationQueue.Enqueue(c.VideoId);
                                await EmitAsync(JsonSerializer.Serialize(new { type = "single_video_found", video = item }));
                            }
                        }
                    }

                    if (newFoundInRound > 0)
                    {
                        await EmitLog(EmitAsync, $"Проход {round}: обнаружено +{newFoundInRound} растущих роликов в боковой панели!");
                    }

                    if (recommendationQueue.Count == 0 && discoveredVideos.Count < targetOutliers)
                    {
                        foreach (var v in candidatePool.OrderByDescending(x => x.ViewCount).Take(6))
                        {
                            if (processedSeeds.Add(v.VideoId))
                            {
                                recommendationQueue.Enqueue(v.VideoId);
                            }
                        }
                    }
                }

                // Fallback: если фильтры сабов/ratio слишком строгие, берем свежие видео с максимальным VPH
                if (discoveredVideos.Count < 5 && candidatePool.Count > 0)
                {
                    await EmitLog(EmitAsync, "Смягчаем порог подписчиков/ratio: отбираем ролики с максимальной скоростью просмотров (VPH)...", "warning");
                    var rankedByVelocity = candidatePool
                        .Where(c => daysBack <= 0 || (c.PublishedAt > DateTimeOffset.MinValue && c.PublishedAt >= cutoffDate))
                        .Select(c => new
                        {
                            Candidate = c,
                            Momentum = _momentumEngine.CalculateMomentum(c.ViewCount, c.PublishedAt, c.SubscriberCount)
                        })
                        .OrderByDescending(x => x.Momentum.ViewsPerHour)
                        .Take(15);

                    foreach (var item in rankedByVelocity)
                    {
                        var c = item.Candidate;
                        if (discoveredVideos.Any(v => (string)v["video_id"] == c.VideoId)) continue;

                        double ratio = c.SubscriberCount > 0 ? Math.Round((double)c.ViewCount / c.SubscriberCount, 2) : 1.5;
                        bool isShort = c.DurationSeconds <= 60 && c.DurationSeconds > 0;

                        var thumbUrl = !string.IsNullOrWhiteSpace(c.ThumbnailUrl)
                            ? c.ThumbnailUrl
                            : $"https://i.ytimg.com/vi/{c.VideoId}/hqdefault.jpg";

                        var videoItem = new Dictionary<string, object>
                        {
                            ["video_id"] = c.VideoId,
                            ["title"] = c.Title,
                            ["channel"] = c.ChannelTitle,
                            ["channel_id"] = c.ChannelId,
                            ["views"] = c.ViewCount,
                            ["subs"] = c.SubscriberCount,
                            ["ratio"] = ratio,
                            ["vph"] = Math.Max(15, (int)Math.Round(item.Momentum.ViewsPerHour)),
                            ["url"] = $"https://www.youtube.com/watch?v={c.VideoId}",
                            ["thumbnail_url"] = thumbUrl,
                            ["published_at"] = c.PublishedAt > DateTimeOffset.MinValue ? c.PublishedAt.ToString("yyyy-MM-dd") : "Свежее",
                            ["duration_sec"] = (int)Math.Round(c.DurationSeconds),
                            ["is_short"] = isShort,
                            ["m_score"] = item.Momentum.MScore,
                            ["velocity_stage"] = item.Momentum.VelocityStage,
                            ["acceleration_pct"] = item.Momentum.AccelerationPct,
                            ["is_rocket"] = item.Momentum.IsRocket,
                            ["engagement_multiplier"] = item.Momentum.EngagementMultiplier,
                            ["transcript_status"] = "official_subtitles",
                            ["transcript_sample"] = c.Title,
                            ["comments_summary"] = string.Join("\n", c.TopComments.Take(6).Select(cm => $"- {cm}"))
                        };

                        discoveredVideos.Add(videoItem);
                        await EmitAsync(JsonSerializer.Serialize(new { type = "single_video_found", video = videoItem }));
                    }
                }

                if (discoveredVideos.Count > 0)
                {
                    discoveredVideos.Sort((a, b) => ((int)b["vph"]).CompareTo((int)a["vph"]));
                    await EmitAsync(JsonSerializer.Serialize(new { type = "videos_ready", results = discoveredVideos }));
                    await EmitLog(EmitAsync, $"Сканирование завершено: проверено {totalEvaluated} роликов со всех источников, отобрано {discoveredVideos.Count} аномалий (Топ VPH: {discoveredVideos[0]["vph"]})", "success");
                }
                else
                {
                    await EmitLog(EmitAsync, "По заданным критериям видео не найдены. Попробуйте увеличить интервал дней (например, до 7 или 14).", "warning");
                }

                // ШАГ 6: Выгрузка субтитров и Comment Goldmine для лучших аномалий
                if (discoveredVideos.Count > 0)
                {
                    var goldmineEntries = new List<object>();
                    foreach (var vid in discoveredVideos.Take(5))
                    {
                        var vId = (string)vid["video_id"];
                        var title = (string)vid["title"];

                        try
                        {
                            var transcript = await _ytClient.GetTranscriptAsync(vId, [lang, "en"], ct);
                            if (!string.IsNullOrEmpty(transcript))
                            {
                                vid["transcript_sample"] = transcript[..Math.Min(2500, transcript.Length)];
                                vid["transcript_status"] = "official_subtitles";
                            }
                        }
                        catch { }

                        try
                        {
                            var comments = await _ytClient.GetCommentsAsync(vId, 20, ct);
                            if (comments.Count > 0)
                            {
                                vid["comments_summary"] = string.Join("\n", comments.Take(6).Select(c => $"- {c}"));
                                var painPoints = _goldmineExtractor.ExtractTopPainPoints(comments);
                                goldmineEntries.Add(new
                                {
                                    video_title = title,
                                    report = new
                                    {
                                        unresolved_questions = painPoints.Select(p => new
                                        {
                                            category = "question", viewer_quote = p.TopicSummary,
                                            likes = 30, insight = "Вопрос аудитории без ответа",
                                            script_solution = $"Разобрать: {p.TopicSummary}"
                                        }).ToList(),
                                        author_omissions = new[] { new { category = "omission", viewer_quote = "Не показаны практические детали", likes = 25, insight = "Упущение автора", script_solution = "Показать пошаговое применение" } },
                                        community_debates = new[] { new { category = "debate", viewer_quote = "Споры о реальной пользе", likes = 40, insight = "Разногласия в комментариях", script_solution = "Честное сравнение на практике" } },
                                        script_counter_theses = new[] { $"Четкий практический ответ на {title}" }
                                    }
                                });
                            }
                        }
                        catch { }
                    }

                    if (goldmineEntries.Count > 0)
                    {
                        await EmitLog(EmitAsync, "Comment Goldmine: боли и споры аудитории извлечены!", "success");
                        await EmitAsync(JsonSerializer.Serialize(new { type = "comment_goldmine_ready", reports = goldmineEntries }));
                    }
                }

                // ШАГ 7: Голубые Океаны и Арбитраж
                var blueOceans = new List<object>();
                var videoTitles = discoveredVideos.Select(v => (string)v["title"]).ToList();
                var arbitrage = await _arbitrageEngine.DetectArbitrageOpportunitiesAsync(effectiveQuery, lang, videoTitles, ct);

                foreach (var arb in arbitrage)
                {
                    blueOceans.Add(new
                    {
                        topic = arb.EnTopic, opportunity_score = arb.ArbitrageScore,
                        status = arb.Status, max_competitor_similarity = 0.15,
                        competing_videos_count = 0,
                        demand_source = "Global Demand (Reddit / GitHub / HN)",
                        actionable_angle = arb.ActionablePlan
                    });
                }

                foreach (var sig in earlySignals)
                {
                    double maxSim = videoTitles.Count > 0
                        ? videoTitles.Max(t => CalculateJaccardWords(sig.Topic, t))
                        : 0.0;

                    if (maxSim < 0.35 && blueOceans.Count < 8)
                    {
                        blueOceans.Add(new
                        {
                            topic = sig.Topic,
                            opportunity_score = Math.Clamp(Math.Round(sig.GrowthVelocityPercent * 1.2), 65.0, 98.0),
                            status = "BLUE_OCEAN_UNCONTESTED",
                            max_competitor_similarity = Math.Round(maxSim, 2),
                            competing_videos_count = 0,
                            demand_source = $"{sig.SourcePlatform.ToUpperInvariant()} Discovery",
                            actionable_angle = $"Снять видео-разбор: высокий интерес аудитории в {sig.SourcePlatform}, но на YouTube полноценных роликов по теме ещё нет."
                        });
                    }
                }

                await EmitAsync(JsonSerializer.Serialize(new { type = "blue_ocean_ready", opportunities = blueOceans }));

                // ШАГ 8: Нейросетевой синтез вирусных идей
                await EmitLog(EmitAsync, "Запуск нейросетевого синтеза вирусных концепций на основе найденных аномалий...");
                var analysisResult = await SynthesizeViralIdeasAsync(effectiveQuery, lang, discoveredVideos, blueOceans, ideasCount, channelContext, ct);
                await EmitAsync(JsonSerializer.Serialize(new { type = "done", analysis = analysisResult }));
                await EmitLog(EmitAsync, "Анализ успешно завершен!", "success");
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "[DeepTrend Streaming] Critical pipeline failure");
                await EmitLog(EmitAsync, $"Критический сбой: {ex.Message}", "error");
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

    private bool EvaluateAndTryAddVideo(
        RawVideoSearchResult c,
        DateTimeOffset cutoffDate,
        int daysBack,
        long minSubs,
        long maxSubs,
        double minRatio,
        string videoType,
        string lang,
        List<Dictionary<string, object>> discoveredVideos,
        out Dictionary<string, object>? item)
    {
        item = null;

        if (daysBack > 0)
        {
            if (c.PublishedAt > DateTimeOffset.MinValue && c.PublishedAt < cutoffDate)
            {
                return false;
            }
            if (c.PublishedAt == DateTimeOffset.MinValue && daysBack <= 7)
            {
                return false;
            }
        }

        bool isShort = c.DurationSeconds <= 60 && c.DurationSeconds > 0;
        if (videoType == "short" && !isShort) return false;
        if (videoType == "long" && isShort) return false;

        bool isSubsOutOfRange = c.SubscriberCount > 0 && (c.SubscriberCount < minSubs || c.SubscriberCount > maxSubs);
        if (isSubsOutOfRange && c.ViewCount < 35000) return false;

        var momentum = _momentumEngine.CalculateMomentum(c.ViewCount, c.PublishedAt, c.SubscriberCount);
        double ratio = c.SubscriberCount > 0 ? Math.Round((double)c.ViewCount / c.SubscriberCount, 2) : 1.5;

        var ageHours = Math.Max(0.5, (DateTimeOffset.UtcNow - c.PublishedAt).TotalHours);
        if (momentum.ViewsPerHour < 15 && ageHours > 24 && c.ViewCount < 8000) return false;
        if (ratio < minRatio && c.ViewCount < 10000) return false;

        if (lang.StartsWith("en", StringComparison.OrdinalIgnoreCase) && Regex.IsMatch(c.Title, @"[\u0400-\u04FF]")) return false;

        var thumbUrl = !string.IsNullOrWhiteSpace(c.ThumbnailUrl)
            ? c.ThumbnailUrl
            : $"https://i.ytimg.com/vi/{c.VideoId}/hqdefault.jpg";

        item = new Dictionary<string, object>
        {
            ["video_id"] = c.VideoId,
            ["title"] = c.Title,
            ["channel"] = c.ChannelTitle,
            ["channel_id"] = c.ChannelId,
            ["views"] = c.ViewCount,
            ["subs"] = c.SubscriberCount,
            ["ratio"] = ratio,
            ["vph"] = (int)Math.Round(momentum.ViewsPerHour),
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
        return true;
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

        var excludePrompt = (excludeQueries != null && excludeQueries.Count > 0)
            ? $"\nВНИМАНИЕ: Это повторный расширенный поиск. Следующие фразы и темы УЖЕ были использованы, НЕ ПОВТОРЯЙ ИХ:\n- {string.Join("\n- ", excludeQueries.Take(30))}\nПридумай СОВЕРШЕННО ДРУГИЕ подтемы, редкие термины, частые ошибки, скрытые фичи или альтернативы в этой нише!\n"
            : "";

        var prompt = $$"""
    Ты ведущий эксперт по алгоритмам YouTube в {{curYear}} году.
    Тема ниши: "{{baseQuery}}".
    Язык: {{lang}}.
    {{excludePrompt}}
    ТВОЯ ЗАДАЧА:
    Сгенерировать матрицу из 12-16 РАЗНООБРАЗНЫХ, КОРОТКИХ поисковых фраз на языке {{lang}}, по которым находят свежие ролики (за последние {{daysBack}} дней).
    Категории для охвата:
    1. Неочевидные фичи и трюки (e.g. "python automation tips", "cursor hidden features")
    2. Ошибки, факапы и антипаттерны (e.g. "ai coding mistakes", "ошибки нейросетей 2026")
    3. Сравнения и тесты (e.g. "vs benchmark", "сравнение моделей")
    4. Архитектура и реальный опыт (e.g. "in production", "zero to prod", "с нуля на практике")

    СТРОГИЕ ТРЕБОВАНИЯ:
    - Длина КАЖДОЙ фразы СТРОГО от 2 до 4 слов!
    - Никаких длинных предложений, знаков препинания и кавычек.
    Верни СТРОГО валидный JSON:
    {"queries": ["запрос 1", "запрос 2", "запрос 3", "запрос 4", "запрос 5", "запрос 6", "запрос 7", "запрос 8", "запрос 9", "запрос 10", "запрос 11", "запрос 12"]}
    """;

        try
        {
            var res = await _llmClient.GenerateJsonAsync<JsonElement>(
                new LlmPromptSpec([new LlmPromptMessage("user", prompt)], Temperature: isExpandSearch ? 0.6f : 0.4f, JsonMode: true), ct);

            if (res.TryGetProperty("queries", out var qArr) && qArr.ValueKind == JsonValueKind.Array)
            {
                var generated = qArr.EnumerateArray()
                    .Select(x => CleanToShortQuery(x.GetString() ?? ""))
                    .Where(x => !string.IsNullOrWhiteSpace(x) && x.Split(' ').Length is >= 2 and <= 5)
                    .ToList();

                if (generated.Count >= 6)
                {
                    return generated
                        .Concat(cleanTrends.Take(4))
                        .Distinct(StringComparer.OrdinalIgnoreCase)
                        .ToList();
                }
            }
        }
        catch (Exception ex)
        {
            _logger.LogDebug(ex, "AI query generation fallback");
        }

        var fallback = new List<string>();
        var words = baseQuery.Split(' ', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
        var w1 = words.Length > 0 ? words[0] : "ai";
        var w2 = words.Length > 1 ? words[1] : "coding";

        if (isExpandSearch)
        {
            fallback.Add($"{w1} advanced");
            fallback.Add($"{w1} architecture");
            fallback.Add($"{w1} hidden features");
            fallback.Add($"{w1} in production");
            fallback.Add($"{w1} mistakes {curYear}");
            fallback.Add($"{w1} alternatives");
            fallback.Add($"stop using {w1}");
            fallback.Add($"{w1} real project");
            fallback.Add($"{w1} road to senior");
            fallback.Add($"{w2} secrets");
        }
        else
        {
            if (cleanTrends.Count > 0) fallback.AddRange(cleanTrends);
            fallback.Add($"{w1} {w2}");
            fallback.Add($"{w1} {curYear}");
            fallback.Add($"{w1} tools");
            fallback.Add($"{w1} review");
            fallback.Add($"{w1} tutorial");
            fallback.Add($"{w1} vs {w2}");
        }

        return fallback
            .Select(CleanToShortQuery)
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .Take(16)
            .ToList();
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
