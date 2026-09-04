using Kernel.Exceptions;

namespace Voice.Domain.Exceptions;

public class SpeechAlignmentException : DomainException
{
    public SpeechAlignmentException(string message, string? target = null, Exception? inner = null)
        : base($"[Alignment] Ошибка пословного выравнивания: {message}",
               "SPEECH_ALIGNMENT_FAILED",
               502,
               new { Target = target },
               inner)
    {
    }
}
