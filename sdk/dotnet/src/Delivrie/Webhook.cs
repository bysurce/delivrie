#nullable enable
using System;
using System.Collections.Generic;
using System.Linq;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;

namespace Delivrie;

/// <summary>
/// Verifies webhook requests. Delivrie signs with the Standard Webhooks scheme: webhook-id, webhook-timestamp and
/// webhook-signature headers, the signature being "v1,&lt;base64 HMAC-SHA256 of id.timestamp.body&gt;" keyed with
/// the endpoint's whsec_ signing secret.
/// <code>
/// // ASP.NET Core
/// var body = await new StreamReader(Request.Body).ReadToEndAsync();
/// var evt = Webhook.Verify(body, name => Request.Headers[name].FirstOrDefault(), secret);
/// </code>
/// </summary>
public static class Webhook
{
    /// <summary>Verifies with headers from a dictionary (any letter case).</summary>
    public static JsonObject Verify(string payload, IEnumerable<KeyValuePair<string, string>> headers, string secret, int toleranceSeconds = 300, long? now = null)
    {
        var map = headers.GroupBy(h => h.Key.ToLowerInvariant()).ToDictionary(g => g.Key, g => g.First().Value);
        return Verify(payload, name => map.TryGetValue(name, out var v) ? v : null, secret, toleranceSeconds, now);
    }

    /// <summary>Returns the parsed event, or throws <see cref="WebhookVerificationException"/>. getHeader receives lower-case names.</summary>
    public static JsonObject Verify(string payload, Func<string, string?> getHeader, string secret, int toleranceSeconds = 300, long? now = null)
    {
        if (string.IsNullOrEmpty(secret)) throw new WebhookVerificationException("Missing signing secret");
        string? id = getHeader("webhook-id"), ts = getHeader("webhook-timestamp"), sigs = getHeader("webhook-signature");
        if (string.IsNullOrEmpty(id) || string.IsNullOrEmpty(ts) || string.IsNullOrEmpty(sigs))
            throw new WebhookVerificationException("Missing webhook-id, webhook-timestamp or webhook-signature header");
        if (!ts.All(char.IsDigit) || !long.TryParse(ts, out var t)) throw new WebhookVerificationException("Invalid webhook-timestamp header");
        if (Math.Abs((now ?? DateTimeOffset.UtcNow.ToUnixTimeSeconds()) - t) > toleranceSeconds)
            throw new WebhookVerificationException("Webhook timestamp is too old or in the future");
        byte[] key;
        try { key = Convert.FromBase64String(secret.StartsWith("whsec_", StringComparison.Ordinal) ? secret.Substring(6) : secret); }
        catch (FormatException) { throw new WebhookVerificationException("Signing secret isn't valid base64"); }
        var expected = HMACSHA256.HashData(key, Encoding.UTF8.GetBytes($"{id}.{ts}.{payload}"));
        // Several space-separated signatures can arrive during secret rotation; any valid one is enough.
        bool ok = false;
        foreach (var part in sigs.Split((char[]?)null, StringSplitOptions.RemoveEmptyEntries))
        {
            var vs = part.Split(',', 2);
            if (vs.Length != 2 || vs[0] != "v1") continue;
            byte[] got;
            try { got = Convert.FromBase64String(vs[1]); } catch (FormatException) { continue; }
            if (CryptographicOperations.FixedTimeEquals(got, expected)) { ok = true; break; }
        }
        if (!ok) throw new WebhookVerificationException("Signature doesn't match");
        try
        {
            if (JsonNode.Parse(payload) is JsonObject evt) return evt;
        }
        catch (JsonException) { }
        throw new WebhookVerificationException("Body is not valid JSON");
    }
}
