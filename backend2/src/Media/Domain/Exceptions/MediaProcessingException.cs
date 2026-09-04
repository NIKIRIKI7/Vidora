using Kernel.Exceptions;

namespace MediaContext.Domain.Exceptions;

public class MediaProcessingException : DomainException
{
    public MediaProcessingException(string message, string? target = null, Exception? inner = null)
        : base($"[MediaEngine] Сбой обработки медиафайла: {message}",
               "MEDIA_PROCESSING_FAILED",
               502,
               new { Target = target },
               inner)
    {
    }
}
