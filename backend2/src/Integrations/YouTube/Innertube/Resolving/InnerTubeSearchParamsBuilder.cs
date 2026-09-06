using Integrations.YouTube.Innertube.Contracts;

namespace Integrations.YouTube.Innertube.Resolving;

public static class InnerTubeSearchParamsBuilder
{
    public static string? Build(InnerTubeSearchFilter? filter)
    {
        if (filter == null) return null;

        var sortBy = MapSortBy(filter.SortBy);
        var uploadDate = MapUploadDate(filter.UploadDate);
        var duration = MapDuration(filter.Duration);
        var type = MapType(filter.Type);
        var features = MapFeatures(filter.Features);

        if (sortBy == 0 && uploadDate == 0 && duration == 0 && type == 0 && features == 0)
            return null;

        return EncodeProtobufParams(sortBy, uploadDate, duration, type, features);
    }

    public static string? BuildQuick(int daysBack = 0)
    {
        return daysBack switch
        {
            > 0 and <= 1 => "EgQIAhAB",
            > 0 and <= 7 => "EgQIAxAB",
            > 0 and <= 30 => "EgQIBBAB",
            > 0 and <= 365 => "EgQIBRAB",
            _ => null
        };
    }

    private static int MapSortBy(string? sortBy) => sortBy?.ToLowerInvariant() switch
    {
        "upload_date" or "date" => 1,
        "view_count" or "views" => 2,
        "rating" => 3,
        _ => 0
    };

    private static int MapUploadDate(string? uploadDate) => uploadDate?.ToLowerInvariant() switch
    {
        "hour" => 1,
        "today" => 2,
        "week" => 3,
        "month" => 4,
        "year" => 5,
        _ => 0
    };

    private static int MapDuration(string? duration) => duration?.ToLowerInvariant() switch
    {
        "short" => 1,
        "medium" => 2,
        "long" => 3,
        _ => 0
    };

    private static int MapType(string? type) => type?.ToLowerInvariant() switch
    {
        "video" => 1,
        "channel" => 2,
        "playlist" => 3,
        "movie" => 4,
        _ => 0
    };

    private static int MapFeatures(string? features) => features?.ToLowerInvariant() switch
    {
        "live" => 256,
        "4k" => 16,
        "hd" => 8,
        "subtitles" => 1024,
        "creative_commons" => 32,
        "360" => 2048,
        "vr180" => 8192,
        "3d" => 4,
        "hdr" => 65536,
        "location" => 128,
        "purchased" => 64,
        _ => 0
    };

    private static string EncodeProtobufParams(int sortBy, int uploadDate, int duration, int type, int features)
    {
        using var ms = new System.IO.MemoryStream();
        if (sortBy != 0) WriteVarintField(ms, 1, (uint)sortBy);
        if (uploadDate != 0) WriteVarintField(ms, 2, (uint)uploadDate);
        if (duration != 0) WriteVarintField(ms, 3, (uint)duration);
        if (type != 0) WriteVarintField(ms, 4, (uint)type);
        if (features != 0) WriteVarintField(ms, 5, (uint)features);
        return Convert.ToBase64String(ms.ToArray());
    }

    private static void WriteVarintField(System.IO.MemoryStream stream, int fieldNumber, uint value)
    {
        var tag = (uint)((fieldNumber << 3) | 0);
        WriteVarint(stream, tag);
        WriteVarint(stream, value);
    }

    private static void WriteVarint(System.IO.MemoryStream stream, uint value)
    {
        while (value > 0x7F)
        {
            stream.WriteByte((byte)(value & 0x7F | 0x80));
            value >>= 7;
        }
        stream.WriteByte((byte)value);
    }
}
