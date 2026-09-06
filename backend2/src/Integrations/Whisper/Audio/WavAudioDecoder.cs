namespace Integrations.Whisper.Audio;

public sealed record DecodedAudio(float[] Samples, int SampleRate, TimeSpan Duration);

public static class WavAudioDecoder
{
    public static async Task<DecodedAudio> DecodeToMono16kHzAsync(string wavFilePath, CancellationToken ct = default)
    {
        await using var stream = new FileStream(wavFilePath, FileMode.Open, FileAccess.Read, FileShare.Read, 81920, true);
        using var reader = new BinaryReader(stream);

        var riff = new string(reader.ReadChars(4));
        if (riff != "RIFF")
            throw new InvalidDataException($"Файл {wavFilePath} не является корректным RIFF WAV.");

        _ = reader.ReadInt32();

        var wave = new string(reader.ReadChars(4));
        if (wave != "WAVE")
            throw new InvalidDataException($"Файл {wavFilePath} не содержит WAVE формат.");

        short audioFormat = 1;
        short channels = 1;
        int sampleRate = 16000;
        short bitsPerSample = 16;
        byte[]? dataBuffer = null;

        while (stream.Position < stream.Length)
        {
            ct.ThrowIfCancellationRequested();

            var chunkId = new string(reader.ReadChars(4));
            var chunkSize = reader.ReadInt32();

            if (chunkId == "fmt ")
            {
                audioFormat = reader.ReadInt16();
                channels = reader.ReadInt16();
                sampleRate = reader.ReadInt32();
                _ = reader.ReadInt32();
                _ = reader.ReadInt16();
                bitsPerSample = reader.ReadInt16();

                if (chunkSize > 16)
                {
                    _ = reader.ReadBytes(chunkSize - 16);
                }
            }
            else if (chunkId == "data")
            {
                dataBuffer = reader.ReadBytes(chunkSize);
                break;
            }
            else
            {
                reader.BaseStream.Seek(chunkSize, SeekOrigin.Current);
            }
        }

        if (dataBuffer == null || dataBuffer.Length == 0)
            throw new InvalidDataException("В WAV-файле отсутствует data-блок.");

        float[] rawFloats;
        if (audioFormat == 1 && bitsPerSample == 16)
        {
            int sampleCount = dataBuffer.Length / 2;
            rawFloats = new float[sampleCount];
            for (int i = 0; i < sampleCount; i++)
            {
                short sample = BitConverter.ToInt16(dataBuffer, i * 2);
                rawFloats[i] = sample / 32768.0f;
            }
        }
        else if (audioFormat == 3 && bitsPerSample == 32)
        {
            int sampleCount = dataBuffer.Length / 4;
            rawFloats = new float[sampleCount];
            for (int i = 0; i < sampleCount; i++)
            {
                rawFloats[i] = BitConverter.ToSingle(dataBuffer, i * 4);
            }
        }
        else
        {
            throw new NotSupportedException($"Неподдерживаемый аудио-формат: Format={audioFormat}, Bits={bitsPerSample}");
        }

        float[] monoFloats;
        if (channels > 1)
        {
            int monoLength = rawFloats.Length / channels;
            monoFloats = new float[monoLength];
            for (int i = 0; i < monoLength; i++)
            {
                float sum = 0f;
                for (int ch = 0; ch < channels; ch++)
                {
                    sum += rawFloats[i * channels + ch];
                }
                monoFloats[i] = sum / channels;
            }
        }
        else
        {
            monoFloats = rawFloats;
        }

        float[] final16k;
        if (sampleRate != 16000)
        {
            int targetLength = (int)((long)monoFloats.Length * 16000 / sampleRate);
            final16k = new float[targetLength];
            double step = (double)(monoFloats.Length - 1) / (targetLength - 1);

            for (int i = 0; i < targetLength; i++)
            {
                double srcIdx = i * step;
                int low = (int)srcIdx;
                int high = Math.Min(low + 1, monoFloats.Length - 1);
                double t = srcIdx - low;
                final16k[i] = (float)((1.0 - t) * monoFloats[low] + t * monoFloats[high]);
            }
        }
        else
        {
            final16k = monoFloats;
        }

        var duration = TimeSpan.FromSeconds((double)final16k.Length / 16000.0);
        return new DecodedAudio(final16k, 16000, duration);
    }
}
