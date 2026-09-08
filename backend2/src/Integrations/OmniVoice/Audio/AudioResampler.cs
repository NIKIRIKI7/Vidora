namespace Integrations.OmniVoice.Audio;

public static class AudioResampler
{
    public static float[] Resample(float[] input, int sourceRate, int targetRate)
    {
        if (sourceRate == targetRate || input.Length == 0)
        {
            return input;
        }

        int targetLength = (int)((long)input.Length * targetRate / sourceRate);
        float[] output = new float[targetLength];
        double ratio = (double)(input.Length - 1) / (targetLength - 1);

        for (int i = 0; i < targetLength; i++)
        {
            double srcIdx = i * ratio;
            int low = (int)srcIdx;
            int high = Math.Min(low + 1, input.Length - 1);
            double weight = srcIdx - low;
            output[i] = (float)((1.0 - weight) * input[low] + weight * input[high]);
        }

        return output;
    }
}
