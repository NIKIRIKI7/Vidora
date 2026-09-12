using System.Text.Json;
using System.Text.RegularExpressions;
using System.Xml.Linq;
using Kernel.Ports;
using Microsoft.Extensions.Logging;
using Research.Domain.Entities;
using Research.Domain.Ports;
using Research.Domain.ValueObjects;

namespace Research.Infrastructure.Ingestors;

public sealed record RawSignal
{
    public string Title { get; init; } = string.Empty;
    public string Query { get; init; } = string.Empty;
    public string Platform { get; init; } = string.Empty;
    public string Url { get; init; } = string.Empty;
    public int Upvotes { get; init; }
    public int Comments { get; init; }
    public int Bookmarks { get; init; }
    public double AgeHours { get; init; }
    public double DemandScore { get; init; }
    public bool Breakout { get; init; }
}

public sealed partial class SignalIngestor : ISignalIngestor
{
    private readonly HttpClient _http;
    private readonly ILogger<SignalIngestor> _logger;
    private readonly ILlmClient _llmClient;

    public SignalIngestor(HttpClient http, ILogger<SignalIngestor> logger, ILlmClient llmClient)
    {
        _http = http;
        _logger = logger;
        _llmClient = llmClient;
    }

    public async Task<IReadOnlyList<EarlySignal>> CollectEarlySignalsAsync(string query, string lang = "ru", CancellationToken ct = default)
    {
        var ctx = await ResolveNicheContextAsync(query, lang, ct);
        var enQuery = ctx.EnglishQuery;

        var tasks = new List<Task<List<RawSignal>>>
        {
            FetchGoogleTrendsMatrixAsync(query, lang, ct),
            FetchDuckDuckGoSuggestionsAsync(query, ct),
            FetchHackerNewsSignalsAsync(enQuery, ct),
            FetchGitHubTrendingSignalsAsync(enQuery, ct),
            FetchRedditSignalsAsync(enQuery, ctx.RedditSubreddits, ct)
        };

        if (lang.StartsWith("ru", StringComparison.OrdinalIgnoreCase) || Regex.IsMatch(query, @"[\u0400-\u04FF]"))
        {
            tasks.Add(FetchHabrSignalsAsync(query, ct));
            tasks.Add(FetchHabrSearchSignalsAsync(query, ct));
        }

        var results = await Task.WhenAll(tasks);
        var aggregated = results.SelectMany(r => r).ToList();
        return ClusterAndRank(aggregated, query);
    }

    public async Task<IReadOnlyList<string>> FetchGoogleTrendsKeywordsAsync(string query, string lang = "ru", CancellationToken ct = default)
    {
        var curYear = DateTime.UtcNow.Year;
        var cleanQuery = Regex.Replace(query, @"[,;]+", " ").Trim();
        var isRu = lang.StartsWith("ru", StringComparison.OrdinalIgnoreCase);

        var patterns = isRu
            ? new[] { "", " как", " почему", $" {curYear}", " обзор", " ошибки", " vs", " альтернатива", " гайд", " настройка" }
            : new[] { "", " how to", " why", $" {curYear}", " review", " mistakes", " vs", " alternative", " guide", " secrets" };

        var foundKeywords = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        var tasks = patterns.Select(async sfx =>
        {
            var q = sfx.StartsWith(" ") ? $"{cleanQuery}{sfx}" : $"{sfx} {cleanQuery}";
            try
            {
                var url = $"https://suggestqueries.google.com/complete/search?client=firefox&ds=yt&q={Uri.EscapeDataString(q.Trim())}&hl={lang}";
                using var res = await _http.GetAsync(url, ct);
                if (!res.IsSuccessStatusCode) return;
                var json = await res.Content.ReadAsStringAsync(ct);
                using var doc = JsonDocument.Parse(json);
                if (doc.RootElement.GetArrayLength() > 1)
                {
                    foreach (var item in doc.RootElement[1].EnumerateArray())
                    {
                        var val = item.GetString()?.Trim();
                        if (!string.IsNullOrWhiteSpace(val) && val.Length > 3)
                        {
                            lock (foundKeywords)
                            {
                                foundKeywords.Add(val);
                            }
                        }
                    }
                }
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                _logger.LogDebug(ex, "[SignalIngestor] Дополнительный источник сигналов недоступен");
            }
        });

        await Task.WhenAll(tasks);
        return foundKeywords.ToList();
    }

