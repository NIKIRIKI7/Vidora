using System.Collections.Concurrent;
using System.Text.RegularExpressions;
using Kernel.Exceptions;
using Microsoft.Extensions.Logging;

namespace Kernel.Platform.FileSystem;

public sealed partial class PathResolver : IPathResolver
{
    private static readonly HashSet<string> ReservedDeviceNames = new(StringComparer.OrdinalIgnoreCase)
    {
        "CON", "PRN", "AUX", "NUL",
        "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7", "COM8", "COM9",
        "LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9"
    };

    private readonly ConcurrentDictionary<string, byte> _allowedRoots = new(StringComparer.OrdinalIgnoreCase);
    private readonly ILogger<PathResolver> _logger;

    public PathResolver(ILogger<PathResolver> logger, IEnumerable<string>? initialAllowedRoots = null)
    {
        _logger = logger;
        var roots = initialAllowedRoots?.Where(r => !string.IsNullOrWhiteSpace(r)).ToList();

        if (roots != null && roots.Count > 0)
        {
            foreach (var root in roots)
            {
                RegisterAllowedRoot(root);
            }
        }
        else
        {
            RegisterAllowedRoot(Directory.GetCurrentDirectory());
        }
    }

    public void RegisterAllowedRoot(string rootDirectory)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(rootDirectory);

        var fullPath = NormalizeDirectoryPath(Path.GetFullPath(rootDirectory));
        if (_allowedRoots.TryAdd(fullPath, 0))
        {
            _logger.LogInformation("[Песочница] Зарегистрирован разрешенный корень: {RootPath}", fullPath);
        }
    }

    public bool IsSafePath(string path, string? subRoot = null)
    {
        if (string.IsNullOrWhiteSpace(path))
        {
            return false;
        }

        try
        {
            var targetFullPath = ResolveSymlinksIfExist(Path.GetFullPath(path));
            var roots = subRoot != null
                ? [NormalizeDirectoryPath(Path.GetFullPath(subRoot))]
                : _allowedRoots.Keys;

            return roots.Any(root =>
                targetFullPath.Equals(root, StringComparison.OrdinalIgnoreCase) ||
                targetFullPath.StartsWith(root + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase));
        }
        catch (Exception ex) when (ex is ArgumentException or NotSupportedException or PathTooLongException)
        {
            _logger.LogWarning(ex, "[Песочница] Синтаксическая ошибка пути: {Path}", path);
            return false;
        }
    }

    public string ResolveSafePath(string path, string? subRoot = null)
    {
        if (string.IsNullOrWhiteSpace(path))
        {
            throw new SecurityPathViolationException(string.Empty, "Передан пустой путь.");
        }

        string fullPath;
        try
        {
            fullPath = Path.GetFullPath(path);
        }
        catch (Exception ex) when (ex is ArgumentException or NotSupportedException or PathTooLongException)
        {
            throw new SecurityPathViolationException(path, $"Некорректный синтаксис пути: {ex.Message}");
        }

        if (!IsSafePath(fullPath, subRoot))
        {
            var availableRoots = subRoot ?? string.Join("; ", _allowedRoots.Keys);
            _logger.LogCritical("[Песочница] PATH TRAVERSAL АТАКА: путь {FullPath} выходит за пределы [{Roots}]", fullPath, availableRoots);
            throw new SecurityPathViolationException(fullPath, $"Путь '{fullPath}' выходит за пределы доверенной песочницы: [{availableRoots}].");
        }

        return fullPath;
    }

    public string SanitizeFileName(string fileName)
    {
        if (string.IsNullOrWhiteSpace(fileName))
        {
            return "unnamed_file";
        }

        var cleaned = InvalidFileNameRegex().Replace(fileName, "_").Trim('.', ' ', '_');
        if (string.IsNullOrWhiteSpace(cleaned))
        {
            return "unnamed_file";
        }

        // Защита от опасных устройств DOS/Windows
        var nameWithoutExtension = Path.GetFileNameWithoutExtension(cleaned);
        if (ReservedDeviceNames.Contains(nameWithoutExtension))
        {
            cleaned = "_" + cleaned;
        }

        return cleaned;
    }

    private static string NormalizeDirectoryPath(string path)
    {
        var root = Path.GetPathRoot(path);
        if (string.Equals(path, root, StringComparison.OrdinalIgnoreCase))
        {
            return path.TrimEnd(Path.AltDirectorySeparatorChar);
        }
        return path.TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);
    }

    private static string ResolveSymlinksIfExist(string path)
    {
        if (File.Exists(path))
        {
            var fileInfo = new FileInfo(path);
            if (fileInfo.LinkTarget != null)
            {
                return Path.GetFullPath(fileInfo.ResolveLinkTarget(returnFinalTarget: true)?.FullName ?? path);
            }
        }
        else if (Directory.Exists(path))
        {
            var dirInfo = new DirectoryInfo(path);
            if (dirInfo.LinkTarget != null)
            {
                return Path.GetFullPath(dirInfo.ResolveLinkTarget(returnFinalTarget: true)?.FullName ?? path);
            }
        }

        return path;
    }

    [GeneratedRegex(@"[^\w\.\-\u0400-\u04FF]")]
    private static partial Regex InvalidFileNameRegex();
}
