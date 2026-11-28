# frozen_string_literal: true

# Runs against the real API when DELIVRIE_TEST_KEY is set (the Live API test workflow sets it): ruby -Ilib test/live.rb
require "delivrie"

key = ENV["DELIVRIE_TEST_KEY"]
(puts "DELIVRIE_TEST_KEY not set, skipped"; exit 0) if key.nil? || key.empty?
from = ENV["DELIVRIE_TEST_FROM"] || "Delivrie CI <onboarding@delivrie.io>"
run = ENV["GITHUB_RUN_ID"] || Time.now.to_i.to_s
d = Delivrie::Client.new(key)
fail = 0
check = lambda do |name, &blk|
  blk.call
  puts "ok    #{name}"
rescue StandardError => e
  fail += 1
  puts "FAIL  #{name}\n      #{e.message}"
end
mail = ->(subject) { { from: from, to: "delivered@test.delivrie.io", subject: "[CI #{run}] #{subject}", text: "Live API test #{run}" } }

check.call("Ruby SDK: send") { raise "no id" unless d.emails.send_email(mail.("Ruby SDK send"))["id"].to_s.size > 10 }
check.call("Ruby SDK: idempotent retry returns the same email") do
  k = "ruby-live-#{run}-#{Time.now.to_f}"
  a = d.emails.send_email(mail.("Ruby SDK idempotent"), idempotency_key: k)
  b = d.emails.send_email(mail.("Ruby SDK idempotent"), idempotency_key: k)
  raise "#{a['id']} != #{b['id']}" unless a["id"] == b["id"]
end
check.call("Ruby SDK: API errors raise Delivrie::Error") do
  d.emails.send_email(from: from, to: "not-an-address", subject: "x", text: "x")
  raise "expected an error"
rescue Delivrie::Error => e
  raise "got #{e.status} #{e.name}" unless e.status == 422 && e.name == "validation_error"
end
exit(fail.zero? ? 0 : 1)
