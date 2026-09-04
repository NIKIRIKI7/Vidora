using Kernel.Exceptions;
using Kernel.Platform.Persistence;
using SystemContext.Domain.Events;

namespace SystemContext.Domain.Entities;

public class SystemSetting : BaseEntity<string>
{
    public const int MaxKeyLength = 128;
    public const int MaxValueLength = 4096;

    public string Value { get; private set; } = string.Empty;
    public string Description { get; private set; } = string.Empty;
    public string DataType { get; private set; } = "string";
    public bool IsReadOnly { get; private set; }

    protected SystemSetting() { }

    public static SystemSetting Create(
        string key,
        string value,
        string description = "",
        string dataType = "string",
        bool isReadOnly = false)
    {
        if (string.IsNullOrWhiteSpace(key))
            throw new ValidationException("key", "Ключ настройки не может быть пустым.");

        if (key.Length > MaxKeyLength)
            throw new ValidationException("key", $"Ключ настройки не может превышать {MaxKeyLength} символов.");

        return new SystemSetting
        {
            Id = key.Trim().ToLowerInvariant(),
            Value = value?.Trim() ?? string.Empty,
            Description = description?.Trim() ?? string.Empty,
            DataType = dataType.Trim().ToLowerInvariant(),
            IsReadOnly = isReadOnly,
            CreatedAt = DateTimeOffset.UtcNow,
            UpdatedAt = DateTimeOffset.UtcNow
        };
    }

    public void UpdateValue(string newValue)
    {
        if (IsReadOnly)
        {
            throw new DomainConflictException(
                $"Системная настройка '{Id}' доступна только для чтения.",
                "SETTING_READONLY");
        }

        Value = newValue?.Trim() ?? string.Empty;
        UpdatedAt = DateTimeOffset.UtcNow;

        AddDomainEvent(new SystemSettingChangedEvent(Id, Value));
    }
}
