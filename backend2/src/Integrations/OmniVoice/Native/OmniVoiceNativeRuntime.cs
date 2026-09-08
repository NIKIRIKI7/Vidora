using System.Runtime.InteropServices;
using System.Text;
using Integrations.OmniVoice.Config;
using Integrations.OmniVoice.Contracts;
using Microsoft.Extensions.Logging;

namespace Integrations.OmniVoice.Native;

/// <summary>
/// Обёртка над нативным GGML-рантаймом OmniVoice (сборка audio.cpp/omnivoice.cpp).
///
/// Пока нативная библиотека не скомпилирована и не положена в
/// tools/omnivoice_runtime/omnivoice_native.dll, класс честно сообщает об отсутствии
/// рантайма и НЕ генерирует никакое аудио: синтез завершается исключением
/// <see cref="OmniVoiceRuntimeException"/> с инструкцией по подключению рантайма.
///
/// C-ABI контракт зафиксирован в tools/omnivoice_runtime/omnivoice_native.h.
/// </summary>
public sealed class OmniVoiceNativeRuntime : IDisposable
{
    private readonly OmniVoiceOptions _options;
    private readonly ILogger<OmniVoiceNativeRuntime> _logger;
    private readonly object _sync = new();
    private readonly HashSet<int> _initializedDevices = new();

    private string? _runtimePath;
    private bool _probeDone;

    public OmniVoiceNativeRuntime(
        OmniVoiceOptions options,
        ILogger<OmniVoiceNativeRuntime> logger)
    {
        _options = options;
        _logger = logger;
    }

    /// <summary>Путь к найденной нативной библиотеке, если она обнаружена.</summary>
    public string? RuntimePath => _runtimePath;

    /// <summary>Проверяет наличие нативного рантайма на диске.</summary>
    public bool IsAvailable(out string? reason)
    {
        var path = LocateRuntime();
        if (path == null)
        {
            reason = "Нативная библиотека GGML-рантайма не найдена: " +
                     $"'{_options.RuntimeDirectory}/{_options.RuntimeFileName}'. " +
                     "Скомпилируйте omnivoice_native из audio.cpp (audiocraft/cstr-omnivoice) " +
                     "и положите DLL в tools/omnivoice_runtime/.";
            return false;
        }

        reason = null;
        return true;
    }

    /// <summary>
    /// Гарантирует, что рантайм присутствует. При отсутствии бросает
    /// <see cref="OmniVoiceRuntimeException"/> с понятной инструкцией.
    /// </summary>
    public void EnsureAvailable()
    {
        if (!IsAvailable(out var reason))
        {
            _logger.LogWarning("[OmniVoice:Runtime] {Reason}", reason);
            throw new OmniVoiceRuntimeException(
                $"[OmniVoice:Runtime] {reason}");
        }
    }

    /// <summary>Инициализирует рантайм под указанным устройством (вызывается один раз на девайс).</summary>
    public void Init(string modelDirectory, int deviceIndex, bool forceCpu)
    {
        EnsureAvailable();

        var fullPath = LocateRuntime()!;
        lock (_sync)
        {
            if (_initializedDevices.Contains(deviceIndex)) return;

            var error = new StringBuilder(1024);
            int code = OmniVoiceNativeInterop.ovs_init(
                modelDirectory,
                _options.BaseModelFileName,
                _options.VocoderModelFileName,
                deviceIndex,
                forceCpu ? 1 : 0,
                error,
                error.Capacity);

            if (code != 0)
            {
                throw new OmniVoiceRuntimeException(
                    $"[OmniVoice:Runtime] ovs_init вернул код {code}: {error}");
            }

            _runtimePath = fullPath;
            _initializedDevices.Add(deviceIndex);
            _logger.LogInformation("[OmniVoice:Runtime] Рантайм инициализирован (Device={Idx}, GPU={Gpu})", deviceIndex, !forceCpu);
        }
    }

