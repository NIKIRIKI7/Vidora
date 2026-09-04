using Kernel.Ports;
using Microsoft.Extensions.Logging;

namespace MotionContext.Infrastructure.Llm;

public sealed class StubLlmClient : ILlmClient
{
    private readonly ILogger<StubLlmClient> _logger;

    public StubLlmClient(ILogger<StubLlmClient> logger) => _logger = logger;

    public Task<string> GenerateTextAsync(LlmPromptSpec spec, CancellationToken ct = default)
    {
        _logger.LogWarning("[StubLlmClient] Используется заглушка. LLM-клиент не подключен.");

        var userMsg = spec.Messages.FirstOrDefault(m => m.Role == "user")?.Content ?? "";
        var lines = userMsg.Split('\n', StringSplitOptions.RemoveEmptyEntries);

        string visualNote = "Animate text with fade in";
        string voiceText = "Hello world";
        int durationFrames = 90;
        int width = 1080;
        int height = 1920;

        foreach (var line in lines)
        {
            if (line.Contains("Visual Note:")) visualNote = line.Split(':', 2).Last().Trim();
            if (line.Contains("Voice Text:")) voiceText = line.Trim('"', ' ', '-').Split(':').Last().Trim().Trim('"');
            if (line.Contains("frames"))
            {
                var parts = line.Split(' ');
                foreach (var p in parts)
                    if (int.TryParse(p, out var f) && f > 10) { durationFrames = f; break; }
            }
            if (line.Contains("Dimensions:"))
            {
                var dim = line.Split('x');
                if (dim.Length == 2)
                {
                    int.TryParse(dim[0].Trim().Split(' ').Last(), out width);
                    int.TryParse(dim[1].Trim().Split(' ').Last(), out height);
                }
            }
        }

        var code = $@"import React from 'react';
import {{ useCurrentFrame, useVideoConfig, interpolate, spring, AbsoluteFill }} from 'remotion';

const Scene: React.FC = () => {{
  const frame = useCurrentFrame();
  const {{ fps, durationInFrames }} = useVideoConfig();

  const opacity = interpolate(frame, [0, 20], [0, 1], {{ extrapolateRight: 'clamp' }});
  const scale = spring({{ frame, fps, config: {{ damping: 12, stiffness: 200 }} }});
  const translateX = interpolate(frame, [0, 30], [-100, 0], {{ extrapolateRight: 'clamp' }});

  const bgColor = '#121212';
  const textColor = '#ffffff';

  return (
    <AbsoluteFill style={{{{
      backgroundColor: bgColor,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'column',
    }}}}>
      <div style={{{{
        opacity,
        transform: `scale(${{scale}}) translateX(${{translateX}}px)`,
        color: textColor,
        fontSize: 72,
        fontWeight: 'bold',
        fontFamily: 'Inter, sans-serif',
        textAlign: 'center',
        padding: '0 60px',
      }}}}>
        {voiceText}
      </div>
      <div style={{{{
        opacity: interpolate(frame, [15, 35], [0, 0.6], {{ extrapolateRight: 'clamp' }}),
        color: '#888888',
        fontSize: 28,
        marginTop: 40,
        fontFamily: 'Inter, sans-serif',
      }}}}>
        {visualNote}
      </div>
    </AbsoluteFill>
  );
}};

export default Scene;";

        return Task.FromResult(code);
    }

    public Task<T?> GenerateJsonAsync<T>(LlmPromptSpec spec, CancellationToken ct = default)
    {
        return Task.FromResult<T?>(default);
    }

    public async IAsyncEnumerable<string> StreamTextAsync(LlmPromptSpec spec, [System.Runtime.CompilerServices.EnumeratorCancellation] CancellationToken ct = default)
    {
        var result = await GenerateTextAsync(spec, ct);
        yield return result;
    }
}
