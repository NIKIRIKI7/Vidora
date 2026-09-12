using System.Text;
using System.Text.RegularExpressions;
using ProductionContext.Domain.Entities;
using ProductionContext.Domain.Ports;
using ProductionContext.Domain.ScenarioEngine;
using ProductionContext.Domain.ValueObjects;

namespace ProductionContext.Infrastructure.Parsing;

/// <summary>
/// Левый блок архитектуры: Structural &amp; Asset Manager.
///
/// Толерантный Lexer/Parser сценария: превращает SCENARIO.md в AST
/// (<see cref="ScenarioAstDocument"/>) и обратно (двусторонняя синхронизация).
/// Не падает на пользовательских опечатках — изолирует «битую» строку в рамках
/// одного фрагмента. Дополнительно вычленяет из текста:
///   - ссылки на медиафайлы (B-roll: assets/clip.mp4);
///   - ссылки на готовые анимации (Anim/Lottie: *.json);
///   - звуковые эффекты ([SFX: swoosh.mp3]) и убирает их из текста диктора;
///   - маркеры переходов ([Transition: fade]).
/// </summary>
public sealed partial class ScenarioAstParser : IScenarioParser, IScenarioAstService
{
    // ---- Contract IScenarioParser (совместимость с существующим пайплайном) ----

    public IReadOnlyList<Scene> ParseMarkdown(ProjectId projectId, string markdownContent)
    {
        if (string.IsNullOrWhiteSpace(markdownContent)) return [];

        var ast = ParseToAst(markdownContent);
        return MapAstToEntities(projectId, ast);
    }

    // ---- Левый блок: Markdown -> AST ----

