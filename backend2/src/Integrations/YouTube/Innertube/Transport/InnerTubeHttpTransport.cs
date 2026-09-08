using System.Net;
using System.Text;
using System.Text.Json;
using Integrations.YouTube.Innertube.Config;
using Integrations.YouTube.Innertube.Contracts;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace Integrations.YouTube.Innertube.Transport;

public interface IInnerTubeHttpTransport
{
    Task<JsonElement> SendSearchAsync(string query, string lang, string region, string? searchParams, CancellationToken ct);
    Task<JsonElement> SendPlayerAsync(string videoId, InnerTubeClientType clientType, CancellationToken ct);
    Task<JsonElement> SendBrowseAsync(string browseId, string lang, string region, CancellationToken ct, string? parameters = null);
    Task<JsonElement> SendNextAsync(string videoId, string lang, string region, CancellationToken ct);
    Task<JsonElement> SendNextAsync(string? videoId, string continuationToken, string lang, string region, CancellationToken ct);
    Task<string> FetchStringAsync(string url, CancellationToken ct);
}

public sealed class InnerTubeHttpTransport : IInnerTubeHttpTransport
{
    private readonly HttpClient _httpClient;
    private readonly InnerTubeOptions _options;
    private readonly ILogger<InnerTubeHttpTransport> _logger;
    private static readonly TimeSpan MaxRequestTimeout = TimeSpan.FromSeconds(30);

    public InnerTubeHttpTransport(
        HttpClient httpClient,
        IOptions<InnerTubeOptions> options,
        ILogger<InnerTubeHttpTransport> logger)
    {
        _httpClient = httpClient;
        _options = options.Value;
        _logger = logger;
    }

    public async Task<JsonElement> SendSearchAsync(
        string query, string lang, string region, string? searchParams, CancellationToken ct)
    {
        var profile = GetClientProfile(InnerTubeClientType.Web);
        var payload = BuildContextPayload(profile, lang, region);
        payload["query"] = query;
        if (!string.IsNullOrEmpty(searchParams))
            payload["params"] = searchParams;

        return await PostAsync(_options.Endpoints.Search, payload, _options.Timeouts.SearchSeconds, profile, ct);
    }

    public async Task<JsonElement> SendPlayerAsync(string videoId, InnerTubeClientType clientType, CancellationToken ct)
    {
        var profile = GetClientProfile(clientType);
        var payload = BuildContextPayload(profile, _options.Defaults.DefaultLanguage, _options.Defaults.DefaultRegion);
        payload["videoId"] = videoId;

        return await PostAsync(_options.Endpoints.Player, payload, _options.Timeouts.PlayerSeconds, profile, ct);
    }

    public async Task<JsonElement> SendBrowseAsync(string browseId, string lang, string region, CancellationToken ct, string? parameters = null)
    {
        var profile = GetClientProfile(InnerTubeClientType.Web);
        var payload = BuildContextPayload(profile, lang, region);
        payload["browseId"] = browseId;
        if (!string.IsNullOrEmpty(parameters))
            payload["params"] = parameters;

        return await PostAsync(_options.Endpoints.Browse, payload, _options.Timeouts.BrowseSeconds, profile, ct);
    }

    public async Task<JsonElement> SendNextAsync(string videoId, string lang, string region, CancellationToken ct)
    {
        var profile = GetClientProfile(InnerTubeClientType.Web);
        var payload = BuildContextPayload(profile, lang, region);
        payload["videoId"] = videoId;

        return await PostAsync(_options.Endpoints.Next, payload, _options.Timeouts.NextSeconds, profile, ct);
    }

    public async Task<JsonElement> SendNextAsync(string? videoId, string continuationToken, string lang, string region, CancellationToken ct)
    {
        var profile = GetClientProfile(InnerTubeClientType.Web);
        var payload = BuildContextPayload(profile, lang, region);
        if (!string.IsNullOrEmpty(videoId))
            payload["videoId"] = videoId;
        payload["continuation"] = continuationToken;

        return await PostAsync(_options.Endpoints.Next, payload, _options.Timeouts.NextSeconds, profile, ct);
    }

