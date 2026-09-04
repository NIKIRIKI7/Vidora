namespace Integrations.YouTube.Contracts;

public sealed record YouTubeDownloadOptions
{
    /// <summary>
    /// Целевая директория (если не задана, используется YouTubeOptions.DownloadDirectory).
    /// </summary>
    public string? OutputDirectory { get; init; }

    /// <summary>
    /// Имя итогового файла без расширения (по умолчанию используется ID видео).
    /// </summary>
    public string? CustomFileName { get; init; }

    /// <summary>
    /// Максимальное разрешение видео (например, 1080, 720, 2160).
    /// </summary>
    public int MaxHeight { get; init; } = 1080;

    /// <summary>
    /// Извлекать только аудиодорожку.
    /// </summary>
    public bool AudioOnly { get; init; }

    /// <summary>
    /// Формат аудио при AudioOnly = true ("mp3", "m4a", "wav").
    /// </summary>
    public string AudioFormat { get; init; } = "mp3";

    /// <summary>
    /// Включать ли скачивание субтитров.
    /// </summary>
    public bool IncludeSubtitles { get; init; }
}
