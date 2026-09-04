using Microsoft.Extensions.Logging;
using Voice.Domain;
using Voice.Domain.Ports;
using Voice.Domain.ValueObjects;

namespace Voice.Infrastructure.Alignment;

public sealed class NativeFallbackAlignmentProvider : IForcedAlignmentProvider
{
    public AlignmentEngineType EngineType => AlignmentEngineType.NativeTts;

    private readonly ILogger<NativeFallbackAlignmentProvider> _logger;

    public NativeFallbackAlignmentProvider(ILogger<NativeFallbackAlignmentProvider> logger)
    {
        _logger = logger;
    }

    public Task<AlignmentData> AlignAsync(string audioFilePath, string expectedText, CancellationToken ct = default)
    {
        _logger.LogInformation("[NativeAligner] Применение линейного выравнивания слов без обращения к нейросети...");
        var tokens = expectedText.Split([' ', '\n', '\r', '\t'], StringSplitOptions.RemoveEmptyEntries);
        if (tokens.Length == 0) return Task.FromResult(AlignmentData.Empty);

        long totalDurationMs = 1500;
        if (File.Exists(audioFilePath))
        {
            totalDurationMs = Math.Max(400, (long)(new FileInfo(audioFilePath).Length / (44100.0 * 2) * 1000));
        }

        long step = totalDurationMs / tokens.Length;
        var words = new List<TimedWord>();
        for (int i = 0; i < tokens.Length; i++)
        {
            long start = i * step;
            long end = (i == tokens.Length - 1) ? totalDurationMs : (i + 1) * step;
            words.Add(new TimedWord(tokens[i], start, end, 1.0));
        }

        return Task.FromResult(new AlignmentData(words, totalDurationMs, "NativeEstimator"));
    }
}
