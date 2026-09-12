namespace SystemContext.Domain.Ports;

public interface ILocalModelScanner
{
    IReadOnlyList<string> FindAllGgufFiles();
}
