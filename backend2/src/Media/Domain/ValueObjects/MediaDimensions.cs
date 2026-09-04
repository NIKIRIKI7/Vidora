using Kernel.Exceptions;

namespace MediaContext.Domain.ValueObjects;

/// <summary>
/// Физические размеры видео/изображения в пикселях.
/// </summary>
public readonly record struct MediaDimensions : IComparable<MediaDimensions>
{
    public const int MinResolution = 16;
    public const int MaxResolution = 7680; // 8K UHD

    public int Width { get; }
    public int Height { get; }
    public MediaAspectRatio AspectRatio => MediaAspectRatio.FromDimensions(Width, Height);

    public MediaDimensions(int width, int height)
    {
        if (width < MinResolution || width > MaxResolution)
        {
            throw new ValidationException("width", $"Ширина должна быть от {MinResolution} до {MaxResolution} px. Передано: {width}.");
        }

        if (height < MinResolution || height > MaxResolution)
        {
            throw new ValidationException("height", $"Высота должна быть от {MinResolution} до {MaxResolution} px. Передано: {height}.");
        }

        Width = width;
        Height = height;
    }

    public static MediaDimensions FullHdLandscape => new(1920, 1080);
    public static MediaDimensions FullHdVertical => new(1080, 1920);
    public static MediaDimensions SquareInstagram => new(1080, 1080);

    public bool IsVertical => Height > Width;
    public bool IsHorizontal => Width > Height;
    public long TotalPixels => (long)Width * Height;

    public int CompareTo(MediaDimensions other) => TotalPixels.CompareTo(other.TotalPixels);
    public override string ToString() => $"{Width}x{Height}";
}