    public ScenarioAstDocument ParseToAst(string markdown)
    {
        var lines = markdown.Split(["\r\n", "\r", "\n"], StringSplitOptions.None);
        var scenes = new List<AstScene>();

        var frontmatter = new AstFrontmatter(
            Title: "Untitled",
            Fps: 30,
            AspectRatio: string.Empty,
            Colors: new Dictionary<string, string>());

        bool inYaml = false;

        var currentNodes = new List<AstNode>();
        string? sceneTitle = null;
        string? sceneTime = null;

        string? pendingVisualNote = null;
        string? pendingTimeStart = null;
        string? pendingTimeEnd = null;
        var speechBuffer = new List<string>();

        void FlushFragment()
        {
            if (speechBuffer.Count == 0 && string.IsNullOrWhiteSpace(pendingVisualNote))
            {
                speechBuffer.Clear();
                pendingVisualNote = null;
                pendingTimeStart = null;
                pendingTimeEnd = null;
                return;
            }

            var rawSpeech = string.Join(" ", speechBuffer).Trim();
            var rawVisual = pendingVisualNote ?? string.Empty;

            // Звуковые эффекты [SFX: pop.mp3] ищем в полном «сыром» тексте,
            // но из озвучки тег вырезаем, чтобы диктор его не прочитал.
            var sfxList = new List<string>();
            foreach (Match m in SfxRegex().Matches(rawSpeech + " " + rawVisual))
            {
                if (!sfxList.Contains(m.Groups["sfx"].Value.Trim()))
                {
                    sfxList.Add(m.Groups["sfx"].Value.Trim());
                }
            }

            var spokenText = SfxRegex().Replace(rawSpeech, "").Trim();
            var visualNote = SfxRegex().Replace(rawVisual, "").Trim();

            // Привязка медиафайла (B-roll / media)
            var mediaMatch = MediaLinkRegex().Match(visualNote);
            string? mediaLink = mediaMatch.Success ? mediaMatch.Groups["link"].Value.Trim() : null;

            // Привязка готовой анимации (Anim/Lottie/AE-пререндер)
            var animMatch = AnimLinkRegex().Match(visualNote);
            string? animLink = animMatch.Success ? animMatch.Groups["link"].Value.Trim() : null;

            // Эвристика типа текстовой анимации по лексике ремарки
            string? animType = null;
            if (visualNote.Contains("выезжает", StringComparison.OrdinalIgnoreCase)) animType = "slide";
            if (visualNote.Contains("появляется", StringComparison.OrdinalIgnoreCase)) animType = "fade";
            if (visualNote.Contains("вылетает", StringComparison.OrdinalIgnoreCase)) animType = "pop";

            currentNodes.Add(new AstFragment(
                visualNote,
                spokenText,
                pendingTimeStart,
                pendingTimeEnd,
                mediaLink,
                animType,
                animLink,
                sfxList));

            speechBuffer.Clear();
            pendingVisualNote = null;
            pendingTimeStart = null;
            pendingTimeEnd = null;
        }

        void FlushScene()
        {
            FlushFragment();
            if (sceneTitle != null || currentNodes.Count > 0)
            {
                scenes.Add(new AstScene(sceneTitle ?? "Без названия", sceneTime, currentNodes.ToList()));
            }
            currentNodes.Clear();
            sceneTitle = null;
            sceneTime = null;
        }

        foreach (var rawLine in lines)
        {
            var line = rawLine.Trim();
            if (string.IsNullOrWhiteSpace(line)) continue;

            // YAML-frontmatter (только в начале документа)
            if (line == "---")
            {
                if (!inYaml && scenes.Count == 0 && sceneTitle == null)
                {
                    inYaml = true;
                    continue;
                }
                if (inYaml)
                {
                    inYaml = false;
                    continue;
                }
                continue;
            }
            if (inYaml)
            {
                frontmatter = TryMapFrontmatterLine(frontmatter, line);
                continue;
            }

            // Игнорируемые Markdown-конструкции
            if (IsIgnoredToken(line)) continue;

            // Токен: Переход (отдельный AST-узел, связывает соседние сцены на рендере)
            var transMatch = TransitionRegex().Match(line);
            if (transMatch.Success)
            {
                FlushFragment();
                currentNodes.Add(new AstTransition(
                    transMatch.Groups["type"].Value.Trim(),
                    line.Trim()));
                continue;
            }

            // Токен: Заголовок сцены — [Название] (00:00:00)
            var sceneMatch = SceneHeaderRegex().Match(line);
            if (sceneMatch.Success)
            {
                FlushScene();
                sceneTitle = sceneMatch.Groups["title"].Value.Trim();
                sceneTime = sceneMatch.Groups["time"].Success
                    ? sceneMatch.Groups["time"].Value.Trim()
                    : null;
                continue;
            }

            // Токен: Визуальная ремарка *(...)* [возможный текст реплики]
            var visualMatch = VisualNoteRegex().Match(line);
            if (visualMatch.Success)
            {
                FlushFragment();

                var noteBody = visualMatch.Groups["body"].Value.Trim();
                var timecodeMatch = RemarkTimecodeRegex().Match(noteBody);
                if (timecodeMatch.Success)
                {
                    pendingTimeStart = timecodeMatch.Groups["start"].Value;
                    pendingTimeEnd = timecodeMatch.Groups["end"].Value;
                    pendingVisualNote = timecodeMatch.Groups["note"].Value.Trim();
                }
                else
                {
                    pendingVisualNote = noteBody;
                    pendingTimeStart = null;
                    pendingTimeEnd = null;
                }

                var leftover = line[visualMatch.Length..].Trim();
                if (!string.IsNullOrWhiteSpace(leftover))
                {
                    speechBuffer.Add(CleanSpeechText(leftover));
                }
                continue;
            }

            // Токен: строка озвучки (продолжение предыдущей ремарки)
            speechBuffer.Add(CleanSpeechText(line));
        }

        FlushScene();
        return new ScenarioAstDocument(frontmatter, scenes);
    }

    // ---- Левый блок: AST -> Markdown (Two-Way Binding / сериализатор) ----

