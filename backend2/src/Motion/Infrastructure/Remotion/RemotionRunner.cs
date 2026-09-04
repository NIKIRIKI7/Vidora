using System.Text.RegularExpressions;
using Kernel.Exceptions;
using Kernel.Platform.FileSystem;
using Kernel.Platform.Process;
using Kernel.Ports;
using Microsoft.Extensions.Logging;
using MotionContext.Domain.Ports;

namespace MotionContext.Infrastructure.Remotion;

public sealed partial class RemotionRunner : IRemotionRunner
{
    private readonly INodeEnvironmentResolver _nodeResolver;
    private readonly IProcessSupervisor _processSupervisor;
    private readonly IPathResolver _pathResolver;
    private readonly ILogger<RemotionRunner> _logger;

    public RemotionRunner(
        INodeEnvironmentResolver nodeResolver,
        IProcessSupervisor processSupervisor,
        IPathResolver pathResolver,
        ILogger<RemotionRunner> logger)
    {
        _nodeResolver = nodeResolver;
        _processSupervisor = processSupervisor;
        _pathResolver = pathResolver;
        _logger = logger;
    }

    public async Task RenderAsync(
        RemotionRenderSpec spec,
        IProgress<RemotionProgress>? progress = null,
        CancellationToken cancellationToken = default)
    {
        var safeEntry = _pathResolver.ResolveSafePath(spec.EntryPointTsx);
        var safeOutput = _pathResolver.ResolveSafePath(spec.OutputMp4Path);
        var workingDir = Path.GetDirectoryName(safeEntry) ?? Directory.GetCurrentDirectory();

        var nodeExe = await _nodeResolver.EnsureNodeExecutableAsync(cancellationToken);
        var remotionJs = _nodeResolver.ResolveRemotionCliScript();
        var envVars = _nodeResolver.BuildExecutionEnvironment(nodeExe);

        var propsPath = Path.Combine(workingDir, "inputProps.json");

        var arguments = $"\"{remotionJs}\" render \"{safeEntry}\" \"{spec.CompositionId}\" \"{safeOutput}\" " +
                        $"--props=\"{propsPath}\" " +
                        "--gl=swangle " +
                        "--concurrency=2 " +
                        "--headless " +
                        "--disable-dev-shm-usage " +
                        "--no-sandbox " +
                        "--disable-gpu-sandbox";

        _logger.LogInformation("[RemotionRunner] Старт рендера → {Output}", safeOutput);

        var result = await _processSupervisor.RunAsync(
            nodeExe,
            arguments,
            workingDirectory: workingDir,
            environmentVariables: envVars,
            onStdOut: line =>
            {
                var match = ProgressRegex().Match(line);
                if (match.Success &&
                    int.TryParse(match.Groups[1].Value, out int cur) &&
                    int.TryParse(match.Groups[2].Value, out int tot))
                {
                    double pct = tot > 0 ? Math.Round((double)cur / tot * 100.0, 1) : 0.0;
                    progress?.Report(new RemotionProgress(cur, tot, pct));
                }
            },
            onStdErr: line => _logger.LogDebug("[RemotionCLI] {Line}", line),
            cancellationToken: cancellationToken);

        if (result.ExitCode != 0 || !File.Exists(safeOutput))
        {
            var err = string.IsNullOrWhiteSpace(result.StandardError) ? result.StandardOutput : result.StandardError;
            _logger.LogError("[RemotionRunner] Сбой (ExitCode={Code}): {Error}", result.ExitCode, err);
            throw new ProcessExecutionException("remotion", result.ExitCode, err, safeEntry);
        }

        var fileInfo = new FileInfo(safeOutput);
        _logger.LogInformation("[RemotionRunner] Рендер завершен: {Path} ({SizeMb:F2} MB)",
            safeOutput, (double)fileInfo.Length / (1024 * 1024));
    }

    [GeneratedRegex(@"(?:Rendered|Rendering frames)\s+(\d+)\/(\d+)")]
    private static partial Regex ProgressRegex();
}
