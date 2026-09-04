using Kernel.Exceptions;

namespace Skills.Domain.ValueObjects;

public sealed record PromptContent
{
    public const int MaxLength = 32_000;

    public string Value { get; }

    public PromptContent(string value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            throw new ValidationException("content", "Тело промпт-пакета (content) не может быть пустым.");
        }

        var trimmed = value.Trim();
        if (trimmed.Length > MaxLength)
        {
            throw new ValidationException("content", $"Размер скила ({trimmed.Length} симв.) превышает лимит {MaxLength} символов.");
        }

        Value = trimmed;
    }

    public int Length => Value.Length;

    /// <summary>
    /// Оценка количества токенов текущего содержимого.
    /// </summary>
    public int EstimateTokens() => EstimateTokens(Value);

    /// <summary>
    /// Универсальный алгоритм расчёта BPE-токенов:
    /// ASCII/Код ~ 4 символа на токен, не-ASCII (кириллица и спецсимволы) ~ 1.7 символа на токен.
    /// </summary>
    public static int EstimateTokens(string? text)
    {
        if (string.IsNullOrEmpty(text))
        {
            return 0;
        }

        int asciiChars = 0;
        int nonAsciiChars = 0;

        foreach (char c in text)
        {
            if (c <= 127)
            {
                asciiChars++;
            }
            else
            {
                nonAsciiChars++;
            }
        }

        return (int)Math.Ceiling((asciiChars / 4.0) + (nonAsciiChars / 1.7));
    }

    public static implicit operator string(PromptContent content) => content.Value;
    public static implicit operator PromptContent(string value) => new(value);

    public override string ToString() => Value;
}
