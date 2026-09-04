using Kernel.Exceptions;
using Kernel.Platform.Persistence;
using Skills.Domain.Events;
using Skills.Domain.ValueObjects;

namespace Skills.Domain.Entities;

public class Skill : BaseEntity<SkillId>
{
    public const int MaxNameLength = SkillName.MaxLength;
    public const int MaxDescriptionLength = 512;

    public SkillName Name { get; private set; }
    public string Description { get; private set; } = string.Empty;
    public SkillStage Stage { get; private set; }
    public PromptContent Content { get; private set; } = null!;
    public PromptContent? DefaultContent { get; private set; }
    public SkillPriority Priority { get; private set; }
    public SkillVersion Version { get; private set; }
    public bool IsDefault { get; private set; }
    public bool IsEnabled { get; private set; }
    public SkillTags Tags { get; private set; } = SkillTags.Empty;

    protected Skill() { }

    /// <summary>
    /// Фабрика создания пользовательского скила (генерирует SkillCreatedEvent).
    /// </summary>
    public static Skill CreateCustom(
        SkillId id,
        SkillName name,
        string description,
        SkillStage stage,
        PromptContent content,
        SkillPriority? priority = null,
        IEnumerable<string>? tags = null)
    {
        return Create(
            id: id,
            name: name,
            description: description,
            stage: stage,
            content: content,
            priority: priority,
            isDefault: false,
            defaultContent: null,
            tags: tags,
            emitEvent: true);
    }

    /// <summary>
    /// Фабрика создания системного дефолтного скила при сидинге.
    /// Подавляет SkillCreatedEvent (emitEvent: false), чтобы исключить сайд-эффекты при старте хоста.
    /// </summary>
    public static Skill CreateDefault(
        SkillId id,
        SkillName name,
        string description,
        SkillStage stage,
        PromptContent content,
        SkillPriority? priority = null,
        IEnumerable<string>? tags = null)
    {
        return Create(
            id: id,
            name: name,
            description: description,
            stage: stage,
            content: content,
            priority: priority,
            isDefault: true,
            defaultContent: content,
            tags: tags,
            emitEvent: false);
    }

    public static Skill Create(
        SkillId id,
        SkillName name,
        string description,
        SkillStage stage,
        PromptContent content,
        SkillPriority? priority = null,
        bool isDefault = false,
        PromptContent? defaultContent = null,
        IEnumerable<string>? tags = null,
        bool emitEvent = true)
    {
        var skill = new Skill
        {
            Id = id,
            Name = name,
            Description = description?.Trim() ?? string.Empty,
            Stage = stage,
            Content = content,
            DefaultContent = isDefault ? (defaultContent ?? content) : null,
            Priority = priority ?? SkillPriority.Normal,
            Version = SkillVersion.Initial,
            IsDefault = isDefault,
            IsEnabled = true,
            Tags = new SkillTags(tags)
        };

        if (emitEvent)
        {
            skill.AddDomainEvent(new SkillCreatedEvent(skill.Id.Value, skill.Name.Value, skill.Stage));
        }

        return skill;
    }

    public void Update(
        SkillName name,
        string description,
        PromptContent content,
        SkillPriority priority,
        bool isEnabled,
        IEnumerable<string>? tags = null)
    {
        var trimmedDesc = description?.Trim() ?? string.Empty;
        var newTags = new SkillTags(tags);

        bool hasStructuralChanges = !string.Equals(Content.Value, content.Value, StringComparison.Ordinal)
            || Priority != priority
            || !string.Equals(Name.Value, name.Value, StringComparison.Ordinal);

        if (hasStructuralChanges)
        {
            Version = Version.Next();
        }

        Name = name;
        Description = trimmedDesc;
        Content = content;
        Priority = priority;
        IsEnabled = isEnabled;
        Tags = newTags;

        AddDomainEvent(new SkillUpdatedEvent(Id.Value, Version.Value));
    }

    public void ResetToDefault()
    {
        if (!IsDefault)
        {
            throw new DomainConflictException(
                "Пользовательские скилы не могут быть сброшены. Доступно только для дефолтных скилов.",
                "CANNOT_RESET_CUSTOM_SKILL");
        }

        if (DefaultContent == null)
        {
            throw new DomainConflictException(
                $"У дефолтного скила '{Id}' отсутствует резервная копия исходного шаблона.",
                "DEFAULT_CONTENT_MISSING");
        }

        Content = DefaultContent;
        IsEnabled = true;
        Version = Version.Next();

        AddDomainEvent(new SkillResetEvent(Id.Value));
    }

    public void SyncDefaultTemplate(PromptContent newDefaultContent)
    {
        if (!IsDefault) return;
        DefaultContent = newDefaultContent;
    }

    public void Enable()
    {
        if (IsEnabled) return;
        IsEnabled = true;
    }

    public void Disable()
    {
        if (!IsEnabled) return;
        IsEnabled = false;
    }

    public void AssertCanDelete()
    {
        if (IsDefault)
        {
            throw new DomainConflictException(
                $"Скил '{Id}' является базовым системным скилом платформы. Удаление запрещено. Вы можете отключить его.",
                "CANNOT_DELETE_DEFAULT_SKILL");
        }
    }

    public void PrepareDelete()
    {
        AssertCanDelete();
        AddDomainEvent(new SkillDeletedEvent(Id.Value));
    }
}