    public async Task<string> FetchStringAsync(string url, CancellationToken ct)
    {
        using var cts = CancellationTokenSource.CreateLinkedTokenSource(ct);
        cts.CancelAfter(TimeSpan.FromSeconds(_options.Timeouts.SubtitleFetchSeconds));
        return await _httpClient.GetStringAsync(url, cts.Token);
    }

    private Dictionary<string, object> BuildContextPayload(InnerTubeClientProfile profile, string lang, string region)
    {
        return new Dictionary<string, object>
        {
            ["context"] = new
            {
                client = new
                {
                    hl = lang,
                    gl = region,
                    clientName = profile.ClientName,
                    clientVersion = profile.ClientVersion,
                    androidSdkVersion = profile.AndroidSdkVersion
                }
            }
        };
    }

    private async Task<JsonElement> PostAsync(
        string endpoint, Dictionary<string, object> payload,
        int timeoutSeconds, InnerTubeClientProfile profile, CancellationToken ct)
    {
        var url = $"{_options.Endpoints.BaseUrl}/{endpoint}";
        if (!string.IsNullOrEmpty(profile.ApiKey))
            url += $"?key={profile.ApiKey}";

        using var cts = CancellationTokenSource.CreateLinkedTokenSource(ct);
        cts.CancelAfter(TimeSpan.FromSeconds(Math.Min(timeoutSeconds, MaxRequestTimeout.TotalSeconds)));

        using var request = new HttpRequestMessage(HttpMethod.Post, url);
        request.Content = new StringContent(JsonSerializer.Serialize(payload), Encoding.UTF8, "application/json");

        var userAgent = profile.UserAgent ?? _options.Defaults.FallbackUserAgent;
        request.Headers.UserAgent.ParseAdd(userAgent);

        if (profile.AcceptContentTypes?.Length > 0)
        {
            request.Headers.Accept.ParseAdd(string.Join(", ", profile.AcceptContentTypes));
        }

        try
        {
            var response = await _httpClient.SendAsync(request, cts.Token);

            if (response.StatusCode == (HttpStatusCode)429)
            {
                _logger.LogWarning("[InnerTube] Rate limited on {Endpoint}, retrying after delay", endpoint);
                response.Dispose();
                await Task.Delay(2000, cts.Token);
                using var retryRequest = new HttpRequestMessage(HttpMethod.Post, url);
                retryRequest.Content = new StringContent(JsonSerializer.Serialize(payload), Encoding.UTF8, "application/json");
                retryRequest.Headers.UserAgent.ParseAdd(userAgent);
                response = await _httpClient.SendAsync(retryRequest, cts.Token);
            }

            using (response)
            {
                if (!response.IsSuccessStatusCode)
                {
                    var body = await response.Content.ReadAsStringAsync(cts.Token);
                    throw new HttpRequestException(
                        $"InnerTube {endpoint} returned {(int)response.StatusCode}: {body}");
                }

                await using var stream = await response.Content.ReadAsStreamAsync(cts.Token);
                using var doc = await JsonDocument.ParseAsync(stream, cancellationToken: cts.Token);
                return doc.RootElement.Clone();
            }
        }
        catch (OperationCanceledException) when (ct.IsCancellationRequested)
        {
            throw;
        }
        catch (HttpRequestException ex)
        {
            _logger.LogWarning(ex, "[InnerTube] Request to {Endpoint} failed, trying fallback clients", endpoint);
            return await TryFallbackClients(endpoint, payload, timeoutSeconds, profile, ex, ct);
        }
    }

