using System.Net;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json.Nodes;
using Xunit;

namespace Delivrie.Tests;

sealed class StubHandler : HttpMessageHandler
{
    public readonly List<(string Method, string Url, Dictionary<string, string> Headers, string? Body)> Calls = new();
    private readonly Queue<Func<HttpResponseMessage>> _responses = new();

    public StubHandler(params Func<HttpResponseMessage>[] responses) { foreach (var r in responses) _responses.Enqueue(r); }

    protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
    {
        var headers = request.Headers.ToDictionary(h => h.Key, h => string.Join(",", h.Value));
        if (request.Content != null) foreach (var h in request.Content.Headers) headers[h.Key] = string.Join(",", h.Value);
        Calls.Add((request.Method.Method, request.RequestUri!.AbsoluteUri, headers, request.Content == null ? null : await request.Content.ReadAsStringAsync(cancellationToken)));
        return _responses.Count > 0 ? _responses.Dequeue()() : Json(200, "{}");
    }

    public static HttpResponseMessage Json(int status, string body) => new((HttpStatusCode)status) { Content = new StringContent(body, Encoding.UTF8, "application/json") };
}

public class ClientTests
{
    static (DelivrieClient, StubHandler) Client(params Func<HttpResponseMessage>[] responses)
    {
        var h = new StubHandler(responses);
        return (new DelivrieClient("dlv_test", new DelivrieClientOptions { HttpClient = new HttpClient(h), MaxRetries = 2 }), h);
    }

    static string Path((string Method, string Url, Dictionary<string, string> Headers, string? Body) c) => $"{c.Method} {c.Url.Replace("https://delivrie.io/api", "")}";

    [Fact]
    public async Task SendsEmail()
    {
        var (d, h) = Client(() => StubHandler.Json(200, "{\"id\":\"e1\"}"));
        var email = await d.Emails.SendAsync(new { from = "Acme <hi@acme.com>", to = new[] { "ada@example.com" }, subject = "Hi" }, "k1");
        Assert.Equal("e1", (string?)email["id"]);
        var c = h.Calls[0];
        Assert.Equal("POST /emails", Path(c));
        Assert.Equal("Bearer dlv_test", c.Headers["Authorization"]);
        Assert.Equal("k1", c.Headers["Idempotency-Key"]);
        Assert.StartsWith("delivrie-dotnet/", c.Headers["User-Agent"]);
        Assert.StartsWith("application/json", c.Headers["Content-Type"]);
        Assert.Equal("ada@example.com", (string?)JsonNode.Parse(c.Body!)!["to"]![0]);
    }

    [Fact]
    public async Task EncodesIdsQueriesAndEmptyBodies()
    {
        var (d, h) = Client();
        await d.Contacts.GetAsync("ada+1@example.com");
        await d.Segments.ContactsAsync("s 1", new Dictionary<string, object?> { ["limit"] = 5, ["offset"] = null });
        await d.Inbox.ThreadsAsync(new Dictionary<string, object?> { ["needs_reply"] = true, ["q"] = "label:billing" });
        await d.Broadcasts.CancelAsync("b1");
        await d.Broadcasts.SendAsync("b1");
        Assert.Equal("GET /contacts/ada%2B1%40example.com", Path(h.Calls[0]));
        Assert.Equal("GET /segments/s%201/contacts?limit=5", Path(h.Calls[1]));
        Assert.Equal("GET /inbox/threads?needs_reply=true&q=label%3Abilling", Path(h.Calls[2]));
        Assert.Equal("{}", h.Calls[3].Body);
        Assert.Equal("{}", h.Calls[4].Body);
    }

    [Fact]
    public async Task NewEndpoints()
    {
        var (d, h) = Client();
        await d.Broadcasts.DuplicateAsync("b1", new { name = "Copy" });
        await d.Broadcasts.LinksAsync("b1");
        await d.Templates.EditContentAsync("welcome", new { ops = new[] { new { op = "delete", id = "x" } } });
        await d.ApiKeys.UpdateAsync("k1", new { name = "Prod" });
        await d.Emails.ReceivedAttachmentsAsync("e1");
        await d.Segments.RemoveContactsAsync("s1", new { contacts = new[] { "a@b.com" } });
        await d.Contacts.ImportContactsAsync(new { csv = "email\na@b.com" });
        await d.Ai.DraftAsync(new { url = "https://acme.com" });
        Assert.Equal(new[] { "POST /broadcasts/b1/duplicate", "GET /broadcasts/b1/links", "POST /templates/welcome/content", "PATCH /api-keys/k1", "GET /emails/received/e1/attachments", "DELETE /segments/s1/contacts", "POST /contacts/imports", "POST /ai/draft" }, h.Calls.Select(Path).ToArray());
        Assert.Equal("{\"contacts\":[\"a@b.com\"]}", h.Calls[5].Body);
    }