    /// <summary>
    /// Разрешает нишевой контекст через LLM: эффективный запрос, английский эквивалент,
    /// ключевые слова и релевантные сабреддиты. При сбое LLM — эвристический fallback.
    /// </summary>
    public async Task<NicheContext> ResolveNicheContextAsync(string query, string lang = "ru", CancellationToken ct = default)
    {
        var displayTopic = CleanQuery(query);
        var cleanQuery = Regex.Replace(displayTopic, @"\s+", " ").Trim();
        var fallbackSubreddits = GetFallbackSubreddits(query);

        try
        {
            var prompt = $$"""
            Ты — контент-аналитик для YouTube DeepTrend. Ниша: "{{cleanQuery}}" (язык: {{lang}}).
            Определи аналитический контекст ниши для поиска ранних трендов на разных платформах.

            КЛЮЧЕВОЙ АЛГОРИТМ:
            - effective_query: самый релевантный запрос 1-4 слова НА ЯЗЫКЕ "{{lang}}".
            - english_query: английский перевод effective_query (для поиска по HN/GitHub/Reddit).
            - keywords: 3-6 коротких ключей ниши.
            - reddit_subreddits: 2-4 английских сабреддита по теме (только имя, латиницей).

            ВЕРНИ СТРОГО JSON:
            {"effective_query": "...", "english_query": "...", "keywords": ["...", "..."], "reddit_subreddits": ["...", "..."]}
            """;

            var res = await _llmClient.GenerateJsonAsync<JsonElement>(
                new LlmPromptSpec([new LlmPromptMessage("user", prompt)], Temperature: 0.3f, JsonMode: true), ct);

            if (res.ValueKind == JsonValueKind.Object)
            {
                var effective = ReadString(res, "effective_query");
                var english = ReadString(res, "english_query");
                var keywords = ReadStringArray(res, "keywords")
                    .Where(k => k.Length >= 2)
                    .Take(6)
                    .ToList();
                var subreddits = ReadStringArray(res, "reddit_subreddits")
                    .Select(s => Regex.Replace(s, "[^\\w]+", ""))
                    .Where(s => s.Length >= 2)
                    .Take(6)
                    .ToList();

                if (!string.IsNullOrWhiteSpace(effective) && !string.IsNullOrWhiteSpace(english))
                {
                    return new NicheContext(
                        DisplayTopic: cleanQuery,
                        EffectiveQuery: effective,
                        EnglishQuery: english,
                        Keywords: keywords.Count > 0 ? keywords : [cleanQuery],
                        RedditSubreddits: subreddits.Count > 0 ? subreddits : fallbackSubreddits);
                }
            }
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            _logger.LogDebug(ex, "[SignalIngestor] LLM resolution failed for {Query}", cleanQuery);
        }

        return new NicheContext(
            DisplayTopic: cleanQuery,
            EffectiveQuery: cleanQuery,
            EnglishQuery: cleanQuery,
            Keywords: [cleanQuery],
            RedditSubreddits: fallbackSubreddits);
    }

    private static string ReadString(JsonElement element, string prop)
    {
        if (element.TryGetProperty(prop, out var el) && el.ValueKind == JsonValueKind.String)
        {
            return el.GetString()?.Trim() ?? string.Empty;
        }
        return string.Empty;
    }

    private static IEnumerable<string> ReadStringArray(JsonElement element, string prop)
    {
        if (element.TryGetProperty(prop, out var arr) && arr.ValueKind == JsonValueKind.Array)
        {
            foreach (var item in arr.EnumerateArray())
            {
                if (item.ValueKind == JsonValueKind.String)
                {
                    var val = item.GetString()?.Trim();
                    if (!string.IsNullOrWhiteSpace(val)) yield return val;
                }
            }
        }
    }

