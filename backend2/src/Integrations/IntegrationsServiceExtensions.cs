using Integrations.LLM;
using Integrations.LLM.Local;
using Integrations.Pexels;
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

        // 5. InnerTube Client
        services.AddHttpClient<IInnerTubeClient, InnerTubeClient>(client =>
        {
            client.Timeout = TimeSpan.FromSeconds(8);
            client.DefaultRequestHeaders.UserAgent.ParseAdd("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36");
        });

        return services;
    }
}
