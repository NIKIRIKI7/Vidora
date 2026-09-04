using Microsoft.Extensions.Logging;

namespace Kernel.Platform.Logging;

public static class JsonLinesLoggerExtensions
{
    public static ILoggingBuilder AddJsonLinesFile(this ILoggingBuilder builder, string filePath)
    {
        builder.AddProvider(new JsonLinesFileLoggerProvider(filePath));
        return builder;
    }
}
