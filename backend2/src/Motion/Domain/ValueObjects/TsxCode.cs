using System.Security.Cryptography;
using System.Text;
using Kernel.Exceptions;

namespace MotionContext.Domain.ValueObjects;

public sealed record TsxCode
{
    public const int MaxByteSize = 256 * 1024;
    public string Value { get; }
    public string Sha256Hash { get; }

    public TsxCode(string value)
    {
        if (string.IsNullOrWhiteSpace(value))
            throw new ValidationException("code", "Исходный код TSX не может быть пустым.");

        var trimmed = value.Trim();
        var bytes = Encoding.UTF8.GetBytes(trimmed);
        if (bytes.Length > MaxByteSize)
            throw new ValidationException("code", $"Размер кода сцены ({bytes.Length} байт) превышает лимит {MaxByteSize} байт.");

        Value = trimmed;
        Sha256Hash = ComputeHash(bytes);
    }

    private static string ComputeHash(byte[] bytes)
    {
        var hash = SHA256.HashData(bytes);
        return Convert.ToHexString(hash).ToLowerInvariant();
    }

    public static implicit operator string(TsxCode code) => code.Value;
    public static implicit operator TsxCode(string value) => new(value);
    public override string ToString() => Value;
}
