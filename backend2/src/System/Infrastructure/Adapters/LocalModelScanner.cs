using Integrations.LLM.Local;
using SystemContext.Domain.Ports;

namespace SystemContext.Infrastructure.Adapters;

public sealed class LocalModelScanner : ILocalModelScanner
{
    private readonly IGgufModelResolver _resolver;

    public LocalModelScanner(IGgufModelResolver resolver) => _resolver = resolver;

    public IReadOnlyList<string> FindAllGgufFiles() => _resolver.FindAllGgufFiles();
}
