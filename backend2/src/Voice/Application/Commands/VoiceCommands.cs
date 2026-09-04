using Voice.Domain;
using Voice.Domain.ValueObjects;

namespace Voice.Application.Commands;

public sealed record SynthesizeSpeechCommand(
    string Text,
    VoiceEngineType Engine,
    string SpeakerId,
    AlignmentEngineType AlignmentEngine = AlignmentEngineType.Whisper,
    double Speed = 1.0,
    double Pitch = 1.0,
    string? ReferenceAudioPath = null,
    AudioFilterSpec? Filters = null);

public sealed record BatchItemSpec(
    string Text,
    VoiceEngineType Engine,
    string SpeakerId,
    AlignmentEngineType AlignmentEngine = AlignmentEngineType.Whisper,
    double Speed = 1.0);

public sealed record BatchSynthesizeVoiceCommand(
    IReadOnlyList<BatchItemSpec> Items,
    AudioFilterSpec? Filters = null);

public sealed record ApplyAudioDuckingCommand(
    string VoiceAssetId,
    string BgmAssetId,
    DuckingSpec? Ducking = null);