    public string SerializeAstToMarkdown(ScenarioAstDocument ast)
    {
        ArgumentNullException.ThrowIfNull(ast);

        var sb = new StringBuilder();
        sb.AppendLine("---");
        sb.AppendLine($"title: \"{ast.Frontmatter.Title}\"");
        sb.AppendLine($"fps: {ast.Frontmatter.Fps}");
        if (!string.IsNullOrWhiteSpace(ast.Frontmatter.AspectRatio))
        {
            sb.AppendLine($"aspect_ratio: \"{ast.Frontmatter.AspectRatio}\"");
        }
        foreach (var (key, hex) in ast.Frontmatter.Colors)
        {
            sb.AppendLine($"{key}: \"{hex}\"");
        }
        sb.AppendLine("---");
        sb.AppendLine();

        foreach (var scene in ast.Scenes)
        {
            var time = scene.DeclaredTimecode != null ? $" ({scene.DeclaredTimecode})" : string.Empty;
            sb.AppendLine($"[{scene.Title}]{time}");

            foreach (var node in scene.Nodes)
            {
                switch (node)
                {
                    case AstTransition transition:
                        sb.AppendLine($"[Transition: {transition.TransitionType}]");
                        break;

                    case AstFragment fragment:
                        var timing = fragment.DeclaredTimeStart != null && fragment.DeclaredTimeEnd != null
                            ? $"{fragment.DeclaredTimeStart} - {fragment.DeclaredTimeEnd}: "
                            : string.Empty;

                        if (!string.IsNullOrWhiteSpace(fragment.VisualNote))
                        {
                            sb.Append($"*({timing}{fragment.VisualNote})*");
                        }
                        if (!string.IsNullOrWhiteSpace(fragment.VisualNote) && !string.IsNullOrWhiteSpace(fragment.SpokenText))
                        {
                            sb.Append(' ');
                        }
                        if (!string.IsNullOrWhiteSpace(fragment.SpokenText))
                        {
                            sb.Append(fragment.SpokenText);
                        }
                        sb.AppendLine();
                        break;
                }
            }

            sb.AppendLine();
        }

        return sb.ToString().TrimEnd() + "\n";
    }

    // ---- Маппинг AST -> доменные сущности (Scene/SceneFragment) ----

    public IReadOnlyList<Scene> MapAstToEntities(ProjectId projectId, ScenarioAstDocument ast)
    {
        ArgumentNullException.ThrowIfNull(ast);

        var result = new List<Scene>();
        int sceneIndex = 0;

        foreach (var astScene in ast.Scenes)
        {
            var scene = Scene.Create(
                projectId,
                new SceneId($"scene-{sceneIndex + 1:D2}"),
                sceneIndex,
                astScene.Title,
                "");

            foreach (var node in astScene.Nodes)
            {
                // Переходы в доменные сущности не маппятся — это узел для MotionContext (Remotion)
                if (node is not AstFragment fragment) continue;

                var declaredTiming = ParseTimecodeSpan(fragment.DeclaredTimeStart, fragment.DeclaredTimeEnd);
                scene.AddFragment(fragment.SpokenText, fragment.VisualNote, declaredTiming: declaredTiming);
            }

            result.Add(scene);
            sceneIndex++;
        }

        return result;
    }

    // ---- Приватные помощники ----

    private static AstFrontmatter TryMapFrontmatterLine(AstFrontmatter current, string line)
    {
        var kvp = line.Split(':', 2);
        if (kvp.Length != 2) return current;

        var key = kvp[0].Trim();
        var value = kvp[1].Trim().Trim('"', '\'');

        if (key.Equals("title", StringComparison.OrdinalIgnoreCase))
        {
            return current with { Title = value };
        }
        if (key.Equals("fps", StringComparison.OrdinalIgnoreCase)
            && int.TryParse(value, out var fps) && fps is > 0 and <= 120)
        {
            return current with { Fps = fps };
        }
        if (key.Equals("aspect_ratio", StringComparison.OrdinalIgnoreCase))
        {
            return current with { AspectRatio = value };
        }
        if (value.StartsWith('#') && value.Length is 4 or 7)
        {
            var colors = new Dictionary<string, string>(current.Colors) { [key] = value };
            return current with { Colors = colors };
        }

        return current;
    }

