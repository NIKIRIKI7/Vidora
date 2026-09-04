using MediaContext.Domain;

namespace MediaContext.Application.Commands;

public sealed record NormalizeBrollCommand(
    string AssetId,
    int TargetWidth,
    int TargetHeight,
    double TargetFps = 30.0);

public sealed record DeleteMediaAssetCommand(string AssetId);
