using System.Text.Json;
using Kernel.Exceptions;
using Kernel.Platform.Gpu;
using Microsoft.Extensions.Logging;

namespace Kernel.Platform.Process;

public sealed class MlProcessHost : IMlProcessHost
{
    private readonly IProcessSupervisor _processSupervisor;
    private readonly IGpuManager _gpuManager;
    private readonly IPythonEnvironmentResolver _pythonResolver;
    private readonly ILogger<MlProcessHost> _logger;

    public MlProcessHost(
        IProcessSupervisor processSupervisor,
        IGpuManager gpuManager,
        IPythonEnvironmentResolver pythonResolver,
        ILogger<MlProcessHost> logger)
    {
        _processSupervisor = processSupervisor;
        _gpuManager = gpuManager;
        _pythonResolver = pythonResolver;
        _logger = logger;
    }

    public async Task<ProcessExecutionResult> ExecuteScriptAsync(
        string scriptRelativePath,
        object? jsonPayload = null,
        string? additionalArguments = null,
        string? contextName = null,
        bool acquireGpuLock = true,
        CancellationToken cancellationToken = default)
    {
        var scriptPath = _pythonResolver.ResolveScriptPath(scriptRelativePath);
        var pythonExe = _pythonResolver.ResolvePythonExecutable();
        var executionContext = contextName ?? Path.GetFileNameWithoutExtension(scriptPath);

        IAsyncDisposable? gpuLock = null;
        if (acquireGpuLock)
        {
            gpuLock = await _gpuManager.AcquireGpuLockAsync(executionContext, cancellationToken);
        }

        try
        {
            var envVars = new Dictionary<string, string>();
            if (jsonPayload != null)
            {
                var payloadJson = JsonSerializer.Serialize(jsonPayload);
                envVars["ML_TASK_PAYLOAD"] = payloadJson;
            }

            var args = $"\"{scriptPath}\"";
            if (!string.IsNullOrWhiteSpace(additionalArguments))
            {
                args += $" {additionalArguments.Trim()}";
            }

            _logger.LogDebug("[MLHost] Запуск {Script} через {Python}", scriptPath, pythonExe);

            var result = await _processSupervisor.RunAsync(
                pythonExe,
                args,
                workingDirectory: Path.GetDirectoryName(scriptPath),
                environmentVariables: envVars,
                cancellationToken: cancellationToken);

            if (result.ExitCode != 0)
            {
                _logger.LogError("[MLHost] Сбой скрипта {Script} (ExitCode: {Code}): {Error}", 
                    scriptPath, result.ExitCode, result.StandardError);
                throw new ProcessExecutionException(Path.GetFileName(scriptPath), result.ExitCode, result.StandardError, scriptPath);
            }

            return result;
        }
        finally
        {
            if (gpuLock != null)
            {
                await gpuLock.DisposeAsync();
            }
        }
    }
}
