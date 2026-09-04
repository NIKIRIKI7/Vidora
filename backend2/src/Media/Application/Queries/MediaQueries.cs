using MediaContext.Domain;

namespace MediaContext.Application.Queries;

public sealed record GetAssetByIdQuery(string AssetId);

public sealed record GetAssetsPagedQuery(
    MediaType? Type,
    int Page = 1,
    int PageSize = 50);

public sealed record SearchStockVideosQuery(
    string Query,
    string? Orientation = null,
    int Page = 1,
    int PerPage = 15);
