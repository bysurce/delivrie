---
title: Ruby and Rails
group: SDKs and frameworks
order: 6
description: Send email from Ruby on Rails with Action Mailer over SMTP, or from any Ruby app with Net::HTTP, and verify Delivrie webhooks.
---
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

## Any Ruby app (HTTP API)

```ruby send.rb
require "net/http"
require "json"

uri = URI("https://delivrie.io/api/emails")
req = Net::HTTP::Post.new(uri)
req["Authorization"] = "Bearer #{ENV.fetch('DELIVRIE_API_KEY')}"
req["Content-Type"] = "application/json"
req["Idempotency-Key"] = "welcome-42"
req.body = {
  from: "Acme <hello@mail.acme.com>",
  to: "ada@example.com",
  subject: "Welcome",
  html: "<p>Welcome to Acme</p>",
}.to_json

res = Net::HTTP.start(uri.host, uri.port, use_ssl: true) { |http| http.request(req) }
body = JSON.parse(res.body)
raise "#{body['name']}: #{body['message']}" unless res.is_a?(Net::HTTPSuccess)
puts body["id"]
```

## Verify webhooks

```ruby app/controllers/delivrie_webhooks_controller.rb
require "openssl"
require "base64"

class DelivrieWebhooksController < ActionController::API
  def create
    payload = request.raw_post
    id, ts, sigs = request.headers["webhook-id"], request.headers["webhook-timestamp"], request.headers["webhook-signature"].to_s
    return head(:bad_request) if (Time.now.to_i - ts.to_i).abs > 300

    key = Base64.decode64(ENV.fetch("DELIVRIE_WEBHOOK_SECRET").delete_prefix("whsec_"))
    expected = Base64.strict_encode64(OpenSSL::HMAC.digest("SHA256", key, "#{id}.#{ts}.#{payload}"))
    valid = sigs.split(" ").any? do |s|
      version, value = s.split(",", 2)
      version == "v1" && ActiveSupport::SecurityUtils.secure_compare(value.to_s, expected)
    end
    return head(:bad_request) unless valid

    event = JSON.parse(payload)
    # event["type"], event["data"]
    head :ok
  end
end
```
