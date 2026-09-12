using Kernel.Exceptions;
using Kernel.Platform.Config;
using Microsoft.Extensions.Logging;

namespace Kernel.Platform.FileSystem;

/// <summary>
/// Разрешает физический путь к файлу ассета, когда клиент прислал относительный
/// путь проекта ("test/assets/voice/x.wav"), короткое имя файла или путь из
/// временного кэша генератора (data_storage/temp). Единая точка для Voice и Media.
/// </summary>
public static class StorageFileLocator
{
    public static string ResolveExistingAsset(
        IPathResolver pathResolver,
        AppStorageConfig storage,
        ILogger logger,
        string inputPath,
        string? projectPath = null)
    {
        if (string.IsNullOrWhiteSpace(inputPath))
            throw new ValidationException("path", "Путь к файлу пуст.");

        var cleanPath = inputPath.Split('?')[0].Trim().Replace('\\', '/');
        var fileName = Path.GetFileName(cleanPath);
        var dataStorage = Path.GetFullPath(storage.DataStorageDir);
        var projectsDir = Path.Combine(dataStorage, storage.ProjectsDir);

        var candidates = new List<string>();

        // 1. Прямой путь (если внутри песочницы и существует).
        try
        {
            if (pathResolver.IsSafePath(cleanPath))
                candidates.Add(pathResolver.ResolveSafePath(cleanPath));
        }
        catch (Exception ex)
        {
            logger.LogDebug(ex, "[StorageFileLocator] Прямой путь '{Path}' не прошёл проверку песочницы", cleanPath);
        }

        // 2. Относительно каталога данных и его стандартных подпапок.
        if (!Path.IsPathRooted(cleanPath))
        {
            candidates.Add(Path.Combine(dataStorage, cleanPath));
            candidates.Add(Path.Combine(projectsDir, cleanPath));
            candidates.Add(Path.Combine(dataStorage, "temp", cleanPath));
        }

        if (!string.IsNullOrWhiteSpace(fileName))
        {
            candidates.Add(Path.Combine(dataStorage, "temp", "voice", fileName));
            candidates.Add(Path.Combine(dataStorage, "temp", fileName));
        }

        // 3. Каталоги конкретного проекта (voice / b-roll).
        var projectName = !string.IsNullOrWhiteSpace(projectPath)
            ? projectPath
            : cleanPath.Split('/', StringSplitOptions.RemoveEmptyEntries).FirstOrDefault();

        if (!string.IsNullOrWhiteSpace(projectName))
        {
            candidates.Add(Path.Combine(projectsDir, projectName, "assets", "voice", fileName));
            candidates.Add(Path.Combine(projectsDir, projectName, "assets", "b-roll", fileName));
            candidates.Add(Path.Combine(dataStorage, projectName, "assets", "voice", fileName));
        }

        // 4. Резервный поиск по всем проектам (смена имени каталога/локали).
        if (!string.IsNullOrWhiteSpace(fileName) && Directory.Exists(projectsDir))
        {
            try
            {
                foreach (var dir in Directory.EnumerateDirectories(projectsDir, "*", SearchOption.TopDirectoryOnly))
                {
                    candidates.Add(Path.Combine(dir, "assets", "voice", fileName));
                    candidates.Add(Path.Combine(dir, "assets", "b-roll", fileName));
                }
            }
            catch (Exception ex)
            {
                logger.LogWarning(ex, "[StorageFileLocator] Не удалось просканировать каталог проектов: {Root}", projectsDir);
            }
        }

        foreach (var candidate in candidates)
        {
            try
            {
                if (File.Exists(candidate))
                {
                    var resolved = Path.GetFullPath(candidate);
                    logger.LogInformation("[StorageFileLocator] '{Input}' разрешён в '{Resolved}'", inputPath, resolved);
                    return resolved;
                }
            }
            catch (Exception ex)
            {
                logger.LogDebug(ex, "[StorageFileLocator] Не удалось проверить кандидат {Candidate}", candidate);
            }
        }

        // Fallback — прежнее поведение: бросит понятную ошибку песочницы.
        return pathResolver.ResolveSafePath(cleanPath);
    }
}
