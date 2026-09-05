using System.Text.RegularExpressions;
using ProductionContext.Domain.Entities;
using ProductionContext.Domain.Ports;
using ProductionContext.Domain.ValueObjects;

namespace ProductionContext.Infrastructure.Parsing;

public sealed partial class MarkdownScenarioParser : IScenarioParser
{
    public IReadOnlyList<Scene> ParseMarkdown(ProjectId projectId, string markdownContent)
    {
        if (string.IsNullOrWhiteSpace(markdownContent))
        {
            return [];
        }

        var lines = markdownContent.Split(["\r\n", "\r", "\n"], StringSplitOptions.None);
        var scenes = new List<Scene>();

        Scene? currentScene = null;
        int sceneCounter = 0;
        string currentVisualNote = string.Empty;

        foreach (var rawLine in lines)
        {
            var line = rawLine.Trim();
            if (string.IsNullOrWhiteSpace(line)) continue;

            var sceneMatch = SceneHeaderRegex().Match(line);
            if (sceneMatch.Success)
            {
                sceneCounter++;
                var sceneIdStr = $"scene-{sceneCounter:D2}";
                var title = sceneMatch.Groups["title"].Value.Trim();
                if (string.IsNullOrWhiteSpace(title)) title = $"Scene {sceneCounter}";

                currentScene = Scene.Create(projectId, new SceneId(sceneIdStr), sceneCounter - 1, title, "");
                scenes.Add(currentScene);
                currentVisualNote = string.Empty;
                continue;
            }

            var visualMatch = VisualNoteRegex().Match(line);
            if (visualMatch.Success)
            {
                currentVisualNote = visualMatch.Groups["note"].Value.Trim();
                if (currentScene != null && string.IsNullOrWhiteSpace(currentScene.VisualNote))
                {
                    currentScene.UpdateMetadata(currentScene.Title, currentVisualNote);
                }
                continue;
            }

            if (currentScene != null)
            {
                var speechText = CleanSpeechText(line);
                if (!string.IsNullOrWhiteSpace(speechText))
                {
                    currentScene.AddFragment(speechText, currentVisualNote);
                }
            }
        }

        if (scenes.Count == 0 && !string.IsNullOrWhiteSpace(markdownContent))
        {
            var singleScene = Scene.Create(projectId, new SceneId("scene-01"), 0, "Main Scene", "");
            var cleanText = CleanSpeechText(markdownContent);
            if (!string.IsNullOrWhiteSpace(cleanText))
            {
                singleScene.AddFragment(cleanText, "Default visual presentation");
                scenes.Add(singleScene);
            }
        }

        return scenes;
    }

    private static string CleanSpeechText(string line)
    {
        var match = DialoguePrefixRegex().Match(line);
        return (match.Success ? match.Groups["text"].Value : line).Trim('*', '_', ' ', '"');
    }

    [GeneratedRegex(@"^#{2,3}\s+(?:Scene|Сцена)?\s*\d*[:\.\-]?\s*(?<title>.*)$", RegexOptions.IgnoreCase)]
    private static partial Regex SceneHeaderRegex();

    [GeneratedRegex(@"^[\[\(](?:Visual|Визуал|План)[:\s]+(?<note>[^\]\)]+)[\]\)]", RegexOptions.IgnoreCase)]
    private static partial Regex VisualNoteRegex();

    [GeneratedRegex(@"^(?:Narrator|Voice|Voiceover|Диктор|Голос)[:\s]+(?<text>.*)$", RegexOptions.IgnoreCase)]
    private static partial Regex DialoguePrefixRegex();
}