    /// <summary>
    /// Универсальные сабреддиты по умолчанию для любой ниши (не привязаны к IT).
    /// </summary>
    private static IReadOnlyList<string> GetFallbackSubreddits(string query)
    {
        var q = query.ToLowerInvariant();
        if (q.Contains("игр") || q.Contains("game") || q.Contains("gaming")) return ["gaming", "IndieGaming", "truegaming"];
        if (q.Contains("крипт") || q.Contains("финан") || q.Contains("инвест") || q.Contains("crypto") || q.Contains("financ") || q.Contains("invest")) return ["CryptoCurrency", "personalfinance", "investing"];
        if (q.Contains("здоров") || q.Contains("медицин") || q.Contains("health") || q.Contains("fitness") || q.Contains("medic")) return ["fitness", "nutrition", "medicine"];
        if (q.Contains("кухн") || q.Contains("рецепт") || q.Contains("food") || q.Contains("cooking") || q.Contains("recipe")) return ["Cooking", "recipes", "MealPrepSunday"];
        if (q.Contains("бизнес") || q.Contains("маркет") || q.Contains("business") || q.Contains("market") || q.Contains("startup")) return ["Entrepreneur", "smallbusiness", "marketing"];
        if (q.Contains("образован") || q.Contains("обуч") || q.Contains("education") || q.Contains("learn") || q.Contains("course")) return ["education", "learnprogramming", "GetStudying"];
        if (q.Contains("психолог") || q.Contains("мотив") || q.Contains("self") || q.Contains("psycholog") || q.Contains("motivation")) return ["selfimprovement", "GetMotivated", "DecidingToBeBetter"];
        if (q.Contains("путешеств") || q.Contains("travel") || q.Contains("trip")) return ["travel", "solotravel", "DigitalNomad"];
        return ["technology", "AskProgramming", "InternetIsBeautiful"];
    }

    private async Task<List<RawSignal>> FetchRedditSignalsAsync(string query, IReadOnlyList<string> subreddits, CancellationToken ct)
    {
        var list = new List<RawSignal>();
        try
        {
            var subs = subreddits.Count > 0 ? string.Join("+", subreddits) : "technology+programming";
            var url = $"https://www.reddit.com/r/{subs}/search.json?q={Uri.EscapeDataString(query)}&sort=hot&restrict_sr=1&limit=15";
            using var req = new HttpRequestMessage(HttpMethod.Get, url);
            req.Headers.UserAgent.ParseAdd("Vidora-DeepTrend/2.0 (by /u/vidora-research)");
            using var res = await _http.SendAsync(req, ct);
            if (!res.IsSuccessStatusCode) return list;
            using var doc = JsonDocument.Parse(await res.Content.ReadAsStringAsync(ct));
            if (doc.RootElement.TryGetProperty("data", out var data) && data.TryGetProperty("children", out var children))
            {
                foreach (var child in children.EnumerateArray())
                {
                    if (!child.TryGetProperty("data", out var post)) continue;
                    var title = post.TryGetProperty("title", out var t) ? t.GetString() ?? "" : "";
                    var permalink = post.TryGetProperty("permalink", out var p) ? p.GetString() ?? "" : "";
                    int score = post.TryGetProperty("score", out var s) && s.ValueKind == JsonValueKind.Number ? s.GetInt32() : 20;
                    int comments = post.TryGetProperty("num_comments", out var c) && c.ValueKind == JsonValueKind.Number ? c.GetInt32() : 10;
                    if (string.IsNullOrWhiteSpace(title)) continue;
                    list.Add(new RawSignal
                    {
                        Title = title,
                        Query = query,
                        Platform = "reddit",
                        Url = string.IsNullOrEmpty(permalink) ? "https://www.reddit.com" : $"https://www.reddit.com{permalink}",
                        Upvotes = score,
                        Comments = comments,
                        Bookmarks = (int)(score * 0.2),
                        AgeHours = 18.0,
                        DemandScore = Math.Min(98.0, 50.0 + (score * 0.1) + (comments * 0.2)),
                        Breakout = score > 150
                    });
                }
            }
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            _logger.LogDebug(ex, "[SignalIngestor] Reddit fetch skipped");
        }
        return list;
    }

