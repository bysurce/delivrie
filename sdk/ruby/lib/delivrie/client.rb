# frozen_string_literal: true

require "json"
require "net/http"
require "uri"

module Delivrie
  # The Delivrie client.
  #
  #   delivrie = Delivrie::Client.new(ENV["DELIVRIE_API_KEY"])
  #   email = delivrie.emails.send_email(from: "Acme <hi@acme.com>", to: "ada@example.com", subject: "Hello", html: "<p>It works</p>")
  #   email["id"]
  #
  # Every method returns the API's JSON as a Hash (string keys) or raises Delivrie::Error. Rate limits, server errors
  # and network errors are retried for safe requests, and for sends only with an idempotency key, so a retry never
  # sends an email twice.
  class Client
    DEFAULT_BASE_URL = "https://delivrie.io/api"

    attr_reader :base_url

    # api_key   falls back to ENV["DELIVRIE_API_KEY"]
    # base_url  falls back to ENV["DELIVRIE_BASE_URL"], then https://delivrie.io/api
    # transport replaces the HTTP call (for tests): ->(method, url, headers, body, timeout) { [status, headers, body] }
    def initialize(api_key = nil, base_url: nil, timeout: 30, max_retries: 2, headers: {}, transport: nil)
      @api_key = api_key || ENV["DELIVRIE_API_KEY"]
      if @api_key.nil? || @api_key.empty?
        raise ArgumentError, "Missing API key. Pass it to Delivrie::Client.new(key) or set DELIVRIE_API_KEY. Create one at https://delivrie.io/api-keys"
      end
      @base_url = (base_url || ENV["DELIVRIE_BASE_URL"] || DEFAULT_BASE_URL).sub(%r{/+\z}, "")
      @timeout = timeout
      @max_retries = [max_retries.to_i, 0].max
      @headers = headers
      @transport = transport
    end

    # Calls any API path (relative to the base URL, like "/emails") and returns the decoded JSON.
    def request(method, path, body = nil, query: nil, idempotency_key: nil)
      method = method.to_s.upcase
      url = @base_url + path
      q = (query || {}).reject { |_k, v| v.nil? || v == "" }
      url += (url.include?("?") ? "&" : "?") + URI.encode_www_form(q.transform_values { |v| v == true || v == false ? v.to_s : v }) unless q.empty?
      headers = { "Authorization" => "Bearer #{@api_key}", "Accept" => "application/json", "User-Agent" => "delivrie-ruby/#{VERSION}" }.merge(@headers)
      payload = nil
      unless body.nil?
        payload = JSON.generate(body)
        headers["Content-Type"] = "application/json"
      end
      headers["Idempotency-Key"] = idempotency_key.to_s if idempotency_key
      # GET and DELETE are safe to repeat; POST and PATCH only with an idempotency key.
      retryable = %w[GET DELETE].include?(method) || !idempotency_key.nil?

      attempt = 0
      loop do
        begin
          status, res_headers, raw = perform(method, url, headers, payload)
        rescue Error => e
          raise unless retryable && attempt < @max_retries
          sleep(backoff(attempt))
          attempt += 1
          next
        end
        json = raw.nil? || raw.empty? ? nil : (JSON.parse(raw) rescue nil)
        return json.is_a?(Hash) ? json : { "data" => json } if status.between?(200, 299)

        if (status == 429 || status >= 500) && retryable && attempt < @max_retries
          after = res_headers["retry-after"].to_i
          sleep(after.positive? ? [after, 30].min : backoff(attempt))
          attempt += 1
          next
        end
        raise Error.from_response(status, json, raw)
      end
    end

    # Plan, emails sent this month and today, and credits.
    def usage = request(:get, "/usage")

    # Sent, delivered, opened, clicked, bounced and complained totals: { days:, domain_id: }.
    def metrics(params = nil, **fields) = request(:get, "/metrics", query: (params || {}).merge(fields))

    private

    def backoff(attempt)
      [8.0, 0.5 * (2**attempt)].min + rand * 0.25
    end

    def perform(method, url, headers, payload)
      return @transport.call(method, url, headers, payload, @timeout) if @transport

      uri = URI(url)
      http = Net::HTTP.new(uri.host, uri.port)
      http.use_ssl = uri.scheme == "https"
      http.open_timeout = [10, @timeout].min
      http.read_timeout = @timeout
      req = Net::HTTPGenericRequest.new(method, !payload.nil?, true, uri.request_uri, headers)
      req.body = payload if payload
      res = http.request(req)
      [res.code.to_i, res.each_header.to_h, res.body.to_s]
    rescue Net::OpenTimeout, Net::ReadTimeout
      raise Error.new("No response within #{@timeout} seconds", status: 0, name: "timeout")
    rescue SocketError, SystemCallError, IOError, OpenSSL::SSL::SSLError => e
      raise Error.new("Couldn't reach Delivrie: #{e.message}", status: 0, name: "network_error")
    end
  end
end
