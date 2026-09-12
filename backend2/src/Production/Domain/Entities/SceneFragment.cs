using System.Security.Cryptography;
using System.Text;
using Kernel.Exceptions;
using Kernel.Platform.Persistence;
using ProductionContext.Domain.ValueObjects;
using Kernel.Contracts; // Для VoiceTagSanitizer (SSOT по тегам диктора)

namespace ProductionContext.Domain.Entities;

/// <summary>
/// Фрагмент сцены. Один фрагмент = одна визуальная ремарка + текст озвучки (может быть пустым — чистый B-roll).
/// </summary>
public class SceneFragment : BaseEntity<string>
{
    public FragmentId FragmentId { get; private set; }
    public string SceneEntityId { get; private set; } = string.Empty;
    public int Index { get; private set; }

    public string Text { get; private set; } = string.Empty;
    public string VisualNote { get; private set; } = string.Empty;

    /// <summary>SHA-256 хэш контента (VisualNote|Text) для кэширования эвристик линтера.</summary>
    public string ContentHash { get; private set; } = string.Empty;

    /// <summary>Заявленные таймкоды, прочитанные из Markdown-ремарки (могут конфликтовать с вычисленными).</summary>
    public double DeclaredStartSeconds { get; private set; }
    public double DeclaredEndSeconds { get; private set; }

    /// <summary>Вычисленные движком таймкоды — SSOT для рендера (Remotion) и TTS.</summary>
    public double StartSeconds { get; private set; }
    public double EndSeconds { get; private set; }

    public bool HasDeclaredTiming => DeclaredEndSeconds > DeclaredStartSeconds || DeclaredStartSeconds > 0.0;

    public string? VoiceAssetId { get; private set; }
    public string? BrollAssetId { get; private set; }

    /// <summary>Привязанный B-roll файл удалён или недоступен (Edge Case: потеря медиа).</summary>
    public bool IsMediaMissing { get; private set; }

    /// <summary>Привязанный Lottie/AE-ассет анимации удалён или недоступен.</summary>
    public bool IsAnimationMissing { get; private set; }

    private readonly List<string> _missingSfx = [];

    /// <summary>
    /// Звуковые эффекты ([SFX: pop.mp3]), не найденные в библиотеке проекта.
    /// Transient — вычисляется шлюзом при синхронизации, не персистится.
    /// </summary>
    public IReadOnlyList<string> MissingSfx => _missingSfx.AsReadOnly();

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
        string? brollAssetId = null,
        TimecodeSpan? declaredTiming = null)
    {
        if (index < 0)
        {
            throw new ValidationException("fragment_index", "Индекс фрагмента должен быть неотрицательным.");
        }

        var t = timing ?? TimecodeSpan.Zero;
        var declared = declaredTiming ?? TimecodeSpan.Zero;
        var frag = new SceneFragment
        {
            Id = Guid.NewGuid().ToString("N"),
            SceneEntityId = sceneEntityId,
            FragmentId = fragmentId,
            Index = index,
            Text = text?.Trim() ?? string.Empty,
            VisualNote = visualNote?.Trim() ?? string.Empty,
            StartSeconds = t.StartSeconds,
            EndSeconds = t.EndSeconds,
            DeclaredStartSeconds = declared.StartSeconds,
            DeclaredEndSeconds = declared.EndSeconds,
            VoiceAssetId = voiceAssetId?.Trim(),
            BrollAssetId = brollAssetId?.Trim(),
            CreatedAt = DateTimeOffset.UtcNow,
            UpdatedAt = DateTimeOffset.UtcNow
        };
        frag.UpdateContentHash();
        return frag;
    }

    public void UpdateContent(string text, string visualNote)
    {
        Text = text?.Trim() ?? string.Empty;
        VisualNote = visualNote?.Trim() ?? string.Empty;
        UpdateContentHash();
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

    public void SetDeclaredTiming(TimecodeSpan declaredTiming)
    {
        DeclaredStartSeconds = declaredTiming.StartSeconds;
        DeclaredEndSeconds = declaredTiming.EndSeconds;
        UpdatedAt = DateTimeOffset.UtcNow;
    }

    /// <summary>Краевой случай «потеря медиа»: помечаем фрагмент, если привязанный файл недоступен.</summary>
    public void MarkMediaMissing(bool isMissing)
    {
        if (IsMediaMissing == isMissing) return;
        IsMediaMissing = isMissing;
        UpdatedAt = DateTimeOffset.UtcNow;
    }

    /// <summary>Помечает фрагмент, если привязанный анимационный ассет (Lottie/AE) недоступен.</summary>
    public void MarkAnimationMissing(bool isMissing)
    {
        if (IsAnimationMissing == isMissing) return;
        IsAnimationMissing = isMissing;
        UpdatedAt = DateTimeOffset.UtcNow;
    }

    /// <summary>Фиксирует отсутствующий в библиотеке SFX-файл для линтера.</summary>
    public void AddMissingSfx(string sfxFile)
    {
        if (string.IsNullOrWhiteSpace(sfxFile)) return;
        if (!_missingSfx.Contains(sfxFile))
        {
            _missingSfx.Add(sfxFile.Trim());
        }
    }

    /// <summary>Сбрасывает transient-список отсутствующих SFX (вызывается перед повторной валидацией).</summary>
    public void ClearMissingSfx() => _missingSfx.Clear();

    /// <summary>
    /// Оценка длительности озвучки фрагмента: чистый текст (без тегов диктора) по правилу
    /// «2.5 слова = 1 секунда» + сумма разрешённых драматических пауз (&lt;#X#&gt; до 3.0с).
    /// </summary>
    public double EstimateDuration()
    {
        var cleanText = VoiceTagSanitizer.RemoveAllTags(Text);
        var words = cleanText.Split([' ', '\r', '\n', '\t'], StringSplitOptions.RemoveEmptyEntries).Length;
        var baseSeconds = Math.Max(SpeechPacingDefaults.MinFragmentSeconds, words / SpeechPacingDefaults.WordsPerSecond);
        var pauseSeconds = VoiceTagSanitizer.GetTotalPauseSeconds(Text);
        return Math.Round(baseSeconds + pauseSeconds, 2);
    }

    private void UpdateContentHash()
    {
        var input = $"{VisualNote}|{Text}";
        ContentHash = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(input))).ToLowerInvariant();
    }
}