    private async Task<List<RawSignal>> FetchGoogleTrendsMatrixAsync(string query, string lang, CancellationToken ct)
    {
        var list = new List<RawSignal>();
        var curYear = DateTime.UtcNow.Year;
        var suffixes = new[] { "", " vs", $" {curYear}", " обзор" };
        foreach (var sfx in suffixes)
        {
            try
            {
                var q = Uri.EscapeDataString($"{query}{sfx}".Trim());
                var url = $"https://suggestqueries.google.com/complete/search?client=firefox&ds=yt&q={q}&hl={lang}";
                using var res = await _http.GetAsync(url, ct);
                if (!res.IsSuccessStatusCode) continue;
                var json = await res.Content.ReadAsStringAsync(ct);
                using var doc = JsonDocument.Parse(json);
                if (doc.RootElement.GetArrayLength() > 1)
                {
                    int idx = 0;
                    foreach (var item in doc.RootElement[1].EnumerateArray())
                    {
                        var val = item.GetString()?.Trim();
                        if (string.IsNullOrEmpty(val)) continue;
                        list.Add(new RawSignal
                        {
                            Title = val, Query = val, Platform = "trends",
                            Url = $"https://trends.google.com/trends/explore?q={Uri.EscapeDataString(val)}",
                            Upvotes = 60, Comments = 15, Bookmarks = 10, AgeHours = 12.0,
                            DemandScore = Math.Max(45.0, 90.0 - (idx * 5.0)),
                            Breakout = idx == 0 && val.Contains(curYear.ToString())
                        });
                        idx++;
                    }
                }
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                _logger.LogDebug(ex, "[SignalIngestor] Дополнительный источник сигналов недоступен");
            }
        }
        return list;
    }

    private async Task<List<RawSignal>> FetchGitHubTrendingSignalsAsync(string query, CancellationToken ct)
    {
        var list = new List<RawSignal>();
        try
        {
            var monthAgo = DateTime.UtcNow.AddDays(-45).ToString("yyyy-MM-dd");
            var url = $"https://api.github.com/search/repositories?q={Uri.EscapeDataString(query)}+pushed:>{monthAgo}&sort=stars&order=desc&per_page=15";
            using var req = new HttpRequestMessage(HttpMethod.Get, url);
            req.Headers.UserAgent.ParseAdd("Vidora-DeepTrend/2.0");
            using var res = await _http.SendAsync(req, ct);
            if (!res.IsSuccessStatusCode) return list;
            using var doc = JsonDocument.Parse(await res.Content.ReadAsStringAsync(ct));
            if (doc.RootElement.TryGetProperty("items", out var items))
            {
                foreach (var repo in items.EnumerateArray())
                {
                    var name = repo.TryGetProperty("full_name", out var fn) ? fn.GetString() ?? "" : "";
                    var desc = repo.TryGetProperty("description", out var d) ? d.GetString() ?? "" : "";
                    int stars = repo.TryGetProperty("stargazers_count", out var sc) ? sc.GetInt32() : 0;
                    int forks = repo.TryGetProperty("forks_count", out var fc) ? fc.GetInt32() : 0;
                    var htmlUrl = repo.TryGetProperty("html_url", out var hu) ? hu.GetString() ?? "" : "";
                    var displayTitle = string.IsNullOrWhiteSpace(desc) ? name : $"{name}: {desc}";
                    list.Add(new RawSignal
                    {
                        Title = displayTitle,
                        Query = query,
                        Platform = "github",
                        Url = htmlUrl,
                        Upvotes = stars,
                        Comments = forks,
                        Bookmarks = stars,
                        AgeHours = 20.0,
                        DemandScore = Math.Min(99.0, 55.0 + (stars * 0.05)),
                        Breakout = stars > 200
                    });
                }
            }
        }
        catch { }
        return list;
    }

