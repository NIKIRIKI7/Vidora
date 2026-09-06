using System.Text;
using System.Text.Json;

namespace Integrations.YouTube.Innertube.Extractors;

public static class JsonElementExtensions
{
    public static string ExtractRunsText(this JsonElement element, string propertyName)
    {
        if (!element.TryGetProperty(propertyName, out var prop))
            return string.Empty;

        if (prop.ValueKind == JsonValueKind.String)
            return prop.GetString() ?? string.Empty;

        if (prop.TryGetProperty("simpleText", out var st))
            return st.GetString() ?? string.Empty;

        if (prop.TryGetProperty("runs", out var runs) && runs.ValueKind == JsonValueKind.Array)
        {
            var sb = new StringBuilder();
            foreach (var r in runs.EnumerateArray())
            {
                if (r.TryGetProperty("text", out var t))
                    sb.Append(t.GetString());
            }
            return sb.ToString();
        }

        return string.Empty;
    }

    public static long ParseSubscriberCount(this JsonElement element, string propertyName)
    {
        var text = element.ExtractRunsText(propertyName);
        return InnerTubeParsers.ParseCount(text);
    }

    public static int ParseDurationStringToSeconds(this JsonElement element, string propertyName)
    {
        var text = element.ExtractRunsText(propertyName);
        return InnerTubeParsers.ParseDurationToSeconds(text);
    }
}

public static class InnerTubeParsers
{
    public static long ParseCount(string raw)
    {
        if (string.IsNullOrWhiteSpace(raw)) return 0;
        var clean = raw.ToLowerInvariant()
            .Replace("views", "")
            .Replace("subscribers", "")
            .Replace("подписчиков", "")
            .Replace("подписчика", "")
            .Replace("подписчик", "")
            .Replace(",", "")
            .Replace(" ", "")
            .Trim();

        double mult = 1.0;
        if (clean.EndsWith('k') || clean.EndsWith('к')) { mult = 1_000; clean = clean[..^1]; }
        else if (clean.EndsWith('m') || clean.EndsWith('м')) { mult = 1_000_000; clean = clean[..^1]; }
        else if (clean.EndsWith('b') || clean.EndsWith('б')) { mult = 1_000_000_000; clean = clean[..^1]; }

        if (double.TryParse(clean.Replace(',', '.'), System.Globalization.NumberStyles.Float, System.Globalization.CultureInfo.InvariantCulture, out var val))
            return (long)(val * mult);
        return 0;
    }

    public static int ParseDurationToSeconds(string duration)
    {
        if (string.IsNullOrWhiteSpace(duration)) return 0;
        var parts = duration.Split(':');
        try
        {
            if (parts.Length == 3) return int.Parse(parts[0]) * 3600 + int.Parse(parts[1]) * 60 + int.Parse(parts[2]);
            if (parts.Length == 2) return int.Parse(parts[0]) * 60 + int.Parse(parts[1]);
            if (parts.Length == 1 && int.TryParse(parts[0], out var s)) return s;
        }
        catch { }
        return 0;
    }
}
