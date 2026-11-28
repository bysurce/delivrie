# frozen_string_literal: true

require "minitest/autorun"
require "base64"
require "openssl"
require "delivrie"

class WebhookTest < Minitest::Test
  KEY = "secret-key-bytes"
  SECRET = "whsec_" + Base64.strict_encode64(KEY)
  BODY = '{"type":"email.delivered","data":{"email_id":"e1"}}'

  def sign(id, ts, body, key = KEY) = "v1," + Base64.strict_encode64(OpenSSL::HMAC.digest("SHA256", key, "#{id}.#{ts}.#{body}"))

  def headers(ts = 1_700_000_000, sig = nil)
    { "Webhook-Id" => "msg_1", "webhook-timestamp" => ts.to_s, "WEBHOOK-SIGNATURE" => sig || sign("msg_1", ts, BODY) }
  end

  def test_valid
    ev = Delivrie::Webhook.verify(BODY, headers, SECRET, now: 1_700_000_100)
    assert_equal "email.delivered", ev["type"]
  end

  def test_rack_style_headers_and_rotation
    h = { "HTTP_WEBHOOK_ID" => "msg_1", "HTTP_WEBHOOK_TIMESTAMP" => "1700000000", "HTTP_WEBHOOK_SIGNATURE" => "v1,bm9wZQ== #{sign('msg_1', 1_700_000_000, BODY)}" }
    assert Delivrie::Webhook.verify(BODY, h, SECRET, now: 1_700_000_000)
  end

  def test_rejects
    assert_raises(Delivrie::WebhookVerificationError) { Delivrie::Webhook.verify(BODY + " ", headers, SECRET, now: 1_700_000_000) }
    assert_raises(Delivrie::WebhookVerificationError) { Delivrie::Webhook.verify(BODY, headers, SECRET, now: 1_700_001_000) }
    assert_raises(Delivrie::WebhookVerificationError) { Delivrie::Webhook.verify(BODY, headers(1_700_000_000, sign("msg_1", 1_700_000_000, BODY, "other")), SECRET, now: 1_700_000_000) }
    assert_raises(Delivrie::WebhookVerificationError) { Delivrie::Webhook.verify(BODY, {}, SECRET) }
  end
end
