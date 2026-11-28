---
title: .NET and C#
group: SDKs and frameworks
order: 10
description: Send email from C#, ASP.NET Core and any .NET 8 app with the official Delivrie NuGet package: async methods, idempotent retries, errors you can inspect, and webhook verification.
---
The `Delivrie` NuGet package is the official .NET SDK. It's async, needs nothing beyond the .NET 8 runtime, and works in ASP.NET Core, worker services, Azure Functions and console apps. Source: [github.com/bysurce/delivrie](https://github.com/bysurce/delivrie/tree/main/sdk/dotnet).

```bash
dotnet add package Delivrie
```

## Send an email

```csharp
using Delivrie;

var delivrie = new DelivrieClient(Environment.GetEnvironmentVariable("DELIVRIE_API_KEY"));

var email = await delivrie.Emails.SendAsync(new
{
    from = "Acme <hello@mail.acme.com>",
    to = "ada@example.com",
    subject = "Welcome",
    html = "<p>Welcome to Acme</p>",
});
Console.WriteLine(email["id"]);
```

Methods take any object that serialises to the API's JSON (anonymous objects, dictionaries, your own classes, or a `JsonNode`) and return the response as a `JsonObject`. In ASP.NET Core, register one client: `builder.Services.AddSingleton(new DelivrieClient(builder.Configuration["Delivrie:ApiKey"]));`.

## Errors, retries and idempotency

```csharp
try
{
    await delivrie.Emails.SendAsync(new { from = "Acme <hi@acme.com>", to = user.Email, template = new { id = "welcome" } }, idempotencyKey: $"welcome-{user.Id}");
}
catch (DelivrieException e)
{
    logger.LogWarning("Delivrie {Status} {Name}: {Message}", e.Status, e.Name, e.Message);
}
```

`DelivrieException` has the HTTP `Status` (0 for network errors and timeouts), Delivrie's error `Name` (see [Errors](/docs/errors)) and the message. `GET` and `DELETE` requests are retried twice on rate limits, `5xx` responses and network failures. Sends are retried only with an `idempotencyKey`, so a retry never sends twice. Every method takes a `CancellationToken`.

```csharp
var delivrie = new DelivrieClient(key, new DelivrieClientOptions { Timeout = TimeSpan.FromSeconds(10), MaxRetries = 3 });
```

## Attachments

```csharp
await delivrie.Emails.SendAsync(new
{
    from = "Billing <billing@mail.acme.com>", to = "ada@example.com", subject = "Your invoice", text = "Attached.",
    attachments = new object[] { DelivrieClient.Attachment("invoice-1042.pdf"), new { path = "https://acme.com/terms.pdf" } },
});
```

## Methods

| Resource | Methods |
| --- | --- |
| `Emails` | `SendAsync`, `SendBatchAsync`, `GetAsync`, `ListAsync`, `ListReceivedAsync`, `UpdateAsync`, `CancelAsync`, `ForwardAsync`, `AttachmentsAsync`, `ReceivedAttachmentsAsync`, `ShareAsync` |
| `Domains` | `CreateAsync`, `GetAsync`, `ListAsync`, `VerifyAsync`, `UpdateAsync`, `DeleteAsync` |
| `ApiKeys` | `CreateAsync`, `ListAsync`, `UpdateAsync`, `DeleteAsync` |
| `Webhooks` | `CreateAsync`, `ListAsync`, `DeliveriesAsync`, `TestAsync`, `ReplayAsync` |
| `Contacts` | `CreateAsync`, `GetAsync`, `ListAsync`, `UpdateAsync`, `DeleteAsync`, `ImportContactsAsync`, `GetImportAsync`, `ListImportsAsync` |
| `Segments` | `CreateAsync`, `GetAsync`, `ListAsync`, `UpdateAsync`, `DeleteAsync`, `ContactsAsync`, `AddContactsAsync`, `RemoveContactsAsync` |
| `Broadcasts` | `CreateAsync`, `GetAsync`, `ListAsync`, `UpdateAsync`, `SendAsync`, `CancelAsync`, `DuplicateAsync`, `RecipientsAsync`, `LinksAsync`, `DeleteAsync`, `GetContentAsync`, `EditContentAsync` |
| `Templates` | `CreateAsync`, `GetAsync`, `ListAsync`, `UpdateAsync`, `PublishAsync`, `DuplicateAsync`, `DeleteAsync`, `GetContentAsync`, `EditContentAsync` |
| `Suppressions` | `ListAsync`, `AddAsync`, `DeleteAsync` |
| `Events` | `SendAsync`, `ListAsync` |
| `Automations` | `CreateAsync`, `GetAsync`, `ListAsync`, `UpdateAsync`, `DeleteAsync`, `RunsAsync`, `PublishAsync`, `PauseAsync`, `ResumeAsync`, `DuplicateAsync` |
| `Inboxes` | `ListAsync`, `CreateAsync`, `GetAsync`, `UpdateAsync`, `DeleteAsync`, `AgentRunsAsync` |
| `Inbox` | `ThreadsAsync`, `ThreadAsync`, `UpdateThreadAsync`, `ReplyAsync`, `RunAgentAsync`, `NotesAsync`, `AddNoteAsync`, `DeleteNoteAsync`, `DraftsAsync`, `CreateDraftAsync`, `UpdateDraftAsync`, `SendDraftAsync`, `DiscardDraftAsync`, `LabelsAsync` |
| `Ai` | `DraftAsync`, `RewriteAsync`, `SubjectsAsync` |
| `Logs` | `ListAsync`, `GetAsync` |

List methods take an optional `IDictionary<string, object?>` of query parameters. For anything else, `delivrie.RequestAsync("GET", "/emails", query: new Dictionary<string, object?> { ["limit"] = 10 })` calls the API with the same auth, retries and errors. Every endpoint is in the [API reference](/docs/api).

## Verify webhooks

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
    catch (WebhookVerificationException)
    {
        return Results.BadRequest();
    }
});
```

It checks the signature against the raw body and rejects requests older than five minutes. More in [Webhooks](/docs/webhooks).