    private async Task<List<RawSignal>> FetchHackerNewsSignalsAsync(string query, CancellationToken ct)
    {
        var list = new List<RawSignal>();
        try
        {
            var url = $"https://hn.algolia.com/api/v1/search?query={Uri.EscapeDataString(query)}&tags=story&hitsPerPage=15";
            using var res = await _http.GetAsync(url, ct);
            if (!res.IsSuccessStatusCode) return list;
            using var doc = JsonDocument.Parse(await res.Content.ReadAsStringAsync(ct));
            if (doc.RootElement.TryGetProperty("hits", out var hits))
            {
                foreach (var hit in hits.EnumerateArray())
                {
                    var title = hit.TryGetProperty("title", out var t) ? t.GetString() ?? "" : "";
                    if (string.IsNullOrWhiteSpace(title)) continue;
                    int points = hit.TryGetProperty("points", out var p) && p.ValueKind == JsonValueKind.Number ? p.GetInt32() : 10;
                    int comments = hit.TryGetProperty("num_comments", out var c) && c.ValueKind == JsonValueKind.Number ? c.GetInt32() : 5;
                    var storyId = hit.TryGetProperty("objectID", out var oid) ? oid.GetString() ?? "" : "";
                    var hnUrl = hit.TryGetProperty("url", out var u) && u.ValueKind != JsonValueKind.Null && !string.IsNullOrEmpty(u.GetString())
                        ? u.GetString()!
                        : $"https://news.ycombinator.com/item?id={storyId}";
                    list.Add(new RawSignal
                    {
                        Title = title,
                        Query = query,
                        Platform = "hackernews",
                        Url = hnUrl,
                        Upvotes = points,
                        Comments = comments,
                        Bookmarks = (int)(points * 0.3),
                        AgeHours = 24.0,
                        DemandScore = Math.Min(98.0, 45.0 + (points * 0.2) + (comments * 0.3)),
                        Breakout = points > 100 || comments > 50
                    });
                }
            }
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            _logger.LogDebug(ex, "[SignalIngestor] HN fetch skipped");
        }
        return list;
    }

    private async Task<List<RawSignal>> FetchDuckDuckGoSuggestionsAsync(string query, CancellationToken ct)
    {
        var list = new List<RawSignal>();
        try
        {
            var url = $"https://duckduckgo.com/ac/?q={Uri.EscapeDataString(query)}&type=list";
            using var res = await _http.GetAsync(url, ct);
            if (!res.IsSuccessStatusCode) return list;
            var json = await res.Content.ReadAsStringAsync(ct);
            using var doc = JsonDocument.Parse(json);
            if (doc.RootElement.GetArrayLength() > 1)
            {
                int idx = 0;
                foreach (var item in doc.RootElement[1].EnumerateArray())
                {
                    var val = item.GetString()?.Trim();
                    if (string.IsNullOrEmpty(val)) continue;
                    list.Add(new RawSignal
                    {
                        Title = val, Query = val, Platform = "duckduckgo",
                        Url = $"https://duckduckgo.com/?q={Uri.EscapeDataString(val)}",
                        Upvotes = 30, Comments = 10, Bookmarks = 5, AgeHours = 18.0,
                        DemandScore = Math.Max(40.0, 75.0 - (idx * 4.0)), Breakout = false
                    });
                    idx++;
                }
            }
        }
        catch { }
        return list;
    }

    private async Task<List<RawSignal>> FetchHabrSignalsAsync(string query, CancellationToken ct)
    {
        var list = new List<RawSignal>();
        try
        {
            using var req = new HttpRequestMessage(HttpMethod.Get, "https://habr.com/ru/rss/best/weekly/");
            req.Headers.UserAgent.ParseAdd("Mozilla/5.0 (Windows NT 10.0; Win64; x64)");
            using var res = await _http.SendAsync(req, ct);
            if (!res.IsSuccessStatusCode) return list;
            var xml = await res.Content.ReadAsStringAsync(ct);
            var doc = XDocument.Parse(xml);
            foreach (var item in doc.Descendants("item").Take(15))
            {
                var title = item.Element("title")?.Value ?? "";
                var link = item.Element("link")?.Value ?? "";
                if (string.IsNullOrWhiteSpace(title)) continue;
                list.Add(new RawSignal
                {
                    Title = title, Query = query, Platform = "habr",
                    Url = link, Upvotes = 45, Comments = 30, Bookmarks = 40,
                    AgeHours = 36.0, DemandScore = 75.0, Breakout = false
                });
            }
        }
        catch { }
        return list;
    }

