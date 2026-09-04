using System.Text.RegularExpressions;
using Kernel.Exceptions;
using Microsoft.Extensions.Logging;
using MotionContext.Domain.Ports;
using MotionContext.Domain.ValueObjects;

namespace MotionContext.Infrastructure.Parsing;

public sealed partial class TsxSanitizer : ITsxSanitizer
{
    private readonly IPackageCapabilityRegistry _registry;
    private readonly ILogger<TsxSanitizer> _logger;

    private static readonly HashSet<string> ForbiddenTokens = new(StringComparer.Ordinal)
    {
        "eval(", "Function(", "window.", "document.", "localStorage",
        "sessionStorage", "fetch(", "XMLHttpRequest", "WebSocket",
        "process.env", "process.exit", "require(", "child_process", "fs."
    };

    public TsxSanitizer(
        IPackageCapabilityRegistry registry,
        ILogger<TsxSanitizer> logger)
    {
        _registry = registry;
        _logger = logger;
    }

    public SanitizationResult SanitizeAndValidate(string rawTsx)
    {
        if (string.IsNullOrWhiteSpace(rawTsx))
        {
            _logger.LogWarning("[TsxSanitizer] Получен пустой код TSX для валидации.");
            throw new ValidationException("tsx", "Передан пустой исходный код.");
        }

        _logger.LogDebug("[TsxSanitizer] Старт анализа ({Length} символов)...", rawTsx.Length);

        foreach (var token in ForbiddenTokens)
        {
            if (rawTsx.Contains(token, StringComparison.OrdinalIgnoreCase))
            {
                _logger.LogWarning("[TsxSanitizer] НАРУШЕНИЕ БЕЗОПАСНОСТИ: запрещенный токен '{Token}'", token);
                throw new ValidationException("security",
                    $"Обнаружен запрещенный токен безопасности '{token}'. Доступ к глобальным API среды выполнения заблокирован.");
            }
        }

        var importMatches = ImportStatementRegex().Matches(rawTsx);
        var detectedCaps = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        foreach (Match match in importMatches)
        {
            var packageSource = match.Groups["source"].Value.Trim('\'', '"');
            if (!_registry.IsPackageAllowed(packageSource))
            {
                _logger.LogWarning("[TsxSanitizer] БЛОКИРОВКА ИМПОРТА: пакет '{Package}' запрещен", packageSource);
                throw new ValidationException("imports",
                    $"Импорт пакета '{packageSource}' запрещен политикой безопасности песочницы Motion.");
            }

            var capability = _registry.Find(packageSource);
            if (capability != null)
            {
                detectedCaps.Add(capability.Id);
            }
        }

        var (processedCode, replacedIcons) = ReplaceMissingLucideIcons(rawTsx);
        if (replacedIcons.Count > 0)
        {
            _logger.LogInformation("[TsxSanitizer] Автоподмена невалидных иконок Lucide: {Icons}",
                string.Join(", ", replacedIcons));
        }

        if (!ExportRegex().IsMatch(processedCode))
        {
            _logger.LogWarning("[TsxSanitizer] Отсутствует экспорт компонента Remotion.");
            throw new ValidationException("structure",
                "Сгенерированный файл должен содержать 'export default' компонента или 'export const Scene'.");
        }

        _logger.LogDebug("[TsxSanitizer] Код верифицирован. Обнаружено возможностей: {Count} ({Caps})",
            detectedCaps.Count, string.Join(", ", detectedCaps));

        return new SanitizationResult(
            new TsxCode(processedCode),
            detectedCaps.ToList(),
            replacedIcons);
    }

    private static (string Code, IReadOnlyList<string> Replaced) ReplaceMissingLucideIcons(string source)
    {
        var match = LucideImportRegex().Match(source);
        if (!match.Success) return (source, []);

        var specifiersGroup = match.Groups["specifiers"].Value;
        var importedItems = specifiersGroup.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
        var replaced = new List<string>();

        if (importedItems.Length == 0)
        {
            var fixedImport = "import { Sparkles } from 'lucide-react';";
            return (source.Replace(match.Value, fixedImport), ["DefaultFallback"]);
        }

        return (source, replaced);
    }

    [GeneratedRegex(@"import\s+[\s\S]*?\s+from\s+['""](?<source>[^'""]+)['""];?")]
    private static partial Regex ImportStatementRegex();

    [GeneratedRegex(@"import\s+\{(?<specifiers>[\s\S]*?)\}\s+from\s+['""]lucide-react['""];?")]
    private static partial Regex LucideImportRegex();

    [GeneratedRegex(@"(export\s+default\s+(function|const)?)|(export\s+const\s+Scene)")]
    private static partial Regex ExportRegex();
}
