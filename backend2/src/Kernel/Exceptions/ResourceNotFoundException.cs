namespace Kernel.Exceptions;

public class ResourceNotFoundException : DomainException
{
    public ResourceNotFoundException(string resourceName, object resourceId)
        : base($"Ресурс '{resourceName}' с идентификатором '{resourceId}' не найден.",
               "RESOURCE_NOT_FOUND",
               404,
               new { ResourceName = resourceName, ResourceId = resourceId })
    {
    }
}
