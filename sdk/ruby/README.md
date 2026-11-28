# Delivrie for Ruby

The official Ruby client for [Delivrie](https://delivrie.io): transactional email, broadcasts, templates, contacts, automations, the Inbox and AI writing. No runtime dependencies, Ruby 3.1 and later.

```bash
gem install delivrie
```

```ruby
require "delivrie"

delivrie = Delivrie::Client.new(ENV["DELIVRIE_API_KEY"])

email = delivrie.emails.send_email(
  from: "Acme <orders@mail.acme.com>",
  to: "ada@example.com",
  subject: "Your order is confirmed",
  html: "<p>Thanks for your order!</p>",
)
puts email["id"]
```

Methods return the API's JSON as a Hash with string keys, and raise `Delivrie::Error` (with `status`, `name` and `message`) when a request fails.

## More examples

```ruby
# Send a published template, safe to retry
delivrie.emails.send_email({ from: "Acme <hi@acme.com>", to: "ada@example.com", template: { id: "welcome", variables: { first_name: "Ada" } } }, idempotency_key: "signup-42")

# Attach a local file (read and sent as base64) or a public URL (fetched by Delivrie)
delivrie.emails.send_email(from: "...", to: "...", subject: "Invoice", text: "Attached.", attachments: [{ path: "./invoice.pdf" }, { path: "https://acme.com/terms.pdf" }])

# Contacts, segments and broadcasts
segment = delivrie.segments.create(name: "Beta users")
delivrie.segments.add_contacts(segment["id"], contacts: ["ada@example.com"])
broadcast = delivrie.broadcasts.create(name: "Launch", from: "Acme <news@acme.com>", subject: "We're live", segment_id: segment["id"], html: "<p>Hello {{first_name}}</p>")
delivrie.broadcasts.send_broadcast(broadcast["id"], scheduled_at: "tomorrow at 9am")

# The Inbox
delivrie.inbox.threads(needs_reply: true, q: "label:billing").fetch("data").each do |t|
  delivrie.inbox.create_draft(thread_id: t["id"], text: "Thanks, we're looking into it.")
end

# AI writing in your brand voice, straight into a template
delivrie.ai.draft(url: "https://acme.com/blog/launch", target: { type: "template", id: "launch-email" })

# Anything else
delivrie.request(:get, "/emails", query: { limit: 5 })
```

## Webhooks

```ruby
post "/webhooks/delivrie" do
  event = Delivrie::Webhook.verify(request.body.read, request.env, ENV["DELIVRIE_WEBHOOK_SECRET"])
  # event["type"], event["data"]
  200
rescue Delivrie::WebhookVerificationError
  400
end
```

## Options

```ruby
Delivrie::Client.new(key, base_url: "https://delivrie.io/api", timeout: 30, max_retries: 2)
```

Rate limits (429), server errors and network errors are retried with backoff for GET and DELETE, and for sends only when you pass an `idempotency_key`, so a retry never sends twice.

Docs: [delivrie.io/docs/ruby](https://delivrie.io/docs/ruby) · API reference: [delivrie.io/docs/api](https://delivrie.io/docs/api)
