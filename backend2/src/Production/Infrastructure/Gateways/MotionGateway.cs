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

}