    private static TimecodeSpan? ParseTimecodeSpan(string? startStr, string? endStr)
    {
        if (startStr == null || endStr == null) return null;
        return TryParseSeconds(startStr, out var start) && TryParseSeconds(endStr, out var end)
            ? new TimecodeSpan(start, end)
            : null;
    }

    private static bool TryParseSeconds(string raw, out double seconds)
    {
        seconds = 0.0;
        var parts = raw.Trim().Split([':', '.'], StringSplitOptions.RemoveEmptyEntries);
        if (parts.Length is < 2 or > 3) return false;

        if (!int.TryParse(parts[0], out var first)) return false;
        if (!int.TryParse(parts[1], out var second)) return false;

        int fraction = 0;
        if (parts.Length == 3 && !int.TryParse(parts[2], out fraction)) return false;

        seconds = parts.Length switch
        {
            2 => first * 60.0 + second,
            _ => first * 3600.0 + second * 60.0 + fraction
        };
        return true;
    }

    private static string CleanSpeechText(string line)
    {
        var match = DialoguePrefixRegex().Match(line);
        return (match.Success ? match.Groups["text"].Value : line).Trim('*', '_', ' ', '"', '«', '»');
    }

    private static bool IsIgnoredToken(string line)
    {
        return CommentRegex().IsMatch(line)
            || HeadingRegex().IsMatch(line)
            || BulletRegex().IsMatch(line)
            || BlockquoteRegex().IsMatch(line)
            || HorizontalRuleRegex().IsMatch(line);
    }

    [GeneratedRegex(@"^\[(?<title>[^\]]+)\]\s*(?:\((?<time>[^)]+)\))?\s*$")]
    private static partial Regex SceneHeaderRegex();

    [GeneratedRegex(@"^\*\((?<body>.*?)\)\*")]
    private static partial Regex VisualNoteRegex();

    [GeneratedRegex(@"^\s*(?<start>\d{1,2}:\d{2}(?:[:.]\d{1,2})?)\s*[-–—]\s*(?<end>\d{1,2}:\d{2}(?:[:.]\d{1,2})?)\s*:\s*(?<note>.*)$")]
    private static partial Regex RemarkTimecodeRegex();

    [GeneratedRegex(@"^\[Transition:\s*(?<type>[^\]]+)\]", RegexOptions.IgnoreCase)]
    private static partial Regex TransitionRegex();

    [GeneratedRegex(@"(?:b-roll|broll|media):\s*(?<link>[\w\-\.\/]+\.\w{3,4})", RegexOptions.IgnoreCase)]
    private static partial Regex MediaLinkRegex();

    [GeneratedRegex(@"(?:anim|lottie|анимация):\s*(?<link>[\w\-\.\/]+\.json)", RegexOptions.IgnoreCase)]
    private static partial Regex AnimLinkRegex();

    [GeneratedRegex(@"\[SFX:\s*(?<sfx>[\w\-\.\/]+\.(?:mp3|wav|ogg))\]", RegexOptions.IgnoreCase)]
    private static partial Regex SfxRegex();

    [GeneratedRegex(@"^(?:Narrator|Voice|Voiceover|Диктор|Голос)[:\s]+(?<text>.*)$", RegexOptions.IgnoreCase)]
    private static partial Regex DialoguePrefixRegex();

    [GeneratedRegex(@"^\s*(?:<!--[\s\S]*?-->|<!--.*)$")]
    private static partial Regex CommentRegex();

    [GeneratedRegex(@"^#{1,6}\s+")]
    private static partial Regex HeadingRegex();

    [GeneratedRegex(@"^\s*(?:[-*+]\s|\d+[.)]\s)")]
    private static partial Regex BulletRegex();

    [GeneratedRegex(@"^\s*>\s?")]
    private static partial Regex BlockquoteRegex();

    [GeneratedRegex(@"^\s*[-_*]{3,}\s*$")]
    private static partial Regex HorizontalRuleRegex();
}
