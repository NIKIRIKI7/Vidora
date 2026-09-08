using Integrations.OmniVoice.Contracts;
using Integrations.OmniVoice.Native;
using Voice.Domain.Ports;
using Voice.Domain.ValueObjects;

namespace Voice.Infrastructure.Providers.Local;

public sealed class OmniVoiceEngineDescriptor : IVoiceEngineDescriptor
{
    private readonly IOmniVoiceEngine _engine;
    private readonly OmniVoiceNativeRuntime _runtime;

    public OmniVoiceEngineDescriptor(IOmniVoiceEngine engine, OmniVoiceNativeRuntime runtime)
    {
        _engine = engine;
        _runtime = runtime;
    }

    public string EngineId => "LocalOmniVoice";
    public string DisplayName => "OmniVoice Diffusion (GPU)";
    public string Mode => "local";
    public VoiceCapabilities Capabilities =>
        VoiceCapabilities.Synthesis | VoiceCapabilities.Clone | VoiceCapabilities.Design;
    public string Description => "Локальный zero-shot синтез, клонирование и дизайн голоса через GGUF / нативный GGML-рантайм (CUDA 12)";

    public Task<EngineReadiness> ProbeReadinessAsync(CancellationToken ct = default)
    {
        bool modelAvailable = false;
        try { modelAvailable = _engine.IsModelAvailable(); }
        catch { }

        if (!modelAvailable)
        {
            return Task.FromResult(EngineReadiness.NotReady(
                "GGUF-файлы OmniVoice (omnivoice-q8_0.gguf + omnivoice-tokenizer-f16.gguf) не найдены в ai-models/omnivoice-gguf",
                "ModelArtifacts"));
        }

        if (!_runtime.IsAvailable(out _))
        {
            return Task.FromResult(EngineReadiness.NotReady(
                "Модель загружена, но нативный GGML-рантайм отсутствует. Скомпилируйте omnivoice_native.dll (audio.cpp/omnivoice.cpp) и положите его в tools/omnivoice_runtime/.",
                "NativeRuntime"));
        }

        return Task.FromResult(EngineReadiness.Ready());
    }
}