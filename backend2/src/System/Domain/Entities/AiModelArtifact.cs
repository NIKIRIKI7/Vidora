using Kernel.Exceptions;
using Kernel.Platform.Persistence;
using SystemContext.Domain.Events;

namespace SystemContext.Domain.Entities;

public class AiModelArtifact : BaseEntity<string>
{
    public const int MaxIdLength = 64;
    public const int MaxNameLength = 128;

    public string Name { get; private set; } = null!;
    public ModelCategory Category { get; private set; }
    public string TargetDirectory { get; private set; } = null!;
    public string DownloadUrl { get; private set; } = string.Empty;
    public long ExpectedSizeBytes { get; private set; }
    public long DownloadedSizeBytes { get; private set; }
    public ModelDownloadStatus Status { get; private set; }
    public string? ErrorMessage { get; private set; }
    public string? Sha256Checksum { get; private set; }
    public string Version { get; private set; } = "1.0";
    public bool IsRequired { get; private set; }

    protected AiModelArtifact() { }

    public static AiModelArtifact Create(
        string id,
        string name,
        ModelCategory category,
        string targetDirectory,
        string downloadUrl,
        long expectedSizeBytes,
        string version = "1.0",
        bool isRequired = true,
        string? sha256Checksum = null)
    {
        if (string.IsNullOrWhiteSpace(id))
            throw new ValidationException("id", "Идентификатор модели не может быть пустым.");

        if (string.IsNullOrWhiteSpace(name))
            throw new ValidationException("name", "Имя модели обязательно.");

        if (string.IsNullOrWhiteSpace(targetDirectory))
            throw new ValidationException("targetDirectory", "Целевая директория обязательна.");

        return new AiModelArtifact
        {
            Id = id.Trim().ToLowerInvariant(),
            Name = name.Trim(),
            Category = category,
            TargetDirectory = targetDirectory.Trim(),
            DownloadUrl = downloadUrl?.Trim() ?? string.Empty,
            ExpectedSizeBytes = expectedSizeBytes,
            DownloadedSizeBytes = 0,
            Status = ModelDownloadStatus.NotDownloaded,
            Version = version.Trim(),
            IsRequired = isRequired,
            Sha256Checksum = sha256Checksum?.Trim(),
            CreatedAt = DateTimeOffset.UtcNow,
            UpdatedAt = DateTimeOffset.UtcNow
        };
    }

    public void MarkDownloading()
    {
        Status = ModelDownloadStatus.Downloading;
        ErrorMessage = null;
        UpdatedAt = DateTimeOffset.UtcNow;
        AddDomainEvent(new AiModelDownloadStartedEvent(Id, Name));
    }

    public void UpdateDownloadProgress(long bytesDownloaded)
    {
        DownloadedSizeBytes = bytesDownloaded;
        UpdatedAt = DateTimeOffset.UtcNow;
    }

    public void UpdateTargetDirectory(string newTargetDirectory)
    {
        if (!string.IsNullOrWhiteSpace(newTargetDirectory))
        {
            TargetDirectory = newTargetDirectory.Trim();
            UpdatedAt = DateTimeOffset.UtcNow;
        }
    }

    public void MarkReady(long actualSize)
    {
        Status = ModelDownloadStatus.Ready;
        DownloadedSizeBytes = actualSize;
        ErrorMessage = null;
        UpdatedAt = DateTimeOffset.UtcNow;
        AddDomainEvent(new AiModelReadyEvent(Id, Name, actualSize));
    }

    public void MarkFailed(string reason)
    {
        Status = ModelDownloadStatus.Failed;
        ErrorMessage = reason;
        UpdatedAt = DateTimeOffset.UtcNow;
        AddDomainEvent(new AiModelDownloadFailedEvent(Id, Name, reason));
    }
}
