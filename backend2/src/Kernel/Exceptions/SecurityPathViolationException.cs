namespace Kernel.Exceptions;

public class SecurityPathViolationException : DomainException
{
    public SecurityPathViolationException(string targetPath, string reason = "Попытка выхода за пределы разрешенных директорий (Path Traversal).")
        : base($"Нарушение безопасности файловой системы: {reason}",
               "SECURITY_PATH_VIOLATION",
               403,
               new { TargetPath = targetPath })
    {
    }
}
