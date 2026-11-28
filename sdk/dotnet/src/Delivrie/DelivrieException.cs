#nullable enable
using System;
using System.Text.Json.Nodes;

namespace Delivrie;

/// <summary>
/// Thrown for any failed request. <see cref="Status"/> is the HTTP status (0 for network errors and timeouts) and
/// <see cref="Name"/> is Delivrie's error name, like "validation_error", "invalid_api_key" or "rate_limit_exceeded".
/// </summary>
public class DelivrieException : Exception
{
    /// <summary>The HTTP status, or 0 for network errors and timeouts.</summary>
    public int Status { get; }

    /// <summary>Delivrie's error name.</summary>
    public string Name { get; }

    /// <summary>Creates an error.</summary>
    public DelivrieException(string message, int status, string name, Exception? inner = null) : base(message, inner)
    {
        Status = status;
        Name = name;
    }

    internal static DelivrieException FromResponse(int status, JsonNode? json, string raw)
    {
        var obj = json as JsonObject;
        string? name = obj?["name"] is JsonValue n && n.TryGetValue<string>(out var s1) ? s1 : null;
        name ??= status switch { 401 => "invalid_api_key", 404 => "not_found", 429 => "rate_limit_exceeded", _ => "application_error" };
        string? message = obj?["message"] is JsonValue m && m.TryGetValue<string>(out var s2) ? s2 : null;
        if (message is null)
        {
            var body = (raw ?? "").Length > 300 ? raw!.Substring(0, 300) : raw ?? "";
            message = string.IsNullOrWhiteSpace(body) ? $"Request failed with status {status}" : body.Trim();
        }
        int code = obj?["statusCode"] is JsonValue c && c.TryGetValue<int>(out var i) ? i : status;
        return new DelivrieException(message, code, name);
    }
}

/// <summary>Thrown by <see cref="Webhook"/> when a request isn't a genuine, recent Delivrie webhook.</summary>
public class WebhookVerificationException : Exception
{
    /// <summary>Creates an error.</summary>
    public WebhookVerificationException(string message) : base(message) { }
}
