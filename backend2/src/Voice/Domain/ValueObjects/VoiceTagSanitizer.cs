using System.Text.RegularExpressions;

namespace Voice.Domain.ValueObjects;

/// <summary>
/// Единый источник правды по голосовым тегам диктора (SSOT), описанным в docs/SKILL_TECH_SCENARIST.md:
///   [emotion: X] — эмоция фрагмента (happy/sad/angry/fearful/disgusted/surprised/calm);
///   (breath|inhale|exhale|sighs|chuckle|laughs|coughs|groans|gasps|sniffs|clear-throat|emm) — междометия;
///   &lt;#X#&gt; — драматическая пауза (0.1..99.99 сек).
/// Теги не произносятся и не учитываются при расчёте таймкодов и длительности.
/// </summary>
public static partial class VoiceTagSanitizer
{
    public const double MinPauseSeconds = 0.1;
    public const double MaxPauseSeconds = 3.0;

    /// <summary>
    /// Удаляет все теги (эмоции, междометия, паузы). Используется для подсчёта чистых
    /// слов при расчёте таймкодов и для экспорта «текста для озвучки».
    /// </summary>
    public static string RemoveAllTags(string text)
    {
        if (string.IsNullOrWhiteSpace(text)) return text;
        var clean = EmotionTagRegex().Replace(text, "");
        clean = PauseTagRegex().Replace(clean, "");
        clean = SoundTagRegex().Replace(clean, "");
        return AllSpacesRegex().Replace(clean, " ").Trim();
    }

    /// <summary>
    /// Нормализация текста ПЕРЕД синтезом: эмоции и междометия удаляются (движок не умеет
    /// их отыгрывать), драматическая пауза превращается в запятую, пробелы схлопываются.
    /// </summary>
    public static string NormalizeForSynthesis(string text)
    {
        if (string.IsNullOrWhiteSpace(text)) return text;
        var clean = EmotionTagRegex().Replace(text, "");
        clean = PauseTagRegex().Replace(clean, ", ");
        clean = SoundTagRegex().Replace(clean, "");
        return AllSpacesRegex().Replace(clean, " ").Trim();
    }

    /// <summary>
    /// Возвращает сумму длительностей пауз (в секундах), объявленных тегом &lt;#X#&gt;.
    /// Значения вне допустимого диапазона (0.1..3.0) игнорируются согласно правилу драматургии.
    /// </summary>
    public static double GetTotalPauseSeconds(string text)
    {
        if (string.IsNullOrWhiteSpace(text)) return 0.0;

        double total = 0.0;
        foreach (Match match in PauseTagRegex().Matches(text))
        {
            var x = match.Groups[1].Value;
            if (double.TryParse(x, System.Globalization.CultureInfo.InvariantCulture, out var seconds))
            {
                if (seconds >= MinPauseSeconds && seconds <= MaxPauseSeconds)
                {
                    total += seconds;
                }
            }
        }

        return total;
    }

    [GeneratedRegex(@"\[emotion:\s*\w+\]", RegexOptions.IgnoreCase)]
    private static partial Regex EmotionTagRegex();

    [GeneratedRegex(@"<#(\d+(?:\.\d+)?)#>", RegexOptions.IgnoreCase)]
    private static partial Regex PauseTagRegex();

    [GeneratedRegex(@"\((breath|inhale|exhale|sighs|chuckle|laughs|coughs|groans|gasps|sniffs|clear-throat|emm)\)", RegexOptions.IgnoreCase)]
    private static partial Regex SoundTagRegex();

    [GeneratedRegex(@"\s+")]
    private static partial Regex AllSpacesRegex();
}