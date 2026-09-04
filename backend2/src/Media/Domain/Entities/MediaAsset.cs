using Kernel.Exceptions;
using Kernel.Platform.Persistence;
using MediaContext.Domain.Events;
using MediaContext.Domain.ValueObjects;

namespace MediaContext.Domain.Entities;

/// <summary>
/// Корень агрегата медиа-ассета (Video, Audio, Image).
/// Инкапсулирует бизнес-правила нормализации, метаданных и физического владения файлами.
/// </summary>
public class MediaAsset : BaseEntity<MediaAssetId>
{
    public const int MaxTitleLength = 256;

    public string Title { get; private set; } = string.Empty;
    public MediaType Type { get; private set; }
    public AssetSource Source { get; private set; }
    public string StoragePath { get; private set; } = string.Empty;
    public string Extension { get; private set; } = string.Empty;
    public long FileSizeBytes { get; private set; }

    public MediaDimensions? Dimensions { get; private set; }
    public MediaDuration? Duration { get; private set; }
    public double? Fps { get; private set; }

    public bool IsNormalized { get; private set; }
    public string? NormalizedStoragePath { get; private set; }
    public string? Sha256Hash { get; private set; }

    protected MediaAsset() { }

    public static MediaAsset Create(
        MediaAssetId id,
        string title,
        MediaType type,
        AssetSource source,
        string storagePath,
        string extension,
        long fileSizeBytes,
        MediaDimensions? dimensions = null,
        MediaDuration? duration = null,
        double? fps = null,
        string? sha256Hash = null)
    {
        if (string.IsNullOrWhiteSpace(title))
        {
            throw new ValidationException("title", "Название ассета не может быть пустым.");
        }

        if (title.Trim().Length > MaxTitleLength)
        {
            throw new ValidationException("title", $"Название ассета не должно превышать {MaxTitleLength} символов.");
        }

        if (string.IsNullOrWhiteSpace(storagePath))
        {
            throw new ValidationException("storage_path", "Путь к файлу ассета обязателен.");
        }

        if (fileSizeBytes <= 0)
        {
            throw new ValidationException("file_size", "Размер файла должен быть строго больше 0 байт.");
        }

        // Инвариант типа ассета
        if (type == MediaType.Audio && dimensions.HasValue)
        {
            throw new DomainConflictException("Аудио-ассет не может содержать видео-разрешение (dimensions).", "AUDIO_CANNOT_HAVE_DIMENSIONS");
        }

        if (type == MediaType.Image && duration.HasValue && duration.Value.TotalSeconds > 0)
        {
            throw new DomainConflictException("Статичное изображение не может иметь продолжительности воспроизведения.", "IMAGE_CANNOT_HAVE_DURATION");
        }

        var asset = new MediaAsset
        {
            Id = id,
            Title = title.Trim(),
            Type = type,
            Source = source,
            StoragePath = storagePath.Trim(),
            Extension = extension.Trim().TrimStart('.').ToLowerInvariant(),
            FileSizeBytes = fileSizeBytes,
            Dimensions = dimensions,
            Duration = duration,
            Fps = fps.HasValue && fps.Value > 0 ? Math.Round(fps.Value, 2) : null,
            Sha256Hash = sha256Hash?.Trim(),
            IsNormalized = false,
            NormalizedStoragePath = null
        };

        asset.AddDomainEvent(new MediaAssetUploadedEvent(asset.Id.Value, asset.Title, asset.Type, asset.StoragePath));
        return asset;
    }

    public void UpdateTitle(string newTitle)
    {
        if (string.IsNullOrWhiteSpace(newTitle))
        {
            throw new ValidationException("title", "Название ассета не может быть пустым.");
        }

        Title = newTitle.Trim();
        AddDomainEvent(new MediaAssetMetadataUpdatedEvent(Id.Value, Title));
    }

    /// <summary>
    /// Фиксация завершения нормализации B-roll видео или изображения.
    /// Переводит ассет в статус IsNormalized = true и сохраняет целевой путь.
    /// </summary>
    public void MarkNormalized(
        string normalizedPath,
        MediaDimensions newDimensions,
        double targetFps,
        long normalizedSizeBytes)
    {
        if (Type == MediaType.Audio)
        {
            throw new DomainConflictException("Аудио-ассеты не подлежат видео-нормализации разрешения.", "CANNOT_NORMALIZE_AUDIO");
        }

        if (string.IsNullOrWhiteSpace(normalizedPath))
        {
            throw new ValidationException("normalized_path", "Путь к нормализованному файлу обязателен.");
        }

        if (normalizedSizeBytes <= 0)
        {
            throw new ValidationException("file_size", "Размер нормализованного файла должен быть больше 0 байт.");
        }

        NormalizedStoragePath = normalizedPath.Trim();
        Dimensions = newDimensions;
        Fps = Math.Round(targetFps, 2);
        IsNormalized = true;

        AddDomainEvent(new MediaAssetNormalizedEvent(
            Id.Value,
            NormalizedStoragePath,
            newDimensions.Width,
            newDimensions.Height,
            Fps.Value));
    }

    public void PrepareDelete()
    {
        AddDomainEvent(new MediaAssetDeletedEvent(Id.Value, StoragePath));
    }
}
