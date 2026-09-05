using Kernel.Exceptions;
using Kernel.Platform.Persistence;
using ProductionContext.Domain.ValueObjects;

namespace ProductionContext.Domain.Entities;

public class SceneFragment : BaseEntity<string>
{
    public FragmentId FragmentId { get; private set; }
    public string SceneEntityId { get; private set; } = string.Empty;
    public int Index { get; private set; }
    public string Text { get; private set; } = string.Empty;
    public string VisualNote { get; private set; } = string.Empty;
    public double StartSeconds { get; private set; }
    public double EndSeconds { get; private set; }
    public string? VoiceAssetId { get; private set; }
    public string? BrollAssetId { get; private set; }

    public TimecodeSpan Timing => new(StartSeconds, EndSeconds);
    public double DurationSeconds => Timing.DurationSeconds;

    protected SceneFragment() { }

    internal static SceneFragment Create(
        string sceneEntityId,
        FragmentId fragmentId,
        int index,
        string text,
        string visualNote,
        TimecodeSpan? timing = null,
        string? voiceAssetId = null,
        string? brollAssetId = null)
    {
        if (index < 0)
        {
            throw new ValidationException("fragment_index", "Индекс фрагмента должен быть неотрицательным.");
        }

        var t = timing ?? TimecodeSpan.Zero;
        return new SceneFragment
        {
            Id = Guid.NewGuid().ToString("N"),
            SceneEntityId = sceneEntityId,
            FragmentId = fragmentId,
            Index = index,
            Text = text?.Trim() ?? string.Empty,
            VisualNote = visualNote?.Trim() ?? string.Empty,
            StartSeconds = t.StartSeconds,
            EndSeconds = t.EndSeconds,
            VoiceAssetId = voiceAssetId?.Trim(),
            BrollAssetId = brollAssetId?.Trim(),
            CreatedAt = DateTimeOffset.UtcNow,
            UpdatedAt = DateTimeOffset.UtcNow
        };
    }

    public void UpdateContent(string text, string visualNote)
    {
        Text = text?.Trim() ?? string.Empty;
        VisualNote = visualNote?.Trim() ?? string.Empty;
        UpdatedAt = DateTimeOffset.UtcNow;
    }

    public void AssignVoiceAsset(string voiceAssetId, double durationSeconds)
    {
        if (string.IsNullOrWhiteSpace(voiceAssetId))
        {
            throw new ValidationException("voice_asset_id", "Идентификатор аудио озвучки обязателен.");
        }

        VoiceAssetId = voiceAssetId.Trim();
        SetTiming(new TimecodeSpan(StartSeconds, StartSeconds + durationSeconds));
    }

    public void AssignBrollAsset(string? brollAssetId)
    {
        BrollAssetId = string.IsNullOrWhiteSpace(brollAssetId) ? null : brollAssetId.Trim();
        UpdatedAt = DateTimeOffset.UtcNow;
    }

    public void SetTiming(TimecodeSpan newTiming)
    {
        StartSeconds = newTiming.StartSeconds;
        EndSeconds = newTiming.EndSeconds;
        UpdatedAt = DateTimeOffset.UtcNow;
    }
}
