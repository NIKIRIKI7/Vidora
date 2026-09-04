using Kernel.Exceptions;

namespace Voice.Domain.Exceptions;

public class AudioProcessingException : DomainException
{
    public AudioProcessingException(string message, string? target = null, Exception? inner = null)
        : base($"[AudioDSP] Ошибка звуковой обработки: {message}",
               "AUDIO_PROCESSING_FAILED",
               502,
               new { Target = target },
               inner)
    {
    }
}
