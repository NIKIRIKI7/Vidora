namespace Integrations.OmniVoice.Audio;

public static class WavAudioEncoder
{
    public static async Task WriteWavFileAsync(
        string filePath,
        float[] samples,
        int sampleRate = 24000,
        CancellationToken ct = default)
    {
        ArgumentNullException.ThrowIfNull(samples);
        ArgumentException.ThrowIfNullOrWhiteSpace(filePath);

        var dir = Path.GetDirectoryName(filePath);
        if (!string.IsNullOrEmpty(dir))
        {
            Directory.CreateDirectory(dir);
        }

        short channels = 1;
        short bitsPerSample = 16;
        int byteRate = sampleRate * channels * (bitsPerSample / 8);
        short blockAlign = (short)(channels * (bitsPerSample / 8));
        int subChunk2Size = samples.Length * (bitsPerSample / 8);
        int chunkSize = 36 + subChunk2Size;

        await using var stream = new FileStream(filePath, FileMode.Create, FileAccess.Write, FileShare.None, 81920, true);
        await using var writer = new BinaryWriter(stream);

        writer.Write("RIFF"u8);
        writer.Write(chunkSize);
        writer.Write("WAVE"u8);

        writer.Write("fmt "u8);
        writer.Write(16);
        writer.Write((short)1);
        writer.Write(channels);
        writer.Write(sampleRate);
        writer.Write(byteRate);
        writer.Write(blockAlign);
        writer.Write(bitsPerSample);

        writer.Write("data"u8);
        writer.Write(subChunk2Size);

        byte[] buffer = new byte[samples.Length * 2];
        for (int i = 0; i < samples.Length; i++)
        {
            ct.ThrowIfCancellationRequested();
            float clamped = Math.Clamp(samples[i], -1.0f, 1.0f);
            short pcm = (short)Math.Round(clamped * 32767.0f);
            buffer[i * 2] = (byte)(pcm & 0xFF);
            buffer[i * 2 + 1] = (byte)((pcm >> 8) & 0xFF);
        }

        await stream.WriteAsync(buffer.AsMemory(0, buffer.Length), ct);
    }
}
