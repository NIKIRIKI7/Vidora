using Kernel.Exceptions;

namespace MediaContext.Domain.ValueObjects;

/// <summary>
/// Соотношение сторон экрана (16:9, 9:16, 1:1 и др.).
/// </summary>
public readonly record struct MediaAspectRatio
{
    public static readonly MediaAspectRatio Landscape16x9 = new(16, 9);
    public static readonly MediaAspectRatio Vertical9x16 = new(9, 16);
    public static readonly MediaAspectRatio Square1x1 = new(1, 1);
    public static readonly MediaAspectRatio Feed4x5 = new(4, 5);

    public int X { get; }
    public int Y { get; }
    public double Ratio => Y > 0 ? Math.Round((double)X / Y, 4) : 0.0;

    public MediaAspectRatio(int x, int y)
    {
        if (x <= 0 || y <= 0)
        {
            throw new ValidationException("aspect_ratio", "Компоненты соотношения сторон должны быть строго положительными.");
        }

        int gcd = GreatestCommonDivisor(x, y);
        X = x / gcd;
        Y = y / gcd;
    }

    public static MediaAspectRatio FromDimensions(int width, int height) => new(width, height);

    public bool IsVertical => Y > X;
    public bool IsHorizontal => X > Y;
    public bool IsSquare => X == Y;

    private static int GreatestCommonDivisor(int a, int b)
    {
        while (b != 0)
        {
            int temp = b;
            b = a % b;
            a = temp;
        }
        return a;
    }

    public override string ToString() => $"{X}:{Y}";
}
