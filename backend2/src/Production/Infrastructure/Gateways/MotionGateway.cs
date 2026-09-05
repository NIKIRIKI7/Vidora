using MotionContext.Contracts;
using ProductionContext.Domain.Ports;

namespace ProductionContext.Infrastructure.Gateways;

public sealed class MotionGateway : IMotionGateway
{
    private readonly IMotionModule _motionModule;

    public MotionGateway(IMotionModule motionModule)
    {
        _motionModule = motionModule;
    }

    public async Task<string> GenerateSceneCodeAsync(
        string projectId,
        string sceneId,
        string visualDescription,
        string voiceText,
        double durationSeconds,
        int width,
        int height,
        int fps,
        CancellationToken ct = default)
    {
        var request = new GenerateSceneCodeRequest(
            ProjectId: projectId,
            SceneId: sceneId,
            VisualDescription: visualDescription,
            VoiceText: voiceText,
            DurationSeconds: durationSeconds,
            Width: width,
            Height: height,
            Fps: fps,
            MontageSettings: null,
            Capabilities: ["tailwind", "lucide-react"]);

        var dto = await _motionModule.GenerateSceneCodeAsync(request, ct);
        return dto.Id;
    }

    public async Task<string> RenderSceneVideoAsync(
        string sceneCodeId,
        IProgress<double>? progress = null,
        CancellationToken ct = default)
    {
        var startRequest = new StartRenderRequest(null, null);
        var job = await _motionModule.StartRenderAsync(sceneCodeId, startRequest, ct);

        using var pollCts = new CancellationTokenSource(TimeSpan.FromMinutes(10));
        using var linked = CancellationTokenSource.CreateLinkedTokenSource(ct, pollCts.Token);

        while (!linked.Token.IsCancellationRequested)
        {
            var status = await _motionModule.GetRenderStatusAsync(job.Id, linked.Token);
            progress?.Report(status.Percentage);

            if (status.Status == MotionContext.Domain.RenderJobStatus.Done)
            {
                return status.OutputPath ?? throw new InvalidOperationException("Рендер завершен без выходного пути.");
            }

            if (status.Status == MotionContext.Domain.RenderJobStatus.Failed)
            {
                throw new InvalidOperationException($"Сбой рендеринга сцены: {status.ErrorMessage}");
            }

            await Task.Delay(1000, linked.Token);
        }

        throw new TimeoutException("Превышен таймаут рендеринга Remotion-сцены.");
    }
}
