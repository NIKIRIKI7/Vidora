namespace Kernel.Exceptions;

/// <summary>
/// Выбрасывается при нарушении бизнес-инвариантов состояния агрегата
/// (например, удаление системного ресурса, сброс пользовательского скила, изменение readonly-настройки).
/// Маппится ExceptionHandlingMiddleware в HTTP 409 Conflict.
/// </summary>
public class DomainConflictException : DomainException
{
    public DomainConflictException(
        string message,
        string errorCode = "DOMAIN_CONFLICT",
        object? details = null,
        Exception? innerException = null)
        : base(message, errorCode, 409, details, innerException)
    {
    }
}
