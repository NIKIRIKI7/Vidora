using Kernel.Exceptions;
using Kernel.Platform.Persistence;
using Voice.Domain.Events;
using Voice.Domain.ValueObjects;

namespace Voice.Domain.Entities;

public class SpeakerProfile : BaseEntity<string>
{
    public const int MaxNameLength = 100;
    public const int MaxDescriptionLength = 500;

    public SpeakerId SpeakerId { get; private set; }
    public string Name { get; private set; } = string.Empty;
    public string? Description { get; private set; }
    public SpeakerSourceType SourceType { get; private set; }
    public VoiceEngineType Engine { get; private set; }
    public string Language { get; private set; } = string.Empty;
    public string? Gender { get; private set; }
    public bool IsDefault { get; private set; }
    public bool IsActive { get; private set; } = true;

    public string? DesignedDescription { get; private set; }
    public string? CloneReferenceAudioPath { get; private set; }
    public string? CloneReferenceText { get; private set; }
    public string? PreviewAudioPath { get; private set; }

    protected SpeakerProfile() { }

    public static SpeakerProfile CreateBuiltIn(
        SpeakerId speakerId,
        string name,
        VoiceEngineType engine,
        string language,
        string? gender = null,
        string? description = null)
    {
        if (string.IsNullOrWhiteSpace(name))
            throw new ValidationException("name", "Имя диктора обязательно.");
        if (name.Length > MaxNameLength)
            throw new ValidationException("name", $"Имя диктора не может превышать {MaxNameLength} знаков.");

        return new SpeakerProfile
        {
            Id = $"spk_{speakerId.Value}",
            SpeakerId = speakerId,
            Name = name.Trim(),
            Description = description?.Trim(),
            SourceType = SpeakerSourceType.BuiltIn,
            Engine = engine,
            Language = language.Trim(),
            Gender = gender?.Trim(),
            IsDefault = true,
            IsActive = true,
            CreatedAt = DateTimeOffset.UtcNow,
            UpdatedAt = DateTimeOffset.UtcNow
        };
    }

    public static SpeakerProfile CreateDesigned(
        SpeakerId speakerId,
        string name,
        VoiceEngineType engine,
        VoiceDesignSpec spec,
        string designedDescription)
    {
        if (string.IsNullOrWhiteSpace(name))
            throw new ValidationException("name", "Имя диктора обязательно.");

        var profile = new SpeakerProfile
        {
            Id = $"spk_{speakerId.Value}",
            SpeakerId = speakerId,
            Name = name.Trim(),
            Description = spec.Description,
            SourceType = SpeakerSourceType.Designed,
            Engine = engine,
            Language = spec.Language,
            Gender = spec.Gender,
            IsDefault = false,
            IsActive = true,
            DesignedDescription = designedDescription?.Trim(),
            CreatedAt = DateTimeOffset.UtcNow,
            UpdatedAt = DateTimeOffset.UtcNow
        };

        profile.AddDomainEvent(new SpeakerVoiceDesignedEvent(profile.Id, spec.Description, engine));
        return profile;
    }

    public static SpeakerProfile CreateCloned(
        SpeakerId speakerId,
        VoiceEngineType engine,
        ClonedVoiceSpec spec)
    {
        if (string.IsNullOrWhiteSpace(spec.ReferenceAudioPath))
            throw new ValidationException("reference_audio_path", "Путь к эталонному аудио обязателен.");

        var profile = new SpeakerProfile
        {
            Id = $"spk_{speakerId.Value}",
            SpeakerId = speakerId,
            Name = spec.Name,
            Description = $"Клонированный голос на основе {engine}",
            SourceType = SpeakerSourceType.Cloned,
            Engine = engine,
            Language = spec.Language ?? "multilingual",
            Gender = null,
            IsDefault = false,
            IsActive = true,
            CloneReferenceAudioPath = spec.ReferenceAudioPath.Trim(),
            CloneReferenceText = spec.ReferenceText?.Trim(),
            CreatedAt = DateTimeOffset.UtcNow,
            UpdatedAt = DateTimeOffset.UtcNow
        };

        profile.AddDomainEvent(new SpeakerClonedEvent(profile.Id, engine, spec.ReferenceAudioPath));
        return profile;
    }

    public void UpdateName(string newName)
    {
        if (string.IsNullOrWhiteSpace(newName))
            throw new ValidationException("name", "Имя диктора обязательно.");
        if (newName.Length > MaxNameLength)
            throw new ValidationException("name", $"Имя диктора не может превышать {MaxNameLength} знаков.");
        if (IsDefault)
            throw new DomainConflictException("Невозможно изменить имя встроенного диктора.", "BUILTIN_SPEAKER_READONLY");

        Name = newName.Trim();
        UpdatedAt = DateTimeOffset.UtcNow;
        AddDomainEvent(new SpeakerUpdatedEvent(Id));
    }

    public void SetPreviewAudio(string previewPath)
    {
        PreviewAudioPath = string.IsNullOrWhiteSpace(previewPath) ? null : previewPath.Trim();
        UpdatedAt = DateTimeOffset.UtcNow;
    }

    public void Deactivate()
    {
        if (IsDefault)
            throw new DomainConflictException("Невозможно деактивировать встроенный диктор.", "BUILTIN_SPEAKER_READONLY");

        IsActive = false;
        UpdatedAt = DateTimeOffset.UtcNow;
        AddDomainEvent(new SpeakerDeletedEvent(Id));
    }

    public void Activate()
    {
        IsActive = true;
        UpdatedAt = DateTimeOffset.UtcNow;
    }
}
