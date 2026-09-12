namespace Integrations.Whisper.Native;

public sealed record WhisperWord(string Word, long StartMs, long EndMs, double Confidence = 1.0);
