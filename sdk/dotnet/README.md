# Delivrie for .NET

The official .NET client for [Delivrie](https://delivrie.io): transactional email, broadcasts, templates, contacts, automations, the Inbox and AI writing. .NET 8 and later, no dependencies beyond the runtime.

```bash
dotnet add package Delivrie
```

```csharp
using Delivrie;

var delivrie = new DelivrieClient(Environment.GetEnvironmentVariable("DELIVRIE_API_KEY"));

var email = await delivrie.Emails.SendAsync(new
{
    from = "Acme <orders@mail.acme.com>",
    to = "ada@example.com",
    subject = "Your order is confirmed",
    html = "<p>Thanks for your order!</p>",
});
Console.WriteLine(email["id"]);
```

Methods take any object that serialises to the API's JSON (anonymous objects, dictionaries, your own classes with `[JsonPropertyName]`, or a `JsonNode`) and return the response as a `JsonObject`. Failed requests throw `DelivrieException` with `Status`, `Name` and `Message`. The client is thread-safe; register one as a singleton.

## More examples

```csharp
// A published template, safe to retry with an idempotency key
await delivrie.Emails.SendAsync(new { from = "Acme <hi@acme.com>", to = "ada@example.com", template = new { id = "welcome", variables = new { first_name = "Ada" } } }, idempotencyKey: "signup-42");

// Attachments: a local file, or a public URL Delivrie downloads
await delivrie.Emails.SendAsync(new { from = "...", to = "...", subject = "Invoice", text = "Attached.",
    attachments = new object[] { DelivrieClient.Attachment("invoice.pdf"), new { path = "https://acme.com/terms.pdf" } } });

// The Inbox
var threads = await delivrie.Inbox.ThreadsAsync(new Dictionary<string, object?> { ["needs_reply"] = true });

// Anything else
await delivrie.RequestAsync("GET", "/emails", query: new Dictionary<string, object?> { ["limit"] = 5 });
```

## Webhooks

```csharp
app.MapPost("/webhooks/delivrie", async (HttpRequest req) =>
{
    var body = await new StreamReader(req.Body).ReadToEndAsync();
    try
    {
        var evt = Webhook.Verify(body, name => req.Headers[name].FirstOrDefault(), builder.Configuration["DELIVRIE_WEBHOOK_SECRET"]!);
        // evt["type"], evt["data"]
        return Results.Ok();
    }
    catch (WebhookVerificationException) { return Results.BadRequest(); }
});
```

## Options

```csharp
var delivrie = new DelivrieClient(key, new DelivrieClientOptions { Timeout = TimeSpan.FromSeconds(30), MaxRetries = 2, HttpClient = myHttpClient });
```

Rate limits (429), server errors and network errors are retried with backoff for GET and DELETE, and for sends only when you pass an idempotency key, so a retry never sends twice.

Docs: [delivrie.io/docs/dotnet](https://delivrie.io/docs/dotnet) · API reference: [delivrie.io/docs/api](https://delivrie.io/docs/api)
