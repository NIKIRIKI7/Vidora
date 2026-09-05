using System.Text.Json.Serialization;

namespace ProductionContext.Domain;

[JsonConverter(typeof(JsonStringEnumConverter))]
public enum PipelineStep
{
    Drafting,
    ScenarioParsing,
    VoiceGeneration,
    TimingSynchronization,
    MotionCodeGeneration,
    SceneRendering,
    AudioMuxing,
    FinalAssembly,
    Completed,
    Failed
}
