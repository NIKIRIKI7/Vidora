namespace Integrations.LLM;

public sealed class LlmOptions
{
    public const string SectionName = "Integrations:LLM";

    /// <summary>
    /// Относительный или абсолютный путь к .gguf файлу модели.
    /// </summary>
    public string ModelPath { get; set; } = "ai-models/gemma3-4b/gemma-3-4b-it-Q4_K_M.gguf";

    /// <summary>
    /// Размер контекстного окна (токенов).
    /// </summary>
    public int ContextSize { get; set; } = 4096;

    /// <summary>
    /// Количество слоев для выгрузки в GPU (0 = только CPU).
    /// </summary>
    public int GpuLayers { get; set; } = 0;
}
