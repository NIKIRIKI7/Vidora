using Kernel.Exceptions;
using Kernel.Platform.Persistence;
using ProductionContext.Domain.ValueObjects;

namespace ProductionContext.Domain.Entities;

public class Scene : BaseEntity<string>
{
    public ProjectId ProjectId { get; private set; }
    public SceneId SceneId { get; private set; }
    public int Index { get; private set; }
    public string Title { get; private set; } = string.Empty;
    public string VisualNote { get; private set; } = string.Empty;
    public double StartSeconds { get; private set; }
    public double EndSeconds { get; private set; }
    public string? SceneCodeId { get; private set; }
    public string? RenderedVideoAssetId { get; private set; }

    private readonly List<SceneFragment> _fragments = [];
    public IReadOnlyList<SceneFragment> Fragments => _fragments.AsReadOnly();

    public TimecodeSpan Timecode => new(StartSeconds, EndSeconds);
    public double DurationSeconds => Math.Max(0.1, Timecode.DurationSeconds);

    protected Scene() { }

    internal static Scene Create(
        ProjectId projectId,
        SceneId sceneId,
        int index,
        string title,
        string visualNote)
    {
        if (index < 0)
        {
            throw new ValidationException("scene_index", "Порядковый индекс сцены не может быть отрицательным.");
        }

        return new Scene
        {
            Id = $"{projectId.Value}_{sceneId.Value}",
            ProjectId = projectId,
            SceneId = sceneId,
            Index = index,
            Title = string.IsNullOrWhiteSpace(title) ? $"Scene {index + 1}" : title.Trim(),
            VisualNote = visualNote?.Trim() ?? string.Empty,
            StartSeconds = 0.0,
            EndSeconds = 0.0,
            CreatedAt = DateTimeOffset.UtcNow,
            UpdatedAt = DateTimeOffset.UtcNow
        };
    }

    public SceneFragment AddFragment(string text, string visualNote, double durationSeconds = 0.0)
    {
        int nextIndex = _fragments.Count;
        double nextStart = _fragments.Count > 0 ? _fragments.Max(f => f.EndSeconds) : 0.0;
        var timing = durationSeconds > 0 ? TimecodeSpan.FromDuration(nextStart, durationSeconds) : TimecodeSpan.Zero;

        var fragment = SceneFragment.Create(
            sceneEntityId: Id,
            fragmentId: FragmentId.New(),
            index: nextIndex,
            text: text,
            visualNote: visualNote,
            timing: timing);

        _fragments.Add(fragment);
        RecalculateSceneDurationFromFragments();
        UpdatedAt = DateTimeOffset.UtcNow;
        return fragment;
    }

    public void ClearFragments()
    {
        _fragments.Clear();
        StartSeconds = 0.0;
        EndSeconds = 0.0;
        UpdatedAt = DateTimeOffset.UtcNow;
    }

    public void RecalculateSceneDurationFromFragments()
    {
        if (_fragments.Count == 0) return;

        double offset = 0.0;
        foreach (var frag in _fragments.OrderBy(f => f.Index))
        {
            double duration = frag.DurationSeconds;
            if (duration <= 0.0)
            {
                int words = frag.Text.Split([' ', '\r', '\n', '\t'], StringSplitOptions.RemoveEmptyEntries).Length;
                duration = Math.Max(SpeechPacingDefaults.MinFragmentSeconds, Math.Round(words / SpeechPacingDefaults.WordsPerSecond, 2));
            }
            frag.SetTiming(TimecodeSpan.FromDuration(offset, duration));
            offset += duration;
        }

        EndSeconds = StartSeconds + Math.Max(0.5, offset);
    }

    public void SetAbsoluteTimeWindow(double projectStartSeconds)
    {
        double currentDuration = DurationSeconds;
        StartSeconds = Math.Round(projectStartSeconds, 3);
        EndSeconds = Math.Round(StartSeconds + currentDuration, 3);
        UpdatedAt = DateTimeOffset.UtcNow;
    }

    public void LinkSceneCode(string sceneCodeId)
    {
        if (string.IsNullOrWhiteSpace(sceneCodeId))
        {
            throw new ValidationException("scene_code_id", "Идентификатор кода сцены обязателен.");
        }
        SceneCodeId = sceneCodeId.Trim();
        UpdatedAt = DateTimeOffset.UtcNow;
    }

    public void AttachRenderedVideo(string mediaAssetId)
    {
        if (string.IsNullOrWhiteSpace(mediaAssetId))
        {
            throw new ValidationException("rendered_video_asset_id", "Идентификатор видео-ассета сцены обязателен.");
        }
        RenderedVideoAssetId = mediaAssetId.Trim();
        UpdatedAt = DateTimeOffset.UtcNow;
    }

    public void UpdateMetadata(string title, string visualNote)
    {
        Title = string.IsNullOrWhiteSpace(title) ? Title : title.Trim();
        VisualNote = visualNote?.Trim() ?? string.Empty;
        UpdatedAt = DateTimeOffset.UtcNow;
    }
}
