namespace Kernel.Exceptions;

public class ValidationException : DomainException
{
    public IReadOnlyDictionary<string, string[]> Errors { get; }

    public ValidationException(string message, IReadOnlyDictionary<string, string[]> errors)
        : base(message, "VALIDATION_FAILED", 422, errors)
    {
        Errors = errors;
    }

    public ValidationException(string field, string error)
        : this("Ошибка валидации данных.", new Dictionary<string, string[]> { [field] = [error] })
    {
    }
}
