namespace ProductionContext.Domain.ValueObjects;

/// <summary>
/// Единый источник правды (SSOT) по темпу озвучки в словах в секунду.
/// Источник: docs/SKILL_TECH_SCENARIST.md — «2.5 слова текста озвучки = 1 секунда».
/// Значение синхронизировано с frontend/src/shared/config/pacing.ts.
/// </summary>
public static class SpeechPacingDefaults
{
    /// <summary>Профессиональный дикторский темп: ~150 слов/мин.</summary>
    public const double WordsPerSecond = 2.5;

    /// <summary>Минимальная длительность фрагмента озвучки (сек).</summary>
    public const double MinFragmentSeconds = 1.0;

    /// <summary>Минимальная длительность сцены целиком (сек).</summary>
    public const double MinSceneSeconds = 0.5;
}