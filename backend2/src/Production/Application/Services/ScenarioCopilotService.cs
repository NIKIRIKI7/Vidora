using System.Text.Json.Serialization;
using Kernel.Ports;
using Microsoft.Extensions.Logging;
using Research.Domain.Ports; // RAG-контекст (тренды/залетевшие видео)
using Skills.Contracts;
using Skills.Domain;

namespace ProductionContext.Application.Services;

/// <summary>Один вариант переписанного фрагмента: ремарка + текст озвучки (Markdown собирает клиент/UI).</summary>
public sealed record ScenarioRewriteSuggestion(
    [property: JsonPropertyName("visual_note")] string VisualNote,
    [property: JsonPropertyName("spoken_text")] string SpokenText);

/// <summary>
/// Центральный блок архитектуры: LLM Copilot.
/// Оркестрирует генерацию и рерайтинг сценария через порт <see cref="ILlmClient"/>,
/// подмешивает контекст из Skills (промпты) и Research (RAG — вирусные хуки по теме).
/// </summary>
public sealed class ScenarioCopilotService
{
    private readonly ILlmClient _llmClient;
    private readonly ISkillsCatalog _skillsCatalog;
    private readonly IYouTubeSearchIngestor _youtube;
    private readonly ILogger<ScenarioCopilotService> _logger;

    public ScenarioCopilotService(
        ILlmClient llmClient,
        ISkillsCatalog skillsCatalog,
        IYouTubeSearchIngestor youtube,
        ILogger<ScenarioCopilotService> logger)
    {
        _llmClient = llmClient;
        _skillsCatalog = skillsCatalog;
        _youtube = youtube;
        _logger = logger;
    }

    /// <summary>
    /// Переписать фрагмент по команде («короче», «кликбейтнее», «разбей на 3» и т.п.).
    /// Всегда запрашивает Structured Outputs (JSON Mode) — защита от «грязного» рерайтинга,
    /// который ломает разметку Markdown.
    /// </summary>
    public async Task<IReadOnlyList<ScenarioRewriteSuggestion>> RewriteFragmentAsync(
        string projectTitle,
        string originalVisualNote,
        string originalText,
        string command,
        bool includeTrendContext = true,
        CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(originalText) && string.IsNullOrWhiteSpace(originalVisualNote))
        {
            return [];
        }

        // 1. Системный промпт «Сценариста» из БД Скилов
        var bundle = await _skillsCatalog.GetSkillBundleForStageAsync(
            SkillStage.ScriptDrafting,
            maxTokenLimit: 3000,
            cancellationToken: ct);

        // 2. RAG: вирусные темы в нише проекта (fallback при недоступности YouTube)
        var trendsBlock = string.Empty;
        if (includeTrendContext && !string.IsNullOrWhiteSpace(projectTitle))
        {
            trendsBlock = await LoadTrendingHooksAsync(projectTitle, ct);
        }

        var systemPrompt = string.Concat(
            bundle.SystemPrompt,
            "\n\nТы — ИИ-редактор YouTube-сценария (faceless, no talking head).",
            "\nПереписывай ТОЛЬКО по переданному фрагменту, сохраняя общий смысл.",
            trendsBlock,
            "\n\nПравила:",
            "\n- Строго верни валидный JSON-массив, БЕЗ Markdown-кодблоков и пояснений.",
            "\n- Каждый элемент: { \"visual_note\": \"что на экране\", \"spoken_text\": \"текст озвучки\" }.",
            "\n- Визуальная ремарка описывает кадр: конкретика, тип кадра, движение, текст на экране.",
            "\n- Текст озвучки: разговорный стиль, без канцелярита; бренды и термины русскими буквами.",
            "\n- Разрешены теги диктора: [emotion: happy|calm|surprised] в начале, паузы <#0.5#> посередине.",
            "\n- Каждая реплика укладывается в 1-4 секунды озвучки (≈ 8-12 слов максимум).");

        var userPrompt = string.Concat(
            $"Название проекта: \"{projectTitle}\"\n",
            $"Задача: {command}\n",
            "Исходный фрагмент:\n",
            $"Визуал: {originalVisualNote}\n",
            $"Озвучка: {originalText}");

        var spec = new LlmPromptSpec(
            Messages:
            [
                new LlmPromptMessage("system", systemPrompt),
                new LlmPromptMessage("user", userPrompt)
            ],
            Temperature: 0.6f,
            MaxTokens: 1500,
            JsonMode: true);

        var suggestions = await _llmClient.GenerateJsonAsync<List<ScenarioRewriteSuggestion>>(spec, ct);
        return suggestions ?? [];
    }

    private async Task<string> LoadTrendingHooksAsync(string projectTitle, CancellationToken ct)
    {
        try
        {
            var results = await _youtube.SearchTopicCandidatesAsync(
                query: projectTitle,
                maxResults: 3,
                daysBack: 14,
                lang: "ru",
                ct: ct);

            var viral = results
                .Where(r => r.ViewCount > 0)
                .OrderByDescending(r => r.ViewCount)
                .Take(3)
                .ToList();

            if (viral.Count == 0) return string.Empty;

            var lines = viral.Select(r =>
                $"- \"{r.Title}\" — {r.ViewCount:N0} просмотров (канал: {r.ChannelTitle})");
            return $"\n\nВирусные темы в этой нише (используй их структуру хуков как референс, НЕ копируй текст):\n{string.Join("\n", lines)}";
        }
        catch (Exception ex)
        {
            _logger.LogDebug(ex, "[ScenarioCopilot] YouTube-контекст недоступен — работаю без RAG.");
            return string.Empty;
        }
    }
}
