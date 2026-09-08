namespace Integrations.OmniVoice.Config;

public sealed class OmniVoiceOptions
{
    public const string SectionName = "Integrations:OmniVoice";

    public string ModelDirectory { get; set; } = "data_storage/ai-models/omnivoice-gguf";
    public string BaseModelFileName { get; set; } = "omnivoice-q8_0.gguf";
    public string VocoderModelFileName { get; set; } = "omnivoice-tokenizer-f16.gguf";
    public string Device { get; set; } = "cuda";
    public int DeviceIndex { get; set; } = 0;
    public int NumSteps { get; set; } = 24;
    public double GuidanceScale { get; set; } = 2.0;
    public int SampleRate { get; set; } = 24000;
    public bool AutoFallbackToCpu { get; set; } = true;
    public string ClonesCacheDirectory { get; set; } = "data_storage/ai-models/omnivoice-gguf/clones";
    public string RuntimeDirectory { get; set; } = "tools/omnivoice_runtime";
    public string RuntimeFileName { get; set; } = "omnivoice_native.dll";
    public string LogFileName { get; set; } = "app_events.jsonl";
    public bool ApplyPostDspPitch { get; set; } = true;
}
