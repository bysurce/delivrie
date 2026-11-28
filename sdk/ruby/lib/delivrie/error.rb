# frozen_string_literal: true

module Delivrie
  # Raised for any failed request. `status` is the HTTP status (0 for network errors and timeouts) and `name` is
  # Delivrie's error name, like "validation_error", "invalid_api_key" or "rate_limit_exceeded".
  class Error < StandardError
    attr_reader :status, :name

    def initialize(message, status: 0, name: "application_error")
      super(message)
      @status = status
      @name = name
    end

    # @api private
    def self.from_response(status, json, raw)
      j = json.is_a?(Hash) ? json : {}
      name = j["name"].is_a?(String) ? j["name"] : { 401 => "invalid_api_key", 404 => "not_found", 429 => "rate_limit_exceeded" }.fetch(status, "application_error")
      message = j["message"].is_a?(String) ? j["message"] : (raw.to_s[0, 300].strip.empty? ? "Request failed with status #{status}" : raw.to_s[0, 300].strip)
      new(message, status: j["statusCode"].is_a?(Integer) ? j["statusCode"] : status, name: name)
    end
  end

  # Raised by Delivrie::Webhook.verify when a request isn't a genuine, recent Delivrie webhook.
  class WebhookVerificationError < StandardError; end
end
