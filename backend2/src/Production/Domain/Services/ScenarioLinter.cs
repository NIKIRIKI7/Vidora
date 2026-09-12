using System.Text.Json.Serialization;
using ProductionContext.Domain.Entities;
using Kernel.Contracts; // Для суммы пауз из тегов диктора (SSOT)

namespace ProductionContext.Domain.Services;

[JsonConverter(typeof(JsonStringEnumConverter))]
public enum IssueSeverity
{
    Info,
    Warning,
    Error
}

/// <summary>
/// Нарушение/подсказка режиссёрского линтера.
/// severity: INFO — совет, WARNING — нарушение динамики, ERROR — рискованно для сборки.
/// </summary>
public sealed record ScenarioIssue(
    string? FragmentId,
    string? SceneId,
    IssueSeverity Severity,
    string Code,
    string Message);

/// <summary>
/// Правый блок архитектуры: Analytics &amp; Heuristics.
/// Stateless доменный сервис — работает мгновенно, без LLM.
/// </summary>
public sealed class ScenarioLinter
{
    /// <summary>«Правило 4 секунд»: визуальный план держим не дольше ~4с.</summary>
    public const double MaxVisualHoldSeconds = 4.5;

    /// <summary>Хук обязан уложиться в первые секунды ролика.</summary>
    public const double HookWindowSeconds = 15.0;

    /// <summary>Допустимое расхождение заявленного и вычисленного таймкода (сек).</summary>
    public const double DeclaredTimingToleranceSeconds = 1.5;

    private const double MaxPauseAllowedSeconds = 3.0;

    /// <summary>Типичные канцелярские/«ИИ-стилевые» обороты (анти-ИИ словарь из скила сценариста).</summary>
    private static readonly string[] WaterPhrases =
    [
        "в этом видео",
        "на сегодняшний день",
        "является",
        "представляет собой",
        "важно отметить",
        "стоит отметить",
        "кроме того",
        "неотъемлемой частью",
        "знаменует собой",
        "в контексте",
        "в ландшафте",
        "ключевой"
    ];

