using MotionContext.Domain.Ports;

namespace MotionContext.Infrastructure.Parsing;

public sealed class LlmCodeExtractor : ILlmCodeExtractor
{
    private readonly ITsxSanitizer _sanitizer;

    public LlmCodeExtractor(ITsxSanitizer sanitizer)
    {
        _sanitizer = sanitizer;
    }

    public SanitizationResult ExtractAndSanitize(string rawLlmResponse)
    {
        var cleanedCode = CleanMarkdownFences(rawLlmResponse);
        return _sanitizer.SanitizeAndValidate(cleanedCode);
    }

    private static string CleanMarkdownFences(string response)
    {
        if (string.IsNullOrWhiteSpace(response)) return string.Empty;

        var trimmed = response.Trim();
        if (!trimmed.StartsWith("```")) return trimmed;

        var lines = trimmed.Split('\n').ToList();
        if (lines.Count >= 2 && lines[^1].Trim().StartsWith("```"))
        {
            lines.RemoveAt(lines.Count - 1);
            lines.RemoveAt(0);
            return string.Join('\n', lines).Trim();
        }

        return trimmed;
    }
}
