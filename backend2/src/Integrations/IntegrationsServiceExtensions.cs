using Integrations.Pexels;
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
        // Pexels API (стоковый B-roll)
        services.AddHttpClient<IPexelsClient, PexelsClient>(client =>
        {
            client.Timeout = TimeSpan.FromMinutes(2);
            client.DefaultRequestHeaders.UserAgent.ParseAdd("Vidora/2.0");
        });

        return services;
    }
}
