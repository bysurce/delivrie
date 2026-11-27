# Delivrie Go SDK

The Go client for [Delivrie](https://delivrie.io): send transactional email, manage domains, keys, webhooks,
contacts, broadcasts and templates, and verify webhook signatures. Standard library only; Go 1.21 or later.

```sh
go get github.com/bysurce/delivrie/sdk/go
```

The module moved from `github.com/codeddesigner/delivrie/sdk/go` in v0.2.0. Code that imports the old path keeps working on v0.1.0; to upgrade, change the import path and run `go get` again.

```go
import delivrie "github.com/bysurce/delivrie/sdk/go"

client := delivrie.New(os.Getenv("DELIVRIE_API_KEY"))

sent, err := client.Emails.Send(ctx, &delivrie.SendEmailRequest{
	From:    "Acme <hi@acme.com>",
	To:      []string{"ada@example.com"},
	Subject: "Your receipt",
	HTML:    "<p>Thanks for your order.</p>",
}, delivrie.WithIdempotencyKey("order-1042"))
if err != nil {
	var apiErr *delivrie.Error
	if errors.As(err, &apiErr) {
		log.Printf("%d %s: %s", apiErr.StatusCode, apiErr.Name, apiErr.Message)
	}
	return err
}
fmt.Println(sent.ID)
```

## What's included

| Service | Methods |
| --- | --- |
| `Emails` | `Send`, `SendBatch` (up to 100), `Get`, `List`, `ListReceived`, `Reschedule`, `Cancel`, `Forward` |
| `Domains` | `Create`, `Get`, `List`, `Verify`, `Update`, `Delete` |
| `APIKeys` | `Create`, `List`, `Delete` |
| `Webhooks` | `Create`, `List`, `Deliveries`, `Test`, `Replay` |
| `Contacts`, `Segments`, `Topics` | create, get, update, list, delete; add contacts to segments |
| `Broadcasts` | `Create`, `Get`, `List`, `Send` (now or scheduled), `Cancel`, `Recipients`, `Delete` |
| `Templates` | `Create`, `Get` (id or alias), `List`, `Publish` |
| `Suppressions`, `Events`, `Automations`, `Inbox`, `Metrics`, `Logs`, `Usage` | as in the [API reference](https://delivrie.io/docs/api) |

`client.Do(ctx, method, path, body, &out)` calls any endpoint the SDK doesn't wrap yet.

Templates, attachments and scheduling:

```go
client.Emails.Send(ctx, &delivrie.SendEmailRequest{
	To:          []string{"ada@example.com"},
	Template:    &delivrie.TemplateRef{ID: "welcome", Variables: map[string]any{"name": "Ada"}},
	Attachments: []delivrie.Attachment{{Filename: "invoice.pdf", Content: pdfBytes}},
	ScheduledAt: "tomorrow at 9am",
})
```

## Webhooks

```go
func handler(w http.ResponseWriter, r *http.Request) {
	body, _ := io.ReadAll(r.Body)
	event, err := delivrie.VerifyWebhook(body, r.Header, os.Getenv("DELIVRIE_WEBHOOK_SECRET"))
	if err != nil {
		http.Error(w, "invalid signature", http.StatusBadRequest)
		return
	}
	log.Println(event.Type) // "email.delivered", "email.bounced", …
	w.WriteHeader(http.StatusOK)
}
```

## Retries and errors

Rate limits (429), server errors and network errors are retried twice with backoff, honouring `Retry-After`.
GET and DELETE are always retried; sends only when you pass `WithIdempotencyKey`, so a retry never sends twice.
Change it with `delivrie.WithMaxRetries(n)`, and the timeout with `delivrie.WithHTTPClient(&http.Client{Timeout: …})`.
Errors from the API are `*delivrie.Error`; `delivrie.IsNotFound(err)` and `delivrie.IsRateLimited(err)` cover the common checks.

An empty key falls back to `DELIVRIE_API_KEY`. Docs: https://delivrie.io/docs/go
