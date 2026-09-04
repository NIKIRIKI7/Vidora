using Kernel.Contracts;

namespace MotionContext.Domain.ValueObjects;

public sealed record MontageTheme
{
    public string Primary { get; init; } = "#000000";
    public string Secondary { get; init; } = "#ffffff";
    public string Background { get; init; } = "#121212";
    public string Surface { get; init; } = "#1e1e1e";
    public string Accent { get; init; } = "#ff5722";
    public string Text { get; init; } = "#ffffff";
    public string Typography { get; init; } = "Inter";
    public string AnimationStyle { get; init; } = "smooth";

    public static MontageTheme Default => new();

    public static MontageTheme FromDto(MontageSettingsDto? dto)
    {
        if (dto == null) return Default;

        return new MontageTheme
        {
            Primary = string.IsNullOrWhiteSpace(dto.Colors.Primary) ? "#000000" : dto.Colors.Primary,
            Secondary = string.IsNullOrWhiteSpace(dto.Colors.Secondary) ? "#ffffff" : dto.Colors.Secondary,
            Background = string.IsNullOrWhiteSpace(dto.Colors.Background) ? "#121212" : dto.Colors.Background,
            Surface = string.IsNullOrWhiteSpace(dto.Colors.Surface) ? "#1e1e1e" : dto.Colors.Surface,
            Accent = string.IsNullOrWhiteSpace(dto.Colors.Accent) ? "#ff5722" : dto.Colors.Accent,
            Text = string.IsNullOrWhiteSpace(dto.Colors.Text) ? "#ffffff" : dto.Colors.Text,
            Typography = string.IsNullOrWhiteSpace(dto.Typography) ? "Inter" : dto.Typography,
            AnimationStyle = string.IsNullOrWhiteSpace(dto.AnimationStyle) ? "smooth" : dto.AnimationStyle
        };
    }
}
