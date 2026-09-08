using Integrations.LLM;
using Integrations.LLM.Local;
using Integrations.OmniVoice.Config;
using Integrations.OmniVoice.Contracts;
using Integrations.OmniVoice.Diagnostics;
using Integrations.OmniVoice.Native;
using Integrations.Pexels;
using Integrations.Whisper.Config;
using Integrations.YouTube.Innertube;
using Kernel.Ports;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace Integrations;

public static class IntegrationsServiceExtensions
{
    public static IServiceCollection AddIntegrationServices(
        this IServiceCollection services,
        IConfiguration configuration)
    {
        // 1. Pexels Stock Footage Client
        services.AddHttpClient<IPexelsClient, PexelsClient>(client =>
        {
            client.Timeout = TimeSpan.FromMinutes(2);
            client.DefaultRequestHeaders.UserAgent.ParseAdd("Vidora/2.0");
        });

        // 2. LLM config
        services.Configure<LlmOptions>(configuration.GetSection(LlmOptions.SectionName));

        // 3. GGUF model resolver
        services.AddSingleton<IGgufModelResolver, GgufModelResolver>();

        // 4. Native in-process LLamaSharp client (Gemma 3 GGUF)
        services.AddSingleton<ILlmClient, LlmClient>();

        // 5. InnerTube Module (replaces the old monolithic InnerTubeClient registration)
        services.AddInnerTubeModule(configuration);

        // 6. Native Whisper (CTranslate2) configuration
        services.Configure<WhisperOptions>(configuration.GetSection(WhisperOptions.SectionName));

        // 7. Native OmniVoice (GGUF + нативный GGML-рантайм) - заменяет Python subprocess
        services.Configure<OmniVoiceOptions>(configuration.GetSection(OmniVoiceOptions.SectionName));
        services.AddSingleton<OmniVoiceNativeRuntime>();
        services.AddSingleton<OmniVoiceEventLogger>();
        services.AddSingleton<IOmniVoiceEngine, NativeOmniVoiceEngine>();

        return services;
    }
}
