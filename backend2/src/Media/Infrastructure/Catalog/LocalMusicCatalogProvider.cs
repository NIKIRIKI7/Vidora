using Kernel.Platform.Config;
using Kernel.Platform.FileSystem;
using MediaContext.Contracts;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace MediaContext.Infrastructure.Catalog;

/// <summary>
/// Провайдер каталога фоновой музыки и BGM треков из локального хранилища.
/// </summary>
public sealed class LocalMusicCatalogProvider : IMusicCatalogProvider
{
    private readonly IPathResolver _pathResolver;
    private readonly AppStorageConfig _storageConfig;
    private readonly ILogger<LocalMusicCatalogProvider> _logger;

    private static readonly IReadOnlyList<MusicTrackDto> EmbeddedDefaults =
    [
        new("track-ambient-chill", "Lo-Fi Dream Flow", "Lo-Fi / Chill", "peaceful", 145.0, "music/lofi_dream.mp3", 85),
        new("track-cyber-synth", "Neon Skyline Runner", "Synthwave", "energetic", 128.0, "music/neon_skyline.mp3", 120),
        new("track-epic-trailer", "Rise to Dominance", "Cinematic", "dramatic", 160.0, "music/rise_dominance.mp3", 110),
        new("track-corporate-tech", "Clean Innovations", "Corporate", "inspirational", 118.0, "music/clean_tech.mp3", 124)
    ];

    public LocalMusicCatalogProvider(
        IPathResolver pathResolver,
        IOptions<AppStorageConfig> storageConfig,
        ILogger<LocalMusicCatalogProvider> logger)
    {
        _pathResolver = pathResolver;
        _storageConfig = storageConfig.Value;
        _logger = logger;
    }

    public Task<IReadOnlyList<MusicTrackDto>> GetTracksAsync(string? mood = null, CancellationToken ct = default)
    {
        var musicDir = Path.Combine(_storageConfig.DataStorageDir, "music");
        var fullMusicDir = _pathResolver.ResolveSafePath(Path.GetFullPath(musicDir));

        _logger.LogDebug("[MusicCatalog] Поиск треков в {Dir}, mood={Mood}", fullMusicDir, mood);

        var list = new List<MusicTrackDto>(EmbeddedDefaults);

        if (Directory.Exists(fullMusicDir))
        {
            var audioFiles = Directory.GetFiles(fullMusicDir, "*.*")
                .Where(f => f.EndsWith(".mp3", StringComparison.OrdinalIgnoreCase) ||
                            f.EndsWith(".wav", StringComparison.OrdinalIgnoreCase));

            foreach (var file in audioFiles)
            {
                var fileName = Path.GetFileNameWithoutExtension(file);
                if (list.All(t => !t.FilePath.EndsWith(Path.GetFileName(file), StringComparison.OrdinalIgnoreCase)))
                {
                    list.Add(new MusicTrackDto(
                        Id: $"local-{Guid.NewGuid():N}"[..16],
                        Name: fileName.Replace('_', ' '),
                        Genre: "Local Media",
                        Mood: "neutral",
                        DurationSeconds: 120.0,
                        FilePath: file,
                        TempoBpm: 120));
                }
            }
        }

        if (!string.IsNullOrWhiteSpace(mood))
        {
            list = list.Where(t => t.Mood.Equals(mood.Trim(), StringComparison.OrdinalIgnoreCase)).ToList();
        }

        return Task.FromResult<IReadOnlyList<MusicTrackDto>>(list);
    }
}
