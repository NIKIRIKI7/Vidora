using System.Text.Json;
using System.Text.RegularExpressions;
using Kernel.Platform.Config;
using Kernel.Platform.FileSystem;
using Kernel.Platform.Process;
using MediaContext.Domain.Ports;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace MediaContext.Infrastructure.Catalog;

/// <summary>
/// Провайдер каталога фоновой музыки и BGM треков из локального хранилища.
/// Каждый подкаталог <c>data_storage/music/&lt;category&gt;</c> трактуется как жанровая категория.
/// </summary>
public sealed partial class LocalMusicCatalogProvider : IMusicCatalogProvider
{
    private const string UnknownCategory = "generic";
    private const string DefaultMood = "neutral";
    private const int FallbackDurationSeconds = 120;

    private readonly IPathResolver _pathResolver;
    private readonly AppStorageConfig _storageConfig;
    private readonly IProcessSupervisor _processSupervisor;
    private readonly ILogger<LocalMusicCatalogProvider> _logger;

    public LocalMusicCatalogProvider(
        IPathResolver pathResolver,
        IOptions<AppStorageConfig> storageConfig,
        IProcessSupervisor processSupervisor,
        ILogger<LocalMusicCatalogProvider> logger)
    {
        _pathResolver = pathResolver;
        _storageConfig = storageConfig.Value;
        _processSupervisor = processSupervisor;
        _logger = logger;
    }

    public async Task<IReadOnlyList<MusicTrackInfo>> GetTracksAsync(string? mood = null, CancellationToken ct = default)
    {
        var musicDir = _pathResolver.ResolveSafePath(_storageConfig.GetMusicDirectory());
        _logger.LogDebug("[MusicCatalog] Сканирование каталога музыки: {Dir}, mood={Mood}", musicDir, mood);

        var list = new List<MusicTrackInfo>();

        if (!Directory.Exists(musicDir))
        {
            _logger.LogDebug("[MusicCatalog] Каталог музыки не найден: {Dir}", musicDir);
            return list;
        }

        // 1. Треки в подкаталогах (категория = имя подкаталога)
        foreach (var categoryDir in Directory.GetDirectories(musicDir))
        {
            var category = SanitizeCategory(Path.GetFileName(categoryDir));
            foreach (var file in Directory.GetFiles(categoryDir, "*.*"))
            {
                if (!IsAudioFile(file)) continue;
                ct.ThrowIfCancellationRequested();
                var track = await InspectTrackAsync(file, category, ct);
                if (track != null) list.Add(track);
            }
        }

        // 2. Треки прямо в корне music/ (без категории)
        foreach (var file in Directory.GetFiles(musicDir, "*.*"))
        {
            if (!IsAudioFile(file)) continue;
            ct.ThrowIfCancellationRequested();
            var track = await InspectTrackAsync(file, UnknownCategory, ct);
            if (track != null) list.Add(track);
        }

        _logger.LogDebug("[MusicCatalog] Найдено треков: {Count}", list.Count);

        if (!string.IsNullOrWhiteSpace(mood))
        {
            list = list.Where(t => t.Mood.Equals(mood.Trim(), StringComparison.OrdinalIgnoreCase)).ToList();
        }

        return list;
    }

    private async Task<MusicTrackInfo?> InspectTrackAsync(string file, string category, CancellationToken ct)
    {
        try
        {
            var fileName = Path.GetFileNameWithoutExtension(file);
            var safeName = MultipleSpacesRegex().Replace(fileName.Trim(), " ").Trim();
            var id = BuildTrackId(category, safeName);
            var bpm = ParseBpmFromFileName(safeName);
            var duration = await ProbeDurationAsync(file, ct);

            return new MusicTrackInfo(
                Id: id,
                Name: safeName,
                Genre: category,
                Mood: DefaultMood,
                DurationSeconds: duration,
                FilePath: file,
                TempoBpm: bpm);
        }
        catch (Exception ex)
        {
            _logger.LogDebug(ex, "[MusicCatalog] Не удалось исследовать файл {File}", file);
            return null;
        }
    }

    private async Task<double> ProbeDurationAsync(string file, CancellationToken ct)
    {
        try
        {
            var args = $"-v error -show_entries format=duration -of json \"{file}\"";
            var result = await _processSupervisor.RunAsync("ffprobe", args, cancellationToken: ct);

            if (result.ExitCode == 0 && !string.IsNullOrWhiteSpace(result.StandardOutput))
            {
                using var doc = JsonDocument.Parse(result.StandardOutput);
                if (doc.RootElement.TryGetProperty("format", out var format) &&
                    format.TryGetProperty("duration", out var durationProp) &&
                    durationProp.ValueKind == JsonValueKind.Number &&
                    durationProp.TryGetDouble(out var seconds) &&
                    seconds > 0)
                {
                    return Math.Round(seconds, 2);
                }
            }
        }
        catch (Exception ex)
        {
            _logger.LogDebug(ex, "[MusicCatalog] ffprobe не доступен для {File}", file);
        }

        // Fallback: оцениваем длительность по размеру файла (~40 KB/s для mp3 320kbps с запасом)
        try
        {
            var length = new FileInfo(file).Length;
            var estimate = length / 32000.0;
            if (estimate > 0) return Math.Round(Math.Clamp(estimate, 10, FallbackDurationSeconds), 2);
        }
        catch
        {
        }

        return FallbackDurationSeconds;
    }

    private static string BuildTrackId(string category, string name)
    {
        var cleanCategory = string.IsNullOrWhiteSpace(category) ? UnknownCategory : category;
        var cleanName = Regex.Replace(name.ToLowerInvariant(), @"[^a-z0-9\u0400-\u04FF]+", "-").Trim('-');
        return $"local-{cleanCategory}-{cleanName}";
    }

    private static int ParseBpmFromFileName(string name)
    {
        var match = BpmRegex().Match(name);
        if (match.Success && int.TryParse(match.Groups[1].Value, out var bpm))
        {
            return Math.Clamp(bpm, 40, 240);
        }
        return 120;
    }

    private static string SanitizeCategory(string category) =>
        string.IsNullOrWhiteSpace(category)
            ? UnknownCategory
            : MultipleSpacesRegex().Replace(category.Trim(), " ").ToLowerInvariant();

    private static bool IsAudioFile(string file)
    {
        var ext = Path.GetExtension(file);
        return ext.Equals(".mp3", StringComparison.OrdinalIgnoreCase) ||
               ext.Equals(".wav", StringComparison.OrdinalIgnoreCase) ||
               ext.Equals(".flac", StringComparison.OrdinalIgnoreCase) ||
               ext.Equals(".ogg", StringComparison.OrdinalIgnoreCase) ||
               ext.Equals(".m4a", StringComparison.OrdinalIgnoreCase);
    }

    [GeneratedRegex(@"(\d{2,3})\s*bpm", RegexOptions.IgnoreCase)]
    private static partial Regex BpmRegex();

    [GeneratedRegex(@"\s+")]
    private static partial Regex MultipleSpacesRegex();
}