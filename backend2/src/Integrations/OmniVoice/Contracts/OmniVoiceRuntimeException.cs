namespace Integrations.OmniVoice.Contracts;

/// <summary>
/// Возникает, когда нативный GGML-рантайм OmniVoice (omnivoice_native.dll, сборка audio.cpp/omnivoice.cpp)
/// недоступен или вернул ошибку. Отличается от общей ошибки инференса тем, что указывает на
/// отсутствие/сбой нативной библиотеки, а не на проблему с весами модели.
/// </summary>
public sealed class OmniVoiceRuntimeException : Exception
{
    public OmniVoiceRuntimeException(string message)
        : base(message)
    {
    }

    public OmniVoiceRuntimeException(string message, Exception inner)
        : base(message, inner)
    {
    }
}