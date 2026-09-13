using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace Integrations.YouTube.Innertube.Extractors;

public static class JsonElementExtensions
{
    public static string ExtractRunsText(this JsonElement element, string propertyName)
    {
        if (!element.TryGetProperty(propertyName, out var prop))
            return string.Empty;

        if (prop.ValueKind == JsonValueKind.String)
            return prop.GetString() ?? string.Empty;

        if (prop.TryGetProperty("simpleText", out var st))
            return st.GetString() ?? string.Empty;

        if (prop.TryGetProperty("runs", out var runs) && runs.ValueKind == JsonValueKind.Array)
        {
            var sb = new StringBuilder();
            foreach (var r in runs.EnumerateArray())
            {
                if (r.TryGetProperty("text", out var t))
                    sb.Append(t.GetString());
            }
            return sb.ToString();
        }

        return string.Empty;
    }

    public static long ParseSubscriberCount(this JsonElement element, string propertyName)
    {
        var text = element.ExtractRunsText(propertyName);
        return InnerTubeParsers.ParseCount(text);
    }

    public static int ParseDurationStringToSeconds(this JsonElement element, string propertyName)
    {
        var text = element.ExtractRunsText(propertyName);
        return InnerTubeParsers.ParseDurationToSeconds(text);
    }
}

public static partial class InnerTubeParsers
{
    /// <summary>
    /// Мультиязычный парсер чисел. Ищет числовой блок и опциональный множитель,
    /// игнорируя любые сопутствующие слова (views, просмотров, vistas, abonnenten).
    /// Поддерживает: RU, EN, ES, DE, PT, FR и др.
    /// </summary>
    public static long ParseCount(string raw)
    {
        if (string.IsNullOrWhiteSpace(raw)) return 0;

        // Заменяем неразрывные пробелы на обычные и переводим в нижний регистр
        var normalized = raw.ToLowerInvariant().Replace("\u00a0", " ");

        var match = CountPatternRegex().Match(normalized);
        if (!match.Success) return 0;

        var numberPart = match.Groups[1].Value;
        var multiplierPart = match.Groups[2].Value.Trim();

        // Если найден текстовый множитель (K, M, B, млн, mil, mio и т.д.)
        if (!string.IsNullOrEmpty(multiplierPart))
        {
            // Убираем всё, кроме цифр и разделителей (.), (,)
            // Затем приводим запятую к точке, чтобы C# корректно распарсил дробное число (например, 1.5M или 1,5 млн)
            var cleanNumber = new string(numberPart.Where(c => char.IsDigit(c) || c == '.' || c == ',').ToArray())
                                  .Replace(',', '.');

            if (double.TryParse(cleanNumber, System.Globalization.NumberStyles.Float, System.Globalization.CultureInfo.InvariantCulture, out var val))
            {
                double mult = 1.0;

                // Тысячи (English, Russian, Spanish/Portuguese)
                if (multiplierPart is "k" or "к" or "тыс" or "mil")
                    mult = 1_000;
                // Миллионы (English, Russian, Spanish/German/French)
                else if (multiplierPart is "m" or "м" or "млн" or "mio" or "mi")
                    mult = 1_000_000;
                // Миллиарды (English, Russian, Spanish)
                else if (multiplierPart is "b" or "б" or "млрд" or "bi" or "bn")
                    mult = 1_000_000_000;

                return (long)(val * mult);
            }
        }
        else
        {
            // Если множителя нет, это точное число (например: "1,234,567 views" или "1 234 567 просмотров").
            // Просто извлекаем все цифры подряд и парсим как целое число.
            var cleanDigits = new string(numberPart.Where(char.IsDigit).ToArray());
            if (long.TryParse(cleanDigits, out var exactVal))
            {
                return exactVal;
            }
        }

        return 0;
    }

    public static int ParseDurationToSeconds(string duration)
    {
        if (string.IsNullOrWhiteSpace(duration)) return 0;

        var parts = duration.Split(':');
        try
        {
            if (parts.Length == 3) return int.Parse(parts[0]) * 3600 + int.Parse(parts[1]) * 60 + int.Parse(parts[2]);
            if (parts.Length == 2) return int.Parse(parts[0]) * 60 + int.Parse(parts[1]);
            if (parts.Length == 1 && int.TryParse(parts[0], out var s)) return s;
        }
        catch { }

        return 0;
    }

    // Регулярное выражение ищет первую группу символов с цифрами/точками/запятыми/пробелами,
    // и опционально захватывает за ней буквенный множитель
    [GeneratedRegex(@"([\d\s\.,]+)\s*(тыс|млн|млрд|mil|mio|mi|bi|bn|k|m|b|к|м|б)?", RegexOptions.IgnoreCase)]
    private static partial Regex CountPatternRegex();
}
