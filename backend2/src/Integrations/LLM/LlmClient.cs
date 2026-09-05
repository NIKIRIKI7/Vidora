using System.Runtime.CompilerServices;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using Kernel.Exceptions;
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
    private readonly ILogger<LlmClient> _logger;
    private readonly ILoggerFactory _loggerFactory;
    private readonly SemaphoreSlim _semaphore = new(1, 1);

    private LLamaWeights? _weights;
    private ModelParams? _modelParams;
    private bool _initialized;

    private static readonly JsonSerializerOptions JsonOpts = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        PropertyNameCaseInsensitive = true,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull
    };

    public LlmClient(
        IOptions<LlmOptions> options,
        ILogger<LlmClient> logger,
        ILoggerFactory loggerFactory)
    {
        _options = options.Value;
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
                    $"Model file not found: {fullPath}. Download Gemma 3 GGUF to ai-models/.");
            }

            _logger.LogInformation(
                "[LLamaSharp] Loading GGUF: {Path} (GPU Layers: {Layers}, Context: {Ctxt})",
                Path.GetFileName(fullPath), _options.GpuLayers, _options.ContextSize);

            _modelParams = new ModelParams(fullPath)
            {
                ContextSize = (uint)_options.ContextSize,
                GpuLayerCount = _options.GpuLayers
            };

            _weights = LLamaWeights.LoadFromFile(_modelParams);
            _initialized = true;

            _logger.LogInformation("[LLamaSharp] Model loaded into memory");
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
            var fallbackDir = Path.Combine(Directory.GetCurrentDirectory(), "ai-models");
            if (Directory.Exists(fallbackDir))
            {
                var found = Directory.GetFiles(fallbackDir, "*.gguf", SearchOption.AllDirectories)
                    .FirstOrDefault();
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

        var prompt = FormatGemmaPrompt(spec);
        var responseBuilder = new System.Text.StringBuilder();

        await _semaphore.WaitAsync(cancellationToken);
        try
        {
            var executor = new StatelessExecutor(_weights!, _modelParams!,
                _loggerFactory.CreateLogger<StatelessExecutor>());

            var inferenceParams = new InferenceParams
            {
                MaxTokens = spec.MaxTokens ?? 2048,
                AntiPrompts = new List<string> { "<end_of_turn>", "<eos>", "<|im_start|>" },
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

        var prompt = FormatGemmaPrompt(spec);

        await _semaphore.WaitAsync(cancellationToken);
        try
        {
            var executor = new StatelessExecutor(_weights!, _modelParams!,
                _loggerFactory.CreateLogger<StatelessExecutor>());

            var inferenceParams = new InferenceParams
            {
                MaxTokens = spec.MaxTokens ?? 2048,
                AntiPrompts = new List<string> { "<end_of_turn>", "<eos>", "<|im_start|>" },
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

    private static string FormatGemmaPrompt(LlmPromptSpec spec)
    {
        var sb = new System.Text.StringBuilder();

        var systemMsg = spec.Messages.FirstOrDefault(m => m.Role.Equals("system", StringComparison.OrdinalIgnoreCase))?.Content;
        var userMessages = spec.Messages.Where(m => m.Role.Equals("user", StringComparison.OrdinalIgnoreCase)).ToList();

        sb.Append("<start_of_turn>user\n");
        if (!string.IsNullOrWhiteSpace(systemMsg))
        {
            sb.Append("[System Instructions]\n").Append(systemMsg.Trim()).Append("\n\n");
        }

        foreach (var msg in userMessages)
        {
            sb.Append(msg.Content.Trim()).Append("\n");
        }

        sb.Append("<end_of_turn>\n<start_of_turn>model\n");
        return sb.ToString();
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
