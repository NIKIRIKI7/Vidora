using Kernel.Exceptions;

namespace MediaContext.Domain.ValueObjects;

/// <summary>
/// Объект-значение продолжительности аудио/видео контента.
/// </summary>
public readonly record struct MediaDuration : IComparable<MediaDuration>
{
    public TimeSpan Value { get; }

    public MediaDuration(TimeSpan value)
    {
        if (value < TimeSpan.Zero)
        {
            throw new ValidationException("duration", "Продолжительность не может быть отрицательной.");
        }
        Value = value;
    }

    public static MediaDuration FromSeconds(double seconds)
    {
        if (seconds < 0)
        {
            throw new ValidationException("duration", "Количество секунд не может быть отрицательным.");
        }
        return new MediaDuration(TimeSpan.FromSeconds(seconds));
    }

    public static MediaDuration Zero => new(TimeSpan.Zero);

    public double TotalSeconds => Value.TotalSeconds;
    public double TotalMilliseconds => Value.TotalMilliseconds;

    public static implicit operator TimeSpan(MediaDuration d) => d.Value;
    public static implicit operator MediaDuration(TimeSpan ts) => new(ts);

    public int CompareTo(MediaDuration other) => Value.CompareTo(other.Value);
    public override string ToString() => Value.ToString(@"hh\:mm\:ss\.fff");
}
