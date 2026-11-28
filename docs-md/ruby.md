# Ruby and Rails

Send email from Ruby and Rails with the official delivrie gem, or with Action Mailer over SMTP, and verify Delivrie webhooks.

The `delivrie` gem is the official Ruby SDK. It has no dependencies and works on Ruby 3.1 and later. Source: [github.com/bysurce/delivrie](https://github.com/bysurce/delivrie/tree/main/sdk/ruby).

```bash
gem install delivrie
```

Or add `gem "delivrie"` to your Gemfile.

## Send an email

```ruby send.rb
require "delivrie"

delivrie = Delivrie::Client.new(ENV["DELIVRIE_API_KEY"])

email = delivrie.emails.send_email(
  from: "Acme <hello@mail.acme.com>",
  to: "ada@example.com",
  subject: "Welcome",
  html: "<p>Welcome to Acme</p>",
)
puts email["id"]
```

Methods take keyword arguments or a Hash, with the API's field names (`reply_to`, `scheduled_at`), and return the API's JSON as a Hash with string keys. Without a key argument, the client reads `DELIVRIE_API_KEY`.

## Errors, retries and idempotency

A failed request raises `Delivrie::Error` with `status`, `name` (like `validation_error`, see [Errors](/docs/errors)) and `message`. Problems that never reach the API have `status` 0 and the name `network_error` or `timeout`.

```ruby
begin
  delivrie.emails.send_email({ from: "Acme <hi@acme.com>", to: user.email, template: { id: "welcome" } }, idempotency_key: "welcome-#{user.id}")
rescue Delivrie::Error => e
  Rails.logger.warn("Delivrie #{e.status} #{e.name}: #{e.message}")
end
```

`GET` and `DELETE` requests are retried twice on rate limits, `5xx` responses and network failures. Sends are retried only with `idempotency_key`, which makes a retry return the original email instead of sending another. Options: `Delivrie::Client.new(key, timeout: 30, max_retries: 2, base_url: "https://delivrie.io/api")`.

## Attachments

`path` can be a local file (the gem reads it and sends it as base64) or a public `https://` URL (Delivrie downloads it):

```ruby
delivrie.emails.send_email(
  from: "Billing <billing@mail.acme.com>", to: "ada@example.com", subject: "Your invoice", text: "Attached.",
  attachments: [{ path: "tmp/invoice-1042.pdf" }, { path: "https://acme.com/terms.pdf" }],
)
```

## Rails (Action Mailer)

Point Action Mailer at the [SMTP relay](/docs/smtp) and your existing mailers, Devise emails and `deliver_later` jobs send through Delivrie:

```ruby config/environments/production.rb
config.action_mailer.delivery_method = :smtp
config.action_mailer.smtp_settings = {
  address: "smtp.delivrie.io",
  port: 587,
  user_name: "delivrie",
  password: ENV.fetch("DELIVRIE_API_KEY"),
  authentication: :plain,
  enable_starttls_auto: true,
}
config.action_mailer.default_options = { from: "Acme <hello@mail.acme.com>" }
```

## Methods

| Resource | Methods |
| --- | --- |
| `emails` | `send_email`, `send_batch`, `get`, `list`, `list_received`, `update`, `cancel`, `forward`, `attachments`, `received_attachments`, `share` |
| `domains` | `create`, `get`, `list`, `verify`, `update`, `delete` |
| `api_keys` | `create`, `list`, `update`, `delete` |
| `webhooks` | `create`, `list`, `deliveries`, `test`, `replay` |
| `contacts` | `create`, `get`, `list`, `update`, `delete`, `import_contacts`, `get_import`, `list_imports` |
| `segments` | `create`, `get`, `list`, `update`, `delete`, `contacts`, `add_contacts`, `remove_contacts` |
| `broadcasts` | `create`, `get`, `list`, `update`, `send_broadcast`, `cancel`, `duplicate`, `recipients`, `links`, `delete`, `get_content`, `edit_content` |
| `templates` | `create`, `get`, `list`, `update`, `publish`, `duplicate`, `delete`, `get_content`, `edit_content` |
| `suppressions` | `list`, `add`, `delete` |
| `events` | `send_event`, `list` |
| `automations` | `create`, `get`, `list`, `update`, `delete`, `runs`, `publish`, `pause`, `resume`, `duplicate` |
| `inboxes` | `list`, `create`, `get`, `update`, `delete`, `agent_runs` |
| `inbox` | `threads`, `thread`, `update_thread`, `reply`, `run_agent`, `notes`, `add_note`, `delete_note`, `drafts`, `create_draft`, `update_draft`, `send_draft`, `discard_draft`, `labels` |
| `ai` | `draft`, `rewrite`, `subjects` |
| `logs` | `list`, `get` |

For anything else, `delivrie.request(:get, "/emails", query: { limit: 10 })` calls the API with the same auth, retries and errors. Every endpoint is in the [API reference](/docs/api).

## Verify webhooks

```ruby app/controllers/delivrie_webhooks_controller.rb
class DelivrieWebhooksController < ActionController::API
  def create
    event = Delivrie::Webhook.verify(request.raw_post, request.headers.to_h, ENV.fetch("DELIVRIE_WEBHOOK_SECRET"))
    # event["type"], event["data"]
    head :ok
  rescue Delivrie::WebhookVerificationError
    head :bad_request
  end
end
```

It checks the signature against the raw body, rejects requests older than five minutes, and accepts Rack-style header names (`HTTP_WEBHOOK_ID`). More in [Webhooks](/docs/webhooks).
