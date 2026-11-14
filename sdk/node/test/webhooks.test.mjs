import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac, randomBytes } from "node:crypto";
import { verifyWebhook, WebhookVerificationError, Delivrie } from "../dist/esm/index.js";

// Signed exactly as supabase/functions/delivrie/send.ts signs deliveries.
const secret = "whsec_" + randomBytes(24).toString("base64");
function sign(id, ts, body, s = secret) {
  return "v1," + createHmac("sha256", Buffer.from(s.slice(6), "base64")).update(`${id}.${ts}.${body}`).digest("base64");
}
const body = JSON.stringify({ type: "email.delivered", created_at: "2026-11-14T10:00:00Z", data: { email_id: "em_1" } });
const now = () => Math.floor(Date.now() / 1000);

test("valid signature returns the event (plain object headers)", async () => {
  const ts = now();
  const ev = await verifyWebhook({ payload: body, secret, headers: { "Webhook-Id": "evt_1", "webhook-timestamp": String(ts), "webhook-signature": sign("evt_1", ts, body) } });
  assert.equal(ev.type, "email.delivered");
  assert.equal(ev.data.email_id, "em_1");
});

test("Headers object, byte payload and rotated signatures", async () => {
  const ts = now();
  const h = new Headers({ "webhook-id": "evt_2", "webhook-timestamp": String(ts), "webhook-signature": `v1,AAAA ${sign("evt_2", ts, body)}` });
  const ev = await new Delivrie("k", { fetch: async () => new Response("{}") }).webhooks.verify({ payload: new TextEncoder().encode(body), headers: h, secret });
  assert.equal(ev.type, "email.delivered");
});

test("tampered body, wrong secret, stale timestamp and missing headers are rejected", async () => {
  const ts = now();
  const headers = { "webhook-id": "evt_3", "webhook-timestamp": String(ts), "webhook-signature": sign("evt_3", ts, body) };
  await assert.rejects(verifyWebhook({ payload: body.replace("em_1", "em_2"), headers, secret }), WebhookVerificationError);
  await assert.rejects(verifyWebhook({ payload: body, headers, secret: "whsec_" + randomBytes(24).toString("base64") }), /doesn't match/);
  const old = ts - 600;
  await assert.rejects(verifyWebhook({ payload: body, secret, headers: { ...headers, "webhook-timestamp": String(old), "webhook-signature": sign("evt_3", old, body) } }), /too old/);
  await assert.rejects(verifyWebhook({ payload: body, secret, headers: { "webhook-id": "evt_3" } }), /Missing/);
});

test("works without a global crypto (Node 18)", async () => {
  const desc = Object.getOwnPropertyDescriptor(globalThis, "crypto");
  Object.defineProperty(globalThis, "crypto", { value: undefined, configurable: true, writable: true });
  try {
    const ts = now();
    const ev = await verifyWebhook({ payload: body, secret, headers: { "webhook-id": "evt_4", "webhook-timestamp": String(ts), "webhook-signature": sign("evt_4", ts, body) } });
    assert.equal(ev.type, "email.delivered");
  } finally {
    Object.defineProperty(globalThis, "crypto", desc);
  }
});