    /// <summary>Синтез через нативный рантайм. Возвращает сэмплы (float) на частоте outSampleRate.</summary>
    public float[] Synthesize(
        string text,
        string speakerId,
        string? referenceAudio,
        string? referenceText,
        double speed,
        double pitch,
        double guidanceScale,
        int numSteps,
        int sampleRate,
        out int outSampleRate)
    {
        EnsureAvailable();

        var error = new StringBuilder(1024);
        IntPtr samplesPtr = IntPtr.Zero;
        int sampleCount = 0;
        int producedRate = sampleRate;

        try
        {
            int code = OmniVoiceNativeInterop.ovs_synthesize(
                text,
                speakerId,
                referenceAudio,
                referenceText,
                (float)speed,
                (float)pitch,
                (float)guidanceScale,
                numSteps,
                sampleRate,
                out samplesPtr,
                out sampleCount,
                out producedRate,
                error,
                error.Capacity);

            if (code != 0)
            {
                throw new OmniVoiceRuntimeException(
                    $"[OmniVoice:Runtime] ovs_synthesize вернул код {code}: {error}");
            }

            if (sampleCount <= 0 || samplesPtr == IntPtr.Zero)
            {
                throw new OmniVoiceRuntimeException(
                    $"[OmniVoice:Runtime] ovs_synthesize не вернул сэмплов (count={sampleCount}).");
            }

            var samples = new float[sampleCount];
            Marshal.Copy(samplesPtr, samples, 0, sampleCount);
            outSampleRate = producedRate > 0 ? producedRate : sampleRate;
            return samples;
        }
        finally
        {
            if (samplesPtr != IntPtr.Zero)
            {
                OmniVoiceNativeInterop.ovs_free_samples(samplesPtr);
            }
        }
    }

    public void Unload(int deviceIndex)
    {
        if (!IsAvailable(out _)) return;

        lock (_sync)
        {
            OmniVoiceNativeInterop.ovs_unload(deviceIndex);
            _initializedDevices.Remove(deviceIndex);
        }
    }

    private string? LocateRuntime()
    {
        if (_probeDone) return _runtimePath;
        _probeDone = true;

        var fileName = _options.RuntimeFileName;
        var relDir = _options.RuntimeDirectory.Replace('\\', '/');

        var cwd = Directory.GetCurrentDirectory();
        var baseDirs = new[]
        {
            cwd,
            Path.Combine(cwd, "backend2"),
            AppContext.BaseDirectory,
            new DirectoryInfo(AppContext.BaseDirectory).Parent?.FullName ?? string.Empty
        };

        var candidates = new List<string>();
        foreach (var baseDir in baseDirs.Where(d => !string.IsNullOrWhiteSpace(d)))
        {
            candidates.Add(Path.Combine(baseDir, relDir, fileName));
            candidates.Add(Path.Combine(baseDir, "tools", "omnivoice_runtime", fileName));
            candidates.Add(Path.Combine(baseDir, "tools", fileName));
            candidates.Add(Path.Combine(baseDir, fileName));
        }

        _runtimePath = candidates
            .Where(p => File.Exists(p))
            .Select(Path.GetFullPath)
            .FirstOrDefault();

        return _runtimePath;
    }

    public void Dispose()
    {
        lock (_sync)
        {
            foreach (var dev in _initializedDevices)
            {
                try { OmniVoiceNativeInterop.ovs_unload(dev); }
                catch { /* рантайм может быть выгружен */ }
            }
            _initializedDevices.Clear();
        }
    }
}

/// <summary>
/// P/Invoke-объявления C-ABI функций нативной библиотеки omnivoice_native.
/// Точный контракт см. в tools/omnivoice_runtime/omnivoice_native.h.
/// </summary>
internal static partial class OmniVoiceNativeInterop
{
    private const string DllName = "omnivoice_native";

    [DllImport(DllName, CallingConvention = CallingConvention.Cdecl, CharSet = CharSet.Ansi)]
    internal static extern int ovs_init(
        string modelDirectory,
        string baseModelFileName,
        string tokenizerModelFileName,
        int deviceIndex,
        int forceCpu,
        StringBuilder errorBuffer,
        int errorBufferLength);

    [DllImport(DllName, CallingConvention = CallingConvention.Cdecl, CharSet = CharSet.Ansi)]
    internal static extern int ovs_synthesize(
        string text,
        string speakerId,
        [MarshalAs(UnmanagedType.LPStr)] string? referenceAudio,
        [MarshalAs(UnmanagedType.LPStr)] string? referenceText,
        float speed,
        float pitch,
        float guidanceScale,
        int numSteps,
        int sampleRate,
        out IntPtr samples,
        out int sampleCount,
        out int outSampleRate,
        StringBuilder errorBuffer,
        int errorBufferLength);

    [DllImport(DllName, CallingConvention = CallingConvention.Cdecl)]
    internal static extern void ovs_free_samples(IntPtr samples);

    [DllImport(DllName, CallingConvention = CallingConvention.Cdecl)]
    internal static extern int ovs_unload(int deviceIndex);
}