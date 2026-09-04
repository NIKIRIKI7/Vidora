using Kernel.Exceptions;

namespace Voice.Domain.Exceptions;

public class VoiceSynthesisException : DomainException
{
    public VoiceSynthesisException(string message, string? target = null, Exception? inner = null)
        : base($"[TTS] Ошибка синтеза речи: {message}",
               "VOICE_SYNTHESIS_FAILED",
               502,
               new { Target = target },
               inner)
    {
    }
}
