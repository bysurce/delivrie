const { test } = require("node:test");
const assert = require("node:assert/strict");
const Delivrie = require("../dist/cjs/index.cjs");

test("CommonJS: require() returns the class, with named exports attached", () => {
  assert.equal(typeof Delivrie, "function");
  assert.equal(Delivrie.Delivrie, Delivrie);
  assert.equal(typeof Delivrie.verifyWebhook, "function");
  const d = new Delivrie("k", { fetch: async () => new Response("{}") });
  assert.equal(d.baseUrl, "https://delivrie.io/api");
});

test("CommonJS: webhook verification", async () => {
  const { createHmac } = require("node:crypto");
  const secret = "whsec_" + Buffer.from("cjs-secret-bytes").toString("base64");
  const body = '{"type":"email.sent","created_at":"x","data":{}}';
  const ts = Math.floor(Date.now() / 1000);
  const sig = "v1," + createHmac("sha256", Buffer.from("cjs-secret-bytes")).update(`m1.${ts}.${body}`).digest("base64");
  const ev = await Delivrie.verifyWebhook({ payload: body, secret, headers: { "webhook-id": "m1", "webhook-timestamp": String(ts), "webhook-signature": sig } });
  assert.equal(ev.type, "email.sent");
});