    [Fact]
    public async Task ThrowsApiErrors()
    {
        var (d, _) = Client(() => StubHandler.Json(422, "{\"statusCode\":422,\"name\":\"validation_error\",\"message\":\"Missing `to`\"}"));
        var e = await Assert.ThrowsAsync<DelivrieException>(() => d.Emails.SendAsync(new { from = "a" }));
        Assert.Equal(422, e.Status);
        Assert.Equal("validation_error", e.Name);
        Assert.Equal("Missing `to`", e.Message);
    }

    [Fact]
    public async Task RetriesSafeRequestsOnly()
    {
        var (d, h) = Client(() => StubHandler.Json(503, "oops"), () => StubHandler.Json(200, "{\"object\":\"list\",\"data\":[]}"));
        Assert.Equal("list", (string?)(await d.Domains.ListAsync())["object"]);
        Assert.Equal(2, h.Calls.Count);

        (d, h) = Client(() => StubHandler.Json(503, "oops"));
        await Assert.ThrowsAsync<DelivrieException>(() => d.Emails.SendAsync(new { from = "a" }));
        Assert.Single(h.Calls);

        (d, h) = Client(() => StubHandler.Json(429, "{}"), () => StubHandler.Json(200, "{\"id\":\"e2\"}"));
        Assert.Equal("e2", (string?)(await d.Emails.SendAsync(new { from = "a" }, "k"))["id"]);

        (d, h) = Client(() => throw new HttpRequestException("reset"), () => StubHandler.Json(200, "{}"));
        await d.Domains.ListAsync();
        Assert.Equal(2, h.Calls.Count);
    }

    [Fact]
    public async Task WrapsArrays()
    {
        var (d, _) = Client(() => StubHandler.Json(200, "[1]"));
        Assert.Equal(1, (int)(await d.Logs.ListAsync())["data"]![0]!);
    }

    [Fact]
    public void RequiresKey()
    {
        if (Environment.GetEnvironmentVariable("DELIVRIE_API_KEY") != null) return;
        Assert.Throws<ArgumentException>(() => new DelivrieClient(""));
    }
}

public class WebhookTests
{
    static readonly byte[] Key = Encoding.UTF8.GetBytes("secret-key-bytes");
    static readonly string Secret = "whsec_" + Convert.ToBase64String(Key);
    const string Body = "{\"type\":\"email.delivered\",\"data\":{\"email_id\":\"e1\"}}";

    static string Sign(string id, long ts, string body, byte[] key) => "v1," + Convert.ToBase64String(HMACSHA256.HashData(key, Encoding.UTF8.GetBytes($"{id}.{ts}.{body}")));

    static Dictionary<string, string> Headers(byte[]? key = null) => new()
    {
        ["Webhook-Id"] = "msg_1",
        ["webhook-timestamp"] = "1700000000",
        ["WEBHOOK-SIGNATURE"] = "v1,bm9wZQ== " + Sign("msg_1", 1700000000, Body, key ?? Key),
    };

    [Fact]
    public void Verifies() => Assert.Equal("email.delivered", (string?)Webhook.Verify(Body, Headers(), Secret, 300, 1700000100)["type"]);

    [Fact]
    public void Rejects()
    {
        Assert.Throws<WebhookVerificationException>(() => Webhook.Verify(Body + " ", Headers(), Secret, 300, 1700000000));
        Assert.Throws<WebhookVerificationException>(() => Webhook.Verify(Body, Headers(), Secret, 300, 1700001000));
        Assert.Throws<WebhookVerificationException>(() => Webhook.Verify(Body, Headers(Encoding.UTF8.GetBytes("other")), Secret, 300, 1700000000));
        Assert.Throws<WebhookVerificationException>(() => Webhook.Verify(Body, new Dictionary<string, string>(), Secret));
    }
}
