using MotionContext.Domain.ValueObjects;

namespace MotionContext.Domain.Ports;

public sealed record SanitizationResult(
    TsxCode SanitizedCode,
    IReadOnlyList<string> DetectedCapabilities,
    IReadOnlyList<string> ReplacedLucideIcons);

public interface ITsxSanitizer
{
    SanitizationResult SanitizeAndValidate(string rawTsx);
}
