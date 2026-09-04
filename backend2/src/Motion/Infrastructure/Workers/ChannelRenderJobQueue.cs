using System.Runtime.CompilerServices;
using System.Threading.Channels;
using MotionContext.Domain.Ports;
using MotionContext.Domain.ValueObjects;

namespace MotionContext.Infrastructure.Workers;

public sealed class ChannelRenderJobQueue : IRenderJobQueue
{
    private readonly Channel<RenderJobId> _channel = Channel.CreateUnbounded<RenderJobId>(
        new UnboundedChannelOptions
        {
            SingleReader = true,
            SingleWriter = false
        });

    public ValueTask EnqueueAsync(RenderJobId jobId, CancellationToken ct = default)
    {
        return _channel.Writer.WriteAsync(jobId, ct);
    }

    public async IAsyncEnumerable<RenderJobId> DequeueAllAsync([EnumeratorCancellation] CancellationToken ct = default)
    {
        while (await _channel.Reader.WaitToReadAsync(ct))
        {
            while (_channel.Reader.TryRead(out var jobId))
            {
                yield return jobId;
            }
        }
    }
}
