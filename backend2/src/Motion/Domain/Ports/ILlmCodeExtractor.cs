namespace MotionContext.Domain.Ports;

public interface ILlmCodeExtractor
{
    SanitizationResult ExtractAndSanitize(string rawLlmResponse);
}
