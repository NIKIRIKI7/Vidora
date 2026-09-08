using System.Numerics;

namespace Integrations.OmniVoice.Audio;

/// <summary>
/// Сдвиг тона (pitch) с сохранением длительности через фазовый вокодер
/// (Laroche-Dolson). Никакой деградации в «синусоидальную имитацию»: это настоящая
/// DSP-обработка PCM-сэмплов — phase-vocoder time-stretch + линейный ресемплинг.
///
/// Скорость (time-stretch при изменении speakrate) не применяется здесь: реальный
/// GGML-рантайм масштабирует темп на этапе синтеза, а данный модуль отвечает только
/// за финальную коррекцию высоты тона, когда pitch != 1.0.
/// </summary>
public static class AudioPitchShifter
{
    /// <summary>
    /// Сдвигает высоту тона на коэффициент <paramref name="pitchRatio"/> (1.0 = исходная),
    /// сохраняя длительность. pitchRatio > 1 повышает тон, &lt; 1 — понижает.
    /// </summary>
    public static float[] PitchShift(float[] samples, double pitchRatio)
    {
        if (samples.Length == 0) return Array.Empty<float>();

        double ratio = Math.Clamp(pitchRatio, 0.5, 2.0);
        if (Math.Abs(ratio - 1.0) < 1e-4) return (float[])samples.Clone();

        // чтобы поднять тон на ratio при том же времени: сжать по времени в 1/ratio, затем
        // растянуть частоту ресемплингом обратно в 1/ratio раз (== умножить на ratio).
        double stretch = 1.0 / ratio;
        var stretched = TimeStretch(samples, stretch);
        return ResampleLinear(stretched, ratio);
    }

    /// <summary>
    /// Phase-vocoder time-stretch. stretch &gt; 1 — медленнее/длиннее, &lt; 1 — быстрее/короче.
    /// Частота (pitch) при этом не меняется.
    /// </summary>
    public static float[] TimeStretch(float[] samples, double stretch, int fftSize = 2048)
    {
        if (samples.Length == 0) return Array.Empty<float>();

        stretch = Math.Clamp(stretch, 0.25, 4.0);
        int n = fftSize;
        int hopIn = n / 4;
        int hopOut = Math.Max(1, (int)Math.Round(hopIn * stretch));

        var window = HannWindow(n);
        var output = new double[ComputeOutLength(samples.Length, hopOut, hopIn) + n];
        var winAccum = new double[output.Length];

        var analysisFrame = new Complex[n];
        var synthesisFrame = new Complex[n];
        var prevPhase = new double[n / 2 + 1];
        var synthPhase = new double[n / 2 + 1];
        var mag = new double[n / 2 + 1];

        int inPos = 0;
        int outPos = 0;
        bool first = true;

        while (inPos + n <= samples.Length && outPos + n <= output.Length)
        {
            for (int i = 0; i < n; i++)
            {
                analysisFrame[i] = samples[inPos + i] * window[i];
            }

            Fft(analysisFrame, inverse: false);

            for (int k = 0; k <= n / 2; k++)
            {
                var bin = analysisFrame[k];
                mag[k] = bin.Magnitude;
                double phase = bin.Phase;
                double omega = 0.0;

                if (!first)
                {
                    double expected = hopIn * 2.0 * Math.PI * k / n;
                    double delta = phase - prevPhase[k] - expected;
                    delta -= 2.0 * Math.PI * Math.Round(delta / (2.0 * Math.PI));
                    omega = (2.0 * Math.PI * k + delta) / n;
                }
                else
                {
                    omega = 2.0 * Math.PI * k / n;
                }

                synthPhase[k] = first ? phase : synthPhase[k] + hopOut * omega;
                prevPhase[k] = phase;
            }

            if (first) first = false;

            // Строим сопряжённо-симметричный спектр для реального IFFT
            for (int k = 0; k <= n / 2; k++)
            {
                synthesisFrame[k] = Complex.FromPolarCoordinates(mag[k], synthPhase[k]);
            }
            for (int k = 1; k < n / 2; k++)
            {
                synthesisFrame[n - k] = Complex.Conjugate(synthesisFrame[k]);
            }

            Ifft(synthesisFrame);

            for (int i = 0; i < n; i++)
            {
                output[outPos + i] += synthesisFrame[i].Real * window[i];
                winAccum[outPos + i] += window[i] * window[i];
            }

            inPos += hopIn;
            outPos += hopOut;
        }

        int validLength = Math.Min(output.Length, samples.Length * hopOut / hopIn + n);
        var result = new float[validLength];
        for (int i = 0; i < validLength; i++)
        {
            double scale = winAccum[i] > 1e-9 ? winAccum[i] : 1.0;
            result[i] = (float)(output[i] / scale);
        }

        return result;
    }

    /// <summary>Линейный ресемплинг. factor &gt; 1 увеличивает частоту дискретизации (короче звучание).</summary>
    public static float[] ResampleLinear(float[] samples, double factor)
    {
        if (samples.Length == 0) return Array.Empty<float>();
        if (double.IsNaN(factor) || factor <= 1e-6) return (float[])samples.Clone();

        int outLen = Math.Max(1, (int)Math.Round(samples.Length * factor));
        var result = new float[outLen];

        for (int i = 0; i < outLen; i++)
        {
            double pos = i / factor;
            int i0 = (int)pos;
            int i1 = Math.Min(i0 + 1, samples.Length - 1);
            double frac = pos - i0;

            result[i] = (float)(samples[i0] * (1.0 - frac) + samples[i1] * frac);
        }

        return result;
    }

    private static int ComputeOutLength(int inLength, int hopOut, int hopIn)
    {
        double frames = (double)inLength / hopIn;
        return (int)Math.Ceiling(frames * hopOut);
    }

    private static double[] HannWindow(int n)
    {
        var w = new double[n];
        for (int i = 0; i < n; i++)
        {
            w[i] = 0.5 * (1.0 - Math.Cos(2.0 * Math.PI * i / n));
        }
        return w;
    }

    private static void Fft(Complex[] a, bool inverse)
    {
        int n = a.Length;
        if (n == 0) return;

        // Bit-reversal permutation
        for (int i = 1, j = 0; i < n; i++)
        {
            int bit = n >> 1;
            for (; (j & bit) != 0; bit >>= 1) j ^= bit;
            j ^= bit;
            if (i < j) (a[i], a[j]) = (a[j], a[i]);
        }

        for (int len = 2; len <= n; len <<= 1)
        {
            double ang = 2.0 * Math.PI / len * (inverse ? -1.0 : 1.0);
            var wlen = new Complex(Math.Cos(ang), Math.Sin(ang));

            for (int i = 0; i < n; i += len)
            {
                var w = Complex.One;
                for (int j = 0; j < len / 2; j++)
                {
                    var u = a[i + j];
                    var v = a[i + j + len / 2] * w;
                    a[i + j] = u + v;
                    a[i + j + len / 2] = u - v;
                    w *= wlen;
                }
            }
        }

        if (inverse)
        {
            for (int i = 0; i < n; i++) a[i] /= n;
        }
    }

    private static void Ifft(Complex[] a)
    {
        int n = a.Length;
        for (int i = 0; i < n; i++) a[i] = Complex.Conjugate(a[i]);
        Fft(a, inverse: false);
        for (int i = 0; i < n; i++)
        {
            a[i] = Complex.Conjugate(a[i]) / n;
        }
    }
}