    private async Task<JsonElement> TryFallbackClients(
        string endpoint, Dictionary<string, object> payload,
        int timeoutSeconds, InnerTubeClientProfile failedProfile,
        Exception originalException, CancellationToken ct)
    {
        var fallbackProfiles = _options.ClientProfiles
            .Where(p => p.ClientName != failedProfile.ClientName)
            .OrderBy(p => p.Priority)
            .ToList();

        foreach (var fallback in fallbackProfiles)
        {
            try
            {
                _logger.LogInformation(
                    "[InnerTube] Trying fallback client {ClientName} for {Endpoint}",
                    fallback.ClientName, endpoint);

                var url = $"{_options.Endpoints.BaseUrl}/{endpoint}";
                if (!string.IsNullOrEmpty(fallback.ApiKey))
                    url += $"?key={fallback.ApiKey}";

                using var cts = CancellationTokenSource.CreateLinkedTokenSource(ct);
                cts.CancelAfter(TimeSpan.FromSeconds(timeoutSeconds));

                var fallbackPayload = new Dictionary<string, object>(payload);
                if (fallbackPayload.TryGetValue("context", out var ctx) && ctx is Dictionary<string, object> ctxDict)
                {
                    if (ctxDict.TryGetValue("client", out var clientObj) && clientObj is Dictionary<string, object> clientDict)
                    {
                        clientDict["clientName"] = fallback.ClientName;
                        clientDict["clientVersion"] = fallback.ClientVersion;
                        if (fallback.AndroidSdkVersion.HasValue)
                            clientDict["androidSdkVersion"] = fallback.AndroidSdkVersion.Value;
                    }
                }

                using var request = new HttpRequestMessage(HttpMethod.Post, url);
                request.Content = new StringContent(JsonSerializer.Serialize(fallbackPayload), Encoding.UTF8, "application/json");
                request.Headers.UserAgent.ParseAdd(fallback.UserAgent ?? _options.Defaults.FallbackUserAgent);

                using var response = await _httpClient.SendAsync(request, cts.Token);
                if (!response.IsSuccessStatusCode) continue;

                await using var stream = await response.Content.ReadAsStreamAsync(cts.Token);
                using var doc = await JsonDocument.ParseAsync(stream, cancellationToken: cts.Token);
                return doc.RootElement.Clone();
            }
            catch (Exception ex)
            {
                _logger.LogDebug(ex, "[InnerTube] Fallback client {ClientName} also failed for {Endpoint}",
                    fallback.ClientName, endpoint);
            }
        }

        throw new HttpRequestException(
            $"All InnerTube clients failed for {endpoint}: {originalException.Message}", originalException);
    }

    private InnerTubeClientProfile GetClientProfile(InnerTubeClientType clientType)
    {
        var profileName = clientType switch
        {
            InnerTubeClientType.Android => "ANDROID",
            InnerTubeClientType.Tv => "TVHTML5_SIMPLY_EMBEDDED_PLAYER",
            _ => "WEB"
        };

        return _options.ClientProfiles
            .FirstOrDefault(p => p.ClientName == profileName)
            ?? CreateDefaultProfile(profileName);
    }

    private InnerTubeClientProfile CreateDefaultProfile(string clientName)
    {
        return clientName switch
        {
            "ANDROID" => new InnerTubeClientProfile
            {
                ClientName = "ANDROID",
                ClientVersion = "19.29.35",
                AndroidSdkVersion = 30,
                Priority = 2,
                UserAgent = "com.google.android.youtube/19.29.35 (Linux; U; Android 11) gzip"
            },
            "TVHTML5_SIMPLY_EMBEDDED_PLAYER" => new InnerTubeClientProfile
            {
                ClientName = "TVHTML5_SIMPLY_EMBEDDED_PLAYER",
                ClientVersion = "2.20240825.01.00",
                Priority = 3,
                UserAgent = "Mozilla/5.0"
            },
            _ => new InnerTubeClientProfile
            {
                ClientName = "WEB",
                ClientVersion = "2.20240825.01.00",
                ApiKey = "AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8",
                Priority = 1,
                IsDefault = true,
                UserAgent = _options.Defaults.FallbackUserAgent
            }
        };
    }
}
