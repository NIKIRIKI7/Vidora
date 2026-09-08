using System.Runtime.CompilerServices;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using Integrations.LLM.Local;
using Kernel.Exceptions;
using Kernel.Platform.Config;
using Kernel.Ports;
using LLama;
using LLama.Common;
using LLama.Sampling;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace Integrations.LLM;

public sealed class LlmClient : ILlmClient, IDisposable
{
    private readonly LlmOptions _options;
    private readonly AppStorageConfig _storageConfig;
    private readonly ILogger<LlmClient> _logger;
    private readonly ILoggerFactory _loggerFactory;
    private readonly SemaphoreSlim _semaphore = new(1, 1);

    private LLamaWeights? _weights;
    private ModelParams? _modelParams;
    private IChatTemplateFormatter _templateFormatter = new ChatMlFormatter();
    private bool _initialized;

    private static readonly JsonSerializerOptions JsonOpts = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        PropertyNameCaseInsensitive = true,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull
    };

    public LlmClient(
        IOptions<LlmOptions> options,
        IOptions<AppStorageConfig> storageConfig,
        ILogger<LlmClient> logger,
        ILoggerFactory loggerFactory)
    {
        _options = options.Value;
        _storageConfig = storageConfig.Value;
        _logger = logger;
        _loggerFactory = loggerFactory;
    }

    private void EnsureModelLoaded()
    {
        if (_initialized) return;

        lock (_semaphore)
        {
            if (_initialized) return;

            var fullPath = ResolveModelPath();

            if (!File.Exists(fullPath))
            {
                throw new FileNotFoundException(
                    $"Файл модели не найден: {fullPath}. Поместите GGUF модель в {_storageConfig.GetModelsDirectory()}/.");
            }

            _logger.LogInformation(
                "[LLamaSharp] Загрузка GGUF: {Path} (GPU Layers: {Layers}, Context: {Ctxt})",
                Path.GetFileName(fullPath), _options.GpuLayers, _options.ContextSize);

            _modelParams = new ModelParams(fullPath)
            {
                ContextSize = (uint)_options.ContextSize,
                GpuLayerCount = _options.GpuLayers
            };

            _weights = LLamaWeights.LoadFromFile(_modelParams);
            _templateFormatter = ChatTemplateResolver.Resolve(_weights, fullPath);
            _initialized = true;

            _logger.LogInformation(
                "[LLamaSharp] Модель загружена в память. Применен шаблон разметки: {Template}, Стоп-токены: {Stops}",
                _templateFormatter.GetType().Name,
                string.Join(", ", _templateFormatter.StopTokens));
        }
    }

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, EntryPoint = "GetShortPathNameW", SetLastError = true)]
    private static extern int GetShortPathName(string lpszLongPath, StringBuilder lpszShortPath, int cchBuffer);

    private string ResolveModelPath()
    {
        string fullPath;
        try
        {
            fullPath = Path.GetFullPath(_options.ModelPath);
        }
        catch
        {
            fullPath = _options.ModelPath;
        }

        if (!File.Exists(fullPath))
        {
            var modelsDir = _storageConfig.GetModelsDirectory();
            if (Directory.Exists(modelsDir))
            {
                var found = Directory.GetFiles(modelsDir, "*.gguf", SearchOption.AllDirectories).FirstOrDefault();
                if (found != null) fullPath = found;
            }
        }

        // On Windows, normalize non-ASCII paths (e.g. Cyrillic) to 8.3 short path
        // so native C++ fopen in llama.cpp does not fail on Unicode characters
        if (OperatingSystem.IsWindows() && File.Exists(fullPath))
        {
            var sb = new StringBuilder(1024);
            int len = GetShortPathName(fullPath, sb, sb.Capacity);
            if (len > 0)
            {
                return sb.ToString();
            }
        }

        return fullPath;
    }

    public async Task<string> GenerateTextAsync(LlmPromptSpec spec, CancellationToken cancellationToken = default)
    {
        EnsureModelLoaded();

        var prompt = _templateFormatter.Format(spec.Messages);
        var responseBuilder = new System.Text.StringBuilder();

        await _semaphore.WaitAsync(cancellationToken);
        try
        {
            var executor = new StatelessExecutor(_weights!, _modelParams!,
                _loggerFactory.CreateLogger<StatelessExecutor>());

            var inferenceParams = new InferenceParams
            {
                MaxTokens = spec.MaxTokens ?? 2048,
                AntiPrompts = _templateFormatter.StopTokens.ToList(),
                SamplingPipeline = new DefaultSamplingPipeline { Temperature = spec.Temperature }
            };

            await foreach (var token in executor.InferAsync(prompt, inferenceParams, cancellationToken))
            {
                responseBuilder.Append(token);
            }

            return responseBuilder.ToString().Trim();
        }
        finally
        {
            _semaphore.Release();
        }
    }

    public async Task<T?> GenerateJsonAsync<T>(LlmPromptSpec spec, CancellationToken cancellationToken = default)
    {
        var jsonSpec = spec with { JsonMode = true };
        var rawText = await GenerateTextAsync(jsonSpec, cancellationToken);
        var cleanJson = ExtractCleanJson(rawText);

        try
        {
            return JsonSerializer.Deserialize<T>(cleanJson, JsonOpts);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "[LLamaSharp] JSON deserialization error: {Raw}", rawText);
            return default;
        }
    }

    public async IAsyncEnumerable<string> StreamTextAsync(
        LlmPromptSpec spec,
        [EnumeratorCancellation] CancellationToken cancellationToken = default)
    {
        EnsureModelLoaded();

        var prompt = _templateFormatter.Format(spec.Messages);

        await _semaphore.WaitAsync(cancellationToken);
        try
        {
            var executor = new StatelessExecutor(_weights!, _modelParams!,
                _loggerFactory.CreateLogger<StatelessExecutor>());

            var inferenceParams = new InferenceParams
            {
                MaxTokens = spec.MaxTokens ?? 2048,
                AntiPrompts = _templateFormatter.StopTokens.ToList(),
                SamplingPipeline = new DefaultSamplingPipeline { Temperature = spec.Temperature }
            };

            await foreach (var token in executor.InferAsync(prompt, inferenceParams, cancellationToken))
            {
                yield return token;
            }
        }
        finally
        {
            _semaphore.Release();
        }
    }

    private static string ExtractCleanJson(string text)
    {
        var clean = text.Trim();
        if (clean.Contains("```json"))
        {
            var parts = clean.Split("```json", 2);
            if (parts.Length > 1)
            {
                clean = parts[1].Split("```", 2)[0];
            }
        }
        else if (clean.Contains("```"))
        {
            var parts = clean.Split("```", 2);
            if (parts.Length > 1)
            {
                clean = parts[1].Split("```", 2)[0];
            }
        }

        int start = clean.IndexOf('{');
        int end = clean.LastIndexOf('}');
        if (start != -1 && end > start)
        {
            return clean.Substring(start, end - start + 1).Trim();
        }

        int arrStart = clean.IndexOf('[');
        int arrEnd = clean.LastIndexOf(']');
        if (arrStart != -1 && arrEnd > arrStart)
        {
            return clean.Substring(arrStart, arrEnd - arrStart + 1).Trim();
        }

        return clean;
    }

    public void Dispose()
    {
        _weights?.Dispose();
        _semaphore.Dispose();
    }
}
