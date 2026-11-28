# frozen_string_literal: true

require "minitest/autorun"
require "json"
require "tempfile"
require "delivrie"

class FakeTransport
  attr_reader :calls

  def initialize(*responses)
    @responses = responses
    @calls = []
  end

  def call(method, url, headers, body, _timeout)
    @calls << { method: method, url: url, headers: headers, body: body && JSON.parse(body) }
    r = @responses.shift || [200, {}, "{}"]
    raise r if r.is_a?(Exception)
    r
  end
end

class ClientTest < Minitest::Test
  def client(*responses, **opts)
    @t = FakeTransport.new(*responses)
    Delivrie::Client.new("dlv_test", transport: @t, **opts)
  end

  def test_requires_a_key
    old = ENV.delete("DELIVRIE_API_KEY")
    assert_raises(ArgumentError) { Delivrie::Client.new }
  ensure
    ENV["DELIVRIE_API_KEY"] = old if old
  end

  def test_send_email
    d = client([200, {}, '{"id":"e1"}'])
    out = d.emails.send_email({ from: "Acme <hi@acme.com>", to: "ada@example.com", subject: "Hi", html: "<p>x</p>" }, idempotency_key: "k1")
    assert_equal "e1", out["id"]
    c = @t.calls.first
    assert_equal "POST", c[:method]
    assert_equal "https://delivrie.io/api/emails", c[:url]
    assert_equal "Bearer dlv_test", c[:headers]["Authorization"]
    assert_equal "k1", c[:headers]["Idempotency-Key"]
    assert_equal "application/json", c[:headers]["Content-Type"]
    assert_match(/delivrie-ruby/, c[:headers]["User-Agent"])
    assert_equal "ada@example.com", c[:body]["to"]
  end

  def test_local_attachments_are_read
    f = Tempfile.new(["invoice", ".pdf"]); f.write("PDF"); f.close
    d = client
    d.emails.send_email(from: "a@acme.com", to: "b@x.com", subject: "s", text: "t", attachments: [{ path: f.path }, { path: "https://acme.com/x.pdf" }])
    a = @t.calls.first[:body]["attachments"]
    assert_equal "UERG", a[0]["content"]
    assert_equal File.basename(f.path), a[0]["filename"]
    assert_equal "https://acme.com/x.pdf", a[1]["path"]
  end

  def test_ids_are_encoded_and_queries_sent
    d = client
    d.contacts.get("ada+1@example.com")
    d.segments.contacts("s 1", limit: 5, offset: nil)
    d.inbox.threads(needs_reply: true, q: "label:billing is:unread")
    assert_equal "https://delivrie.io/api/contacts/ada%2B1%40example.com", @t.calls[0][:url]
    assert_equal "https://delivrie.io/api/segments/s%201/contacts?limit=5", @t.calls[1][:url]
    assert_equal "https://delivrie.io/api/inbox/threads?needs_reply=true&q=label%3Abilling+is%3Aunread", @t.calls[2][:url]
  end

  def test_post_without_body_sends_empty_object
    d = client
    d.broadcasts.cancel("b1")
    d.broadcasts.send_broadcast("b1")
    assert_equal({}, @t.calls[0][:body])
    assert_equal({}, @t.calls[1][:body])
    assert_equal "POST", @t.calls[1][:method]
  end

  def test_new_endpoints
    d = client
    d.broadcasts.duplicate("b1", name: "Copy")
    d.broadcasts.links("b1")
    d.templates.edit_content("welcome", ops: [{ op: "delete", id: "x" }], summary: "s")
    d.api_keys.update("k1", name: "Prod")
    d.emails.received_attachments("e1")
    d.segments.remove_contacts("s1", contacts: ["a@b.com"])
    d.contacts.import_contacts(csv: "email\na@b.com")
    d.ai.draft(url: "https://acme.com", brief: "x")
    got = @t.calls.map { |c| "#{c[:method]} #{c[:url].sub('https://delivrie.io/api', '')}" }
    assert_equal ["POST /broadcasts/b1/duplicate", "GET /broadcasts/b1/links", "POST /templates/welcome/content", "PATCH /api-keys/k1", "GET /emails/received/e1/attachments", "DELETE /segments/s1/contacts", "POST /contacts/imports", "POST /ai/draft"], got
    assert_equal({ "contacts" => ["a@b.com"] }, @t.calls[5][:body])
  end

  def test_errors
    d = client([422, {}, '{"statusCode":422,"name":"validation_error","message":"Missing `to`"}'])
    e = assert_raises(Delivrie::Error) { d.emails.send_email(from: "a@acme.com") }
    assert_equal 422, e.status
    assert_equal "validation_error", e.name
    assert_equal "Missing `to`", e.message
  end

  def test_retries_safe_requests_only
    d = client([503, {}, "oops"], [200, {}, '{"object":"list","data":[]}'], max_retries: 2)
    d.define_singleton_method(:sleep) { |_s| }
    d.send(:define_singleton_method, :backoff) { |_a| 0 }
    assert_equal "list", d.domains.list["object"]
    assert_equal 2, @t.calls.size

    d = client([503, {}, "oops"], [200, {}, "{}"])
    d.send(:define_singleton_method, :backoff) { |_a| 0 }
    assert_raises(Delivrie::Error) { d.emails.send_email(from: "a") } # no idempotency key: not retried
    assert_equal 1, @t.calls.size

    d = client([429, { "retry-after" => "0" }, "{}"], [200, {}, '{"id":"e2"}'])
    d.send(:define_singleton_method, :backoff) { |_a| 0 }
    assert_equal "e2", d.emails.send_email({ from: "a" }, idempotency_key: "k")["id"]
  end

  def test_network_error_retried
    d = client(Delivrie::Error.new("down", name: "network_error"), [200, {}, "{}"])
    d.send(:define_singleton_method, :backoff) { |_a| 0 }
    d.domains.list
    assert_equal 2, @t.calls.size
  end

  def test_base_url_and_shortcut
    t = FakeTransport.new
    Delivrie.new("k", base_url: "http://localhost:9000/api/", transport: t).usage
    assert_equal "http://localhost:9000/api/usage", t.calls.first[:url]
  end
end
