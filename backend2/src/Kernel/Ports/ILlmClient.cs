namespace Kernel.Ports;

public record LlmPromptMessage(string Role, string Content);

public record LlmPromptSpec(
    IReadOnlyList<LlmPromptMessage> Messages,
    float Temperature = 0.7f,
    int? MaxTokens = null,
    bool JsonMode = false);

public interface ILlmClient
{
    Task<string> GenerateTextAsync(LlmPromptSpec spec, CancellationToken cancellationToken = default);
    Task<T?> GenerateJsonAsync<T>(LlmPromptSpec spec, CancellationToken cancellationToken = default);
    IAsyncEnumerable<string> StreamTextAsync(LlmPromptSpec spec, CancellationToken cancellationToken = default);
}
