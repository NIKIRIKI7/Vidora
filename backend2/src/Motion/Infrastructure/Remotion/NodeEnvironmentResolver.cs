using System.Diagnostics;
using System.Text.RegularExpressions;
using Kernel.Exceptions;
using Kernel.Platform.FileSystem;
using Microsoft.Extensions.Logging;
using MotionContext.Domain.Ports;

namespace MotionContext.Infrastructure.Remotion;

public sealed partial class NodeEnvironmentResolver : INodeEnvironmentResolver
{
    private readonly IPathResolver _pathResolver;
    private readonly ILogger<NodeEnvironmentResolver> _logger;

    public NodeEnvironmentResolver(
        IPathResolver pathResolver,
        ILogger<NodeEnvironmentResolver> logger)
    {
        _pathResolver = pathResolver;
        _logger = logger;
    }

    public async Task<string> EnsureNodeExecutableAsync(CancellationToken ct = default)
    {
        var localNodeCandidates = GetLocalNodeCandidates();
        foreach (var candidate in localNodeCandidates)
        {
            if (File.Exists(candidate))
            {
                _logger.LogDebug("[NodeResolver] Обнаружен локальный бинарник Node: {Path}", candidate);
                return Path.GetFullPath(candidate);
            }
        }

        var systemVersion = await GetSystemNodeVersionAsync(ct);
        if (!string.IsNullOrWhiteSpace(systemVersion))
        {
            var match = MajorVersionRegex().Match(systemVersion);
            if (match.Success && int.TryParse(match.Groups[1].Value, out int major) && major < 24)
            {
                _logger.LogInformation("[NodeResolver] Используется системный Node.js ({Version})", systemVersion);
                return OperatingSystem.IsWindows() ? "node.exe" : "node";
            }

            _logger.LogWarning("[NodeResolver] Системный Node.js ({Version}) не поддерживается сборщиком Remotion (нужен LTS < 24)", systemVersion);
        }

        throw new DomainConflictException(
            "Совместимая среда Node.js (v20 или v22 LTS) не обнаружена. Пожалуйста, разверните Node в tools/node22/ или установите системный Node.",
            "NODE_ENVIRONMENT_MISSING");
    }

    public string ResolveRemotionCliScript()
    {
        var masterWorkspace = ResolveMasterWorkspaceDirectory();
        string[] candidates =
        [
            Path.Combine(masterWorkspace, "node_modules", "@remotion", "cli", "remotion-cli.js"),
            Path.Combine(masterWorkspace, "node_modules", "@remotion", "cli", "dist", "remotion-cli.js"),
            Path.Combine(masterWorkspace, "node_modules", "@remotion", "cli", "bin", "remotion.js"),
            Path.Combine(masterWorkspace, "node_modules", "remotion", "dist", "cli.js"),
            Path.Combine(masterWorkspace, "node_modules", "remotion", "bin.js")
        ];

        foreach (var candidate in candidates)
        {
            if (File.Exists(candidate))
            {
                return Path.GetFullPath(candidate);
            }
        }

        throw new FileNotFoundException(
            $"Скрипт Remotion CLI не найден в каталоге {masterWorkspace}. Убедитесь, что выполнен 'npm install'.");
    }

    public string ResolveMasterWorkspaceDirectory()
    {
        string[] candidates =
        [
            Path.Combine(Directory.GetCurrentDirectory(), "tools", "remotion_workspace"),
            Path.Combine(AppContext.BaseDirectory, "tools", "remotion_workspace"),
            Path.Combine(Directory.GetCurrentDirectory(), "remotion_workspace")
        ];

        foreach (var candidate in candidates)
        {
            if (Directory.Exists(candidate))
            {
                return _pathResolver.ResolveSafePath(candidate);
            }
        }

        var fallback = _pathResolver.ResolveSafePath(Path.Combine(Directory.GetCurrentDirectory(), "tools", "remotion_workspace"));
        Directory.CreateDirectory(fallback);
        return fallback;
    }

    public IReadOnlyDictionary<string, string> BuildExecutionEnvironment(string nodeExecutablePath)
    {
        var env = new Dictionary<string, string>();
        if (File.Exists(nodeExecutablePath))
        {
            var nodeDir = Path.GetDirectoryName(Path.GetFullPath(nodeExecutablePath));
            if (!string.IsNullOrEmpty(nodeDir))
            {
                var existingPath = Environment.GetEnvironmentVariable("PATH") ?? string.Empty;
                env["PATH"] = $"{nodeDir}{Path.PathSeparator}{existingPath}";
                env["NODE_SKIP_PLATFORM_CHECK"] = "1";
            }
        }
        return env;
    }

    private async Task<string?> GetSystemNodeVersionAsync(CancellationToken ct)
    {
        try
        {
            using var proc = new Process
            {
                StartInfo = new ProcessStartInfo
                {
                    FileName = OperatingSystem.IsWindows() ? "node.exe" : "node",
                    Arguments = "-v",
                    RedirectStandardOutput = true,
                    RedirectStandardError = true,
                    UseShellExecute = false,
                    CreateNoWindow = true
                }
            };

            if (!proc.Start()) return null;
            var output = await proc.StandardOutput.ReadToEndAsync(ct);
            await proc.WaitForExitAsync(ct);
            return proc.ExitCode == 0 ? output.Trim() : null;
        }
        catch
        {
            return null;
        }
    }

    private static IReadOnlyList<string> GetLocalNodeCandidates()
    {
        var cwd = Directory.GetCurrentDirectory();
        var baseDir = AppContext.BaseDirectory;
        string exe = OperatingSystem.IsWindows() ? "node.exe" : "bin/node";

        return
        [
            Path.Combine(cwd, "tools", "node22", exe),
            Path.Combine(baseDir, "tools", "node22", exe),
            Path.Combine(cwd, "tools", "node", exe),
            Path.Combine(baseDir, "tools", "node", exe)
        ];
    }

    [GeneratedRegex(@"^v(\d+)\.")]
    private static partial Regex MajorVersionRegex();
}
