# frozen_string_literal: true

require "base64"
require "json"
require "openssl"

module Delivrie
  # Verifies webhook requests. Delivrie signs with the Standard Webhooks scheme: webhook-id, webhook-timestamp and
  # webhook-signature headers, the signature being "v1,<base64 HMAC-SHA256 of id.timestamp.body>" keyed with the
  # endpoint's whsec_ signing secret.
  #
  #   event = Delivrie::Webhook.verify(request.raw_post, request.headers, ENV["DELIVRIE_WEBHOOK_SECRET"])
  module Webhook
    module_function

    # Returns the parsed event (a Hash), or raises Delivrie::WebhookVerificationError.
    # payload: the raw request body, exactly as received. headers: any Hash-like object (any letter case).
    def verify(payload, headers, secret, tolerance: 300, now: nil)
      raise WebhookVerificationError, "Missing signing secret" if secret.nil? || secret.empty?

      h = {}
      headers.each { |k, v| h[k.to_s.downcase.tr("_", "-").sub(/\Ahttp-/, "")] = Array(v).first.to_s }
      id, ts, sigs = h["webhook-id"], h["webhook-timestamp"], h["webhook-signature"]
      raise WebhookVerificationError, "Missing webhook-id, webhook-timestamp or webhook-signature header" if [id, ts, sigs].any? { |x| x.nil? || x.empty? }
      raise WebhookVerificationError, "Invalid webhook-timestamp header" unless ts.match?(/\A\d+\z/)
      raise WebhookVerificationError, "Webhook timestamp is too old or in the future" if ((now || Time.now.to_i) - ts.to_i).abs > tolerance

      key = begin
        Base64.strict_decode64(secret.delete_prefix("whsec_"))
      rescue ArgumentError
        raise WebhookVerificationError, "Signing secret isn't valid base64"
      end
      expected = OpenSSL::HMAC.digest("SHA256", key, "#{id}.#{ts}.#{payload}")
      # Several space-separated signatures can arrive during secret rotation; any valid one is enough.
      ok = sigs.split(/\s+/).any? do |part|
        version, sig = part.split(",", 2)
        next false unless version == "v1" && sig
        decoded = (Base64.strict_decode64(sig) rescue nil)
        decoded && decoded.bytesize == expected.bytesize && OpenSSL.fixed_length_secure_compare(decoded, expected)
      end
      raise WebhookVerificationError, "Signature doesn't match" unless ok

      event = JSON.parse(payload) rescue nil
      raise WebhookVerificationError, "Body is not valid JSON" unless event.is_a?(Hash)
      event
    end
  end
end
