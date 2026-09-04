using System.Text.RegularExpressions;
using Kernel.Exceptions;

namespace MediaContext.Domain.ValueObjects;

/// <summary>
/// Объект-значение уникального идентификатора ассета.
/// </summary>
public readonly partial record struct MediaAssetId : IComparable<MediaAssetId>
{
    public const int MaxLength = 64;
    public string Value { get; }

    public MediaAssetId(string value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            throw new ValidationException("asset_id", "Идентификатор ассета не может быть пустым.");
        }

        var trimmed = value.Trim().ToLowerInvariant();
        if (trimmed.Length > MaxLength)
        {
            throw new ValidationException("asset_id", $"Длина идентификатора ассета не может превышать {MaxLength} символов.");
        }

        if (!ValidPattern().IsMatch(trimmed))
        {
            throw new ValidationException("asset_id", "Идентификатор ассета может содержать только латиницу, цифры, дефисы и подчеркивания.");
        }

        Value = trimmed;
    }

    public static MediaAssetId NewId(string prefix = "asset") =>
        new($"{prefix}-{Guid.NewGuid():N}"[..Math.Min(MaxLength, prefix.Length + 33)]);

    public static bool TryParse(string? value, out MediaAssetId assetId)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            assetId = default;
            return false;
        }

        var trimmed = value.Trim().ToLowerInvariant();
        if (trimmed.Length > MaxLength || !ValidPattern().IsMatch(trimmed))
        {
            assetId = default;
            return false;
        }

        assetId = new MediaAssetId(trimmed);
        return true;
    }

    public static implicit operator string(MediaAssetId id) => id.Value;
    public static implicit operator MediaAssetId(string value) => new(value);

    public int CompareTo(MediaAssetId other) => string.Compare(Value, other.Value, StringComparison.Ordinal);
    public override string ToString() => Value;

    [GeneratedRegex(@"^[a-z0-9_\-]+$")]
    private static partial Regex ValidPattern();
}
