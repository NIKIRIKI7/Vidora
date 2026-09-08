using System;
using System.Globalization;

namespace MediaContext.Infrastructure.Normalization;

/// <summary>
/// Параметры нормализации б-ролла (секция конфигурации "Media:Normalization").
/// VideoCodec/Preset/Crf применяются к итоговому файлу; AudioCodec зафиксирован
/// декларативно (b-ролл сознательно рендерится без звуковой дорожки: -an).
/// </summary>
public sealed class BrollNormalizationOptions
{
    public const string SectionName = "Media:Normalization";

    public string VideoCodec { get; set; } = "libx264";
    public string Preset { get; set; } = "veryfast";
    public string AudioCodec { get; set; } = "aac";
    public double Crf { get; set; } = 22.0;

    public string CrfInvariantText => Crf.ToString("0.##", CultureInfo.InvariantCulture);
}