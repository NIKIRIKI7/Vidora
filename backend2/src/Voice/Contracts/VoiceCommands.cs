using Voice.Domain;
using Voice.Domain.ValueObjects;

namespace Voice.Contracts;

public sealed record SynthesizeSpeechCommand(
    string Text,
    string SpeakerId,
    VoiceEngineType? Engine = null,
    AlignmentEngineType AlignmentEngine = AlignmentEngineType.Whisper,
    double Speed = 1.0,
    double Pitch = 1.0,
    string? ReferenceAudioPath = null,
    AudioFilterSpec? Filters = null,
    double GuidanceScale = 3.0,
    int NumSteps = 32,
    bool Denoise = true,
    double Duration = 0.0,
    bool PreprocessPrompt = true,
    bool PostprocessOutput = true)
{
    public static SynthesizeSpeechCommand ForSpeaker(string text, string speakerId, double speed = 1.0) =>
        new(Text: text, SpeakerId: speakerId, Speed: speed);
}

public sealed record BatchItemSpec(
    string Text,
    string SpeakerId,
    VoiceEngineType? Engine = null,
    AlignmentEngineType AlignmentEngine = AlignmentEngineType.Whisper,
    double Speed = 1.0,
    double Pitch = 1.0,
    double GuidanceScale = 2.0,
    int NumSteps = 24);

public sealed record BatchSynthesizeVoiceCommand(
    IReadOnlyList<BatchItemSpec> Items,
    AudioFilterSpec? Filters = null);

public sealed record ApplyAudioDuckingCommand(
    string VoiceAssetId,
    string BgmAssetId,
    DuckingSpec? Ducking = null)
{
    public static ApplyAudioDuckingCommand ForAssets(string voiceAssetId, string bgmAssetId) =>
        new(voiceAssetId, bgmAssetId);
}

public sealed record UploadedAudioFile(
    string FileName,
    Stream ContentStream);

public sealed record BatchUploadScenesCommand(
    string ProjectPath,
    IReadOnlyList<string> SceneIds,
    IReadOnlyList<UploadedAudioFile> Files);