    private async Task<List<RawSignal>> FetchHabrSearchSignalsAsync(string query, CancellationToken ct)
    {
        var list = new List<RawSignal>();
        try
        {
            var url = $"https://habr.com/ru/rss/search/?q={Uri.EscapeDataString(query)}&target_type=posts&sort=relevance";
            using var req = new HttpRequestMessage(HttpMethod.Get, url);
            req.Headers.UserAgent.ParseAdd("Mozilla/5.0 (Windows NT 10.0; Win64; x64)");
            using var res = await _http.SendAsync(req, ct);
            if (!res.IsSuccessStatusCode) return list;
            var xml = await res.Content.ReadAsStringAsync(ct);
            var doc = XDocument.Parse(xml);
            foreach (var item in doc.Descendants("item").Take(10))
            {
                var title = item.Element("title")?.Value ?? "";
                var link = item.Element("link")?.Value ?? "";
                if (string.IsNullOrWhiteSpace(title)) continue;
                list.Add(new RawSignal
                {
                    Title = title, Query = query, Platform = "habr",
                    Url = link, Upvotes = 35, Comments = 20, Bookmarks = 25,
                    AgeHours = 24.0, DemandScore = 80.0, Breakout = false
                });
            }
        }
        catch { }
        return list;
    }

    private static IReadOnlyList<EarlySignal> ClusterAndRank(List<RawSignal> raw, string query)
    {
        if (raw.Count == 0) return [];
        var clusters = new Dictionary<string, List<RawSignal>>(StringComparer.OrdinalIgnoreCase);
        foreach (var item in raw)
        {
            var key = ExtractPrimaryKeyword(item.Title);
            if (!clusters.TryGetValue(key, out var bucket)) { bucket = []; clusters[key] = bucket; }
            bucket.Add(item);
        }

        var runId = ResearchRunId.New();
        var ranked = new List<EarlySignal>();
        foreach (var (clusterKey, members) in clusters)
        {
            var best = members.OrderByDescending(m => m.Upvotes + m.Comments * 2).First();
            int totalUpvotes = members.Sum(m => m.Upvotes);
            int totalComments = members.Sum(m => m.Comments);
            int totalBookmarks = members.Sum(m => m.Bookmarks);
            double minAge = Math.Max(0.5, members.Min(m => m.AgeHours));
            double velocity = (totalUpvotes + totalComments * 2.0 + totalBookmarks * 2.5) / Math.Pow(minAge + 2.0, 1.1);
            double maxDemand = members.Max(m => m.DemandScore);
            int crossPlatform = members.Select(m => m.Platform).Distinct().Count();
            bool isBreakout = members.Any(m => m.Breakout);
            double vps = (maxDemand * 0.40) + (Math.Min(100.0, velocity * 1.5) * 0.35) + (crossPlatform >= 3 ? 100 : (crossPlatform == 2 ? 60 : 20)) * 0.25;
            var keywords = members.SelectMany(m => ExtractKeywords(m.Title)).Distinct().Take(6).ToList();
            var growthPct = isBreakout ? "+5000% (Breakout)" : $"+{Math.Max(50, (int)(vps * 2.8))}%";
            ranked.Add(EarlySignal.Create(
                runId: runId,
                topic: best.Title,
                keywords: keywords,
                growthVelocityPercent: Math.Round(vps, 1),
                supportingVideoCount: members.Count,
                aggregateVph: Math.Round(velocity * 10, 1),
                confidence: Math.Clamp(vps / 100.0, 0.4, 0.99),
                sourceUrl: best.Url,
                sourcePlatform: best.Platform,
                growthPct: growthPct));
        }
        return ranked.OrderByDescending(s => s.GrowthVelocityPercent).Take(15).ToList();
    }

    private static string CleanQuery(string text)
    {
        var clean = Regex.Replace(text, @"[,;]+", " ");
        clean = Regex.Replace(clean, @"\s+", " ").Trim();
        return string.IsNullOrWhiteSpace(clean) ? "tech" : clean;
    }

    private static string ExtractPrimaryKeyword(string text)
    {
        var match = WordRegex().Match(text);
        return match.Success ? match.Value.ToLowerInvariant() : text[..Math.Min(12, text.Length)].ToLowerInvariant();
    }

    private static IEnumerable<string> ExtractKeywords(string text)
    {
        return WordRegex().Matches(text).Select(m => m.Value.ToLowerInvariant()).Where(w => w.Length >= 4);
    }

    [GeneratedRegex(@"[\w\u0400-\u04FF]{3,}")]
    private static partial Regex WordRegex();
}