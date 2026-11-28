// Runs without zapier-platform-core: a fake `z` records requests. `npm test` (node --test).
const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");
const origLoad = Module._load;
Module._load = function (req, ...rest) { return req === "zapier-platform-core" ? { version: "15.19.0" } : origLoad.call(this, req, ...rest); };
const App = require("../index.js");
const { flatten } = require("../hooks");
const { addAuth, handleErrors } = require("../api");

class ZError extends Error { constructor(m, name, status) { super(m); this.name = name; this.status = status; } }
const fakeZ = (responses = []) => {
  const calls = [];
  return { calls, errors: { Error: ZError, ThrottledError: ZError }, request: async (opts) => { calls.push(opts); const r = responses.shift() || { status: 200, data: { id: "x", data: [] } }; return r; } };
};

test("auth header and errors", () => {
  const r = addAuth({}, null, { authData: { api_key: "dlv_x" } });
  assert.equal(r.headers.Authorization, "Bearer dlv_x");
  assert.throws(() => handleErrors({ status: 422, json: { name: "validation_error", message: "Missing `to`" } }, fakeZ()), /Missing `to`/);
});

test("send email", async () => {
  const z = fakeZ();
  await App.creates.send_email.operation.perform(z, { inputData: { from: "Acme <hi@acme.com>", to: "ada@example.com, sam@example.com", subject: "Hi", html: "<p>x</p>", attachment_url: "https://acme.com/a.pdf", idempotency_key: "k" } });
  const c = z.calls[0];
  assert.equal(c.url, "https://delivrie.io/api/emails");
  assert.deepEqual(c.body.to, ["ada@example.com", "sam@example.com"]);
  assert.deepEqual(c.body.attachments, [{ path: "https://acme.com/a.pdf" }]);
  assert.equal(c.headers["Idempotency-Key"], "k");
  assert.equal(c.body.cc, undefined);
  await assert.rejects(App.creates.send_email.operation.perform(fakeZ(), { inputData: { from: "a", to: "b" } }), /body/);
});

test("template send", async () => {
  const z = fakeZ();
  await App.creates.send_email.operation.perform(z, { inputData: { from: "a@acme.com", to: ["b@x.com"], template: "welcome", variables: { first_name: "Ada" } } });
  assert.deepEqual(z.calls[0].body.template, { id: "welcome", variables: { first_name: "Ada" } });
});

test("hooks subscribe, unsubscribe and perform", async () => {
  const t = App.triggers.email_event.operation;
  const z = fakeZ([{ status: 200, data: { id: "wh_1", signing_secret: "whsec_x" } }]);
  const sub = await t.performSubscribe(z, { targetUrl: "https://hooks.zapier.com/x", inputData: { events: ["email.bounced"] } });
  assert.equal(sub.id, "wh_1");
  assert.deepEqual(z.calls[0].body, { endpoint: "https://hooks.zapier.com/x", events: ["email.bounced"] });
  await t.performUnsubscribe(z, { subscribeData: { id: "wh_1" } });
  assert.equal(z.calls[1].method, "DELETE");
  assert.equal(z.calls[1].url, "https://delivrie.io/api/webhooks/wh_1");
  const [ev] = await t.perform(z, { cleanedRequest: { type: "email.bounced", created_at: "t", data: { email_id: "e1", to: ["a@b.com"] } } });
  assert.equal(ev.id, "email.bounced:e1:t");
  assert.equal(ev.email_id, "e1");
  const fixed = App.triggers.email_received.operation;
  const z2 = fakeZ([{ status: 200, data: { id: "wh_2" } }]);
  await fixed.performSubscribe(z2, { targetUrl: "https://hooks.zapier.com/y", inputData: {} });
  assert.deepEqual(z2.calls[0].body.events, ["email.received"]);
});

test("contacts", async () => {
  const z = fakeZ([{ status: 200, data: {} }, { status: 404, data: {} }]);
  await App.creates.upsert_contact.operation.perform(z, { inputData: { email: "a@b.com", segment_id: "s1", unsubscribed: "false" } });
  assert.deepEqual(z.calls[0].body, { email: "a@b.com", segments: ["s1"], unsubscribed: false });
  assert.deepEqual(await App.searches.find_contact.operation.perform(z, { inputData: { email: "Nobody@x.com" } }), []);
  assert.equal(z.calls[1].url, "https://delivrie.io/api/contacts/nobody%40x.com");
  assert.ok(flatten({ type: "x", data: {} }).id.startsWith("x:"));
});