    public IReadOnlyList<ScenarioIssue> LintProject(Project project)
    {
        ArgumentNullException.ThrowIfNull(project);

        var issues = new List<ScenarioIssue>();
        bool hasCta = false;

        for (int sIdx = 0; sIdx < project.Scenes.Count; sIdx++)
        {
            var scene = project.Scenes[sIdx];

            // 1. Драматургия: хук в первой сцене не должен провисать
            if (sIdx == 0 && scene.DurationSeconds > HookWindowSeconds)
            {
                issues.Add(new ScenarioIssue(
                    null,
                    scene.SceneId.Value,
                    IssueSeverity.Warning,
                    "HOOK_TOO_LONG",
                    $"Хук затянут: сцена идёт {scene.DurationSeconds:F1}с. Зритель решает, смотреть ли видео, за первые {HookWindowSeconds:F0} секунд."));
            }

            foreach (var frag in scene.Fragments)
            {
                // 2. Динамика (Rule of 4 seconds) — только там, где есть озвучка
                if (frag.DurationSeconds > MaxVisualHoldSeconds && !string.IsNullOrWhiteSpace(frag.Text))
                {
                    issues.Add(new ScenarioIssue(
                        frag.FragmentId.Value,
                        scene.SceneId.Value,
                        IssueSeverity.Warning,
                        "PACING_VIOLATION",
                        $"План держится {frag.DurationSeconds:F1}с без смены кадра (норма до {MaxVisualHoldSeconds:F0}с). Разбейте на два фрагмента."));
                }

                // 3. Переизбыток драматических пауз (Edge Case: «бесконечные паузы»)
                double totalPauses = VoiceTagSanitizer.GetTotalPauseSeconds(frag.Text);
                if (totalPauses > MaxPauseAllowedSeconds)
                {
                    issues.Add(new ScenarioIssue(
                        frag.FragmentId.Value,
                        scene.SceneId.Value,
                        IssueSeverity.Error,
                        "PAUSE_LIMIT_EXCEEDED",
                        $"Суммарная пауза в озвучке — {totalPauses:F1}с (норма до {MaxPauseAllowedSeconds:F0}с). Движок TTS обрезает паузы дольше 3 секунд."));
                }

                // 4. Детекция «воды» / канцелярского ИИ-стиля
                var textLower = frag.Text.ToLowerInvariant();
                if (WaterPhrases.Any(w => textLower.Contains(w)))
                {
                    issues.Add(new ScenarioIssue(
                        frag.FragmentId.Value,
                        scene.SceneId.Value,
                        IssueSeverity.Info,
                        "AI_STYLE_TEXT",
                        "Обнаружены типичные канцелярские обороты. Отредактируйте текст для живости (см. анти-ИИ словарь скила сценариста)."));
                }

                // CTA: ищем призыв к действию в последних сценах
                if (sIdx >= project.Scenes.Count - 2 &&
                    (textLower.Contains("подписывай") || textLower.Contains("подпишись")
                     || textLower.Contains("ссылк") || textLower.Contains("канал")
                     || textLower.Contains("лайк") || textLower.Contains("смотри полностью")))
                {
                    hasCta = true;
                }

                // 5. Коллизия таймкодов: заявленный в Markdown vs вычисленный движком (SSOT для рендера)
                if (frag.HasDeclaredTiming && Math.Abs(frag.StartSeconds - frag.DeclaredStartSeconds) > DeclaredTimingToleranceSeconds)
                {
                    issues.Add(new ScenarioIssue(
                        frag.FragmentId.Value,
                        scene.SceneId.Value,
                        IssueSeverity.Warning,
                        "TIMECODE_CONFLICT",
                        $"Заявленный таймкод {ToTimecode(frag.DeclaredStartSeconds)} конфликтует с хронометражем речи ({ToTimecode(frag.StartSeconds)}). Для рендера используется вычисленное значение."));
                }

                // 6. Потеря B-roll медиа (Edge Case: удалённый файл)
                if (frag.IsMediaMissing)
                {
                    issues.Add(new ScenarioIssue(
                        frag.FragmentId.Value,
                        scene.SceneId.Value,
                        IssueSeverity.Error,
                        "MEDIA_NOT_FOUND",
                        "Привязанный B-Roll файл отсутствует на диске. При рендере будет подставлен фолбэк-кадр."));
                }

                // 7. Потеря анимационного ассета (Lottie/AE)
                if (frag.IsAnimationMissing)
                {
                    issues.Add(new ScenarioIssue(
                        frag.FragmentId.Value,
                        scene.SceneId.Value,
                        IssueSeverity.Error,
                        "ANIMATION_NOT_FOUND",
                        "Привязанный анимационный ассет (Lottie/AE) не найден в проекте или библиотеке."));
                }

                // 8. Отсутствующие SFX-файлы
                if (frag.MissingSfx.Count > 0)
                {
                    issues.Add(new ScenarioIssue(
                        frag.FragmentId.Value,
                        scene.SceneId.Value,
                        IssueSeverity.Error,
                        "SFX_NOT_FOUND",
                        $"Звуковые эффекты не найдены в библиотеке: {string.Join(", ", frag.MissingSfx)}"));
                }
            }
        }

        if (project.Scenes.Count > 1 && !hasCta)
        {
            issues.Add(new ScenarioIssue(
                null,
                null,
                IssueSeverity.Info,
                "MISSING_CTA",
                "Не обнаружен призыв к действию (CTA) в финальных сценах ролика."));
        }

        return issues;
    }

    private static string ToTimecode(double seconds)
    {
        var ts = TimeSpan.FromSeconds(seconds);
        return ts.TotalHours >= 1
            ? ts.ToString(@"hh\:mm\:ss")
            : ts.ToString(@"mm\:ss");
    }
}
