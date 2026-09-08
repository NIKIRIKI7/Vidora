using Integrations.Whisper.Audio;
using Qourex.FasterWhisper.NET;
using Xunit;

namespace Kernel.Tests;

public class WhisperDirectApiTest
{
    private static readonly string Backend2Root = Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "..", "..", "..", "..", ".."));
    private static readonly string DataStorage = Path.Combine(Backend2Root, "data_storage");

    [Fact]
    public async Task DirectTranscribeTest()
    {
        var modelDir = Path.Combine(DataStorage, "ai-models", "whisper", "faster-whisper-small");
        if (!Directory.Exists(modelDir))
            modelDir = Path.Combine(Backend2Root, "data_storage", "ai-models", "whisper", "faster-whisper-small");
        if (!Directory.Exists(modelDir)) { Console.WriteLine("SKIP"); return; }

        var audioPath = Path.Combine(DataStorage, "temp", "voice", "tts-6866959b120d41dfaae78e4c0e179425_master.wav");
        if (!File.Exists(audioPath)) { Console.WriteLine("SKIP: no audio"); return; }

        Console.WriteLine($"Audio: {Path.GetFileName(audioPath)}");
        var decoded = await WavAudioDecoder.DecodeToMono16kHzAsync(audioPath);
        Console.WriteLine($"Decoded: {decoded.Samples.Length} samples, {decoded.Duration.TotalSeconds:F2}s");

        Console.WriteLine("\n=== GPU mode, float16 ===");
        try
        {
            using var model = new WhisperModel(modelDir, "cuda", "float16", null, 0, false, 1);
            Console.WriteLine("GPU Model loaded.");

            var opts = new WhisperOptions { BeamSize = 5, WordTimestamps = true };
            var segs = model.Transcribe(decoded.Samples, language: "ru", options: opts).ToList();
            Console.WriteLine($"Segments: {segs.Count}");
            foreach (var s in segs.Take(5))
            {
                Console.WriteLine($"  [{s.Start:F2}-{s.End:F2}] \"{s.Text}\"");
                if (s.Words != null)
                    foreach (var w in s.Words)
                        Console.WriteLine($"    [{w.Start:F2}-{w.End:F2}] \"{w.Word}\" p={w.Probability:F3}");
            }

            if (segs.Count > 0) { Assert.True(true); return; }
        }
        catch (Exception ex) { Console.WriteLine($"  FAILED: {ex.Message}"); }

        Console.WriteLine("\n=== CPU mode, float32 ===");
        try
        {
            using var model = new WhisperModel(modelDir, "cpu", "float32", null, 4, false, 1);
            Console.WriteLine("CPU Model loaded.");

            var opts = new WhisperOptions { BeamSize = 5, WordTimestamps = true };
            var segs = model.Transcribe(decoded.Samples, language: "ru", options: opts).ToList();
            Console.WriteLine($"Segments: {segs.Count}");
            foreach (var s in segs.Take(5))
                Console.WriteLine($"  [{s.Start:F2}-{s.End:F2}] \"{s.Text}\"");

            if (segs.Count > 0) { Assert.True(true); return; }
        }
        catch (Exception ex) { Console.WriteLine($"  FAILED: {ex.Message}"); }

        Assert.Fail("No configuration produced segments");
    }
}
