namespace Kernel.Exceptions;

public abstract class DomainException : Exception
{
    public string ErrorCode { get; }
    public int StatusCode { get; }
    public object? Details { get; }

    protected DomainException(
        string message,
        string errorCode = "DOMAIN_ERROR",
        int statusCode = 400,
        object? details = null,
        Exception? innerException = null)
        : base(message, innerException)
    {
        ErrorCode = errorCode;
        StatusCode = statusCode;
        Details = details;
    }
}
