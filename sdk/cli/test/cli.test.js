import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Readable, Writable } from "node:stream";
import { run } from "../dist/cli.js";

const KEY = "dlv_test_1234567890";
let server, base, calls = [];
const now = new Date().toISOString();
const routes = {
  "GET /usage": (req) => (req.headers.authorization === `Bearer dlv_sending_123456` ? [403, { name: "restricted_api_key", message: "This API key can only send emails", statusCode: 403 }] : req.headers.authorization === `Bearer dlv_bad_12345678` ? [401, { name: "invalid_api_key", message: "Invalid API key", statusCode: 401 }] : [200, { object: "usage", plan: "pro", emails_this_month: 1234, monthly_allowance: 50000, emails_today: 12, daily_limit: null, credits_emails: 0 }]),
  "POST /emails": () => [200, { id: "em_123" }],
  "GET /emails": () => [200, { object: "list", data: [{ id: "em_1", to: ["ada@example.com"], subject: "Hi", last_event: "delivered", created_at: now }] }],
  "GET /emails/em_1": () => [200, { object: "email", id: "em_1", from: "hi@acme.com", to: ["ada@example.com"], subject: "Hi", last_event: "delivered", created_at: now, events: [{ type: "email.sent", created_at: now }] }],
  "GET /domains": () => [200, { object: "list", data: [{ id: "d_1", name: "acme.com", status: "pending", region: "eu-west-1", created_at: now }] }],
  "POST /domains/d_1/verify": () => [200, { id: "d_1", name: "acme.com", status: "pending", records: [{ type: "TXT", name: "x._domainkey", value: "p=abc", status: "pending", priority: null }] }],
  "DELETE /domains/d_1": () => [200, { object: "domain", id: "d_1", deleted: true }],
  "POST /api-keys": () => [200, { id: "k_1", token: "dlv_new_secret" }],
  "POST /webhooks": () => [200, { object: "webhook", id: "w_1", signing_secret: "whsec_abc" }],
  "GET /emails/missing": () => [404, { name: "not_found", message: "Email not found", statusCode: 404 }],
};

before(async () => {
  server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      const url = new URL(req.url, "http://x");
      calls.push({ method: req.method, path: url.pathname, query: url.search, headers: req.headers, body: body ? JSON.parse(body) : undefined });
      const h = routes[`${req.method} ${url.pathname}`];
      const [status, json] = h ? h(req) : [404, { name: "not_found", message: "Not found", statusCode: 404 }];
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify(json));
    });
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

function io({ stdin = "", tty = false, env = {} } = {}) {
  let out = "", err = "";
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dlv-cli-"));
  const input = Readable.from([stdin]); input.isTTY = tty;
  return {
    io: { stdout: new Writable({ write(c, _e, cb) { out += c; cb(); } }), stderr: new Writable({ write(c, _e, cb) { err += c; cb(); } }), stdin: input, env: { DELIVRIE_BASE_URL: base, DELIVRIE_CONFIG_DIR: dir, ...env } },
    out: () => out, err: () => err, dir,
  };
}
const last = () => calls[calls.length - 1];

test("version and help", async () => {
  const t = io();
  assert.equal(await run(["--version"], t.io), 0);
  assert.match(t.out(), /^\d+\.\d+\.\d+\n$/);
  const h = io();
  assert.equal(await run(["send", "--help"], h.io), 0);
  assert.match(h.out(), /--html-file/);
});

test("send builds the request, adds an idempotency key and prints the id", async () => {
  const t = io({ env: { DELIVRIE_API_KEY: KEY } });
  const code = await run(["send", "-f", "Acme <hi@acme.com>", "-t", "ada@example.com,bob@example.com", "--to", "cy@example.com", "-s", "Hello", "--text", "Hi", "--tag", "kind=welcome", "--header", "X-Entity: 42", "--schedule", "in 1 hour"], t.io);
  assert.equal(code, 0, t.err());
  const c = last();
  assert.equal(c.method, "POST"); assert.equal(c.path, "/emails");
  assert.equal(c.headers.authorization, `Bearer ${KEY}`);
  assert.match(c.headers["idempotency-key"], /^[0-9a-f-]{36}$/);
  assert.match(c.headers["user-agent"], /^delivrie-cli\//);
  assert.deepEqual(c.body, { to: ["ada@example.com", "bob@example.com", "cy@example.com"], from: "Acme <hi@acme.com>", subject: "Hello", text: "Hi", tags: [{ name: "kind", value: "welcome" }], headers: { "X-Entity": "42" }, scheduled_at: "in 1 hour" });
  assert.match(t.out(), /Scheduled em_123/);
});

test("send reads HTML from stdin and attaches files", async () => {
  const file = path.join(os.tmpdir(), "dlv-attach.txt"); fs.writeFileSync(file, "hello");
  const t = io({ stdin: "<p>Hi</p>", env: { DELIVRIE_API_KEY: KEY } });
  assert.equal(await run(["send", "-f", "hi@acme.com", "-t", "ada@example.com", "-s", "Hi", "--html-file", "-", "--attach", file, "-q"], t.io), 0, t.err());
  assert.equal(last().body.html, "<p>Hi</p>");
  assert.deepEqual(last().body.attachments, [{ filename: "dlv-attach.txt", content: Buffer.from("hello").toString("base64") }]);
  assert.equal(t.out(), "em_123\n");
});

test("send with a template needs no subject or body", async () => {
  const t = io({ env: { DELIVRIE_API_KEY: KEY } });
  assert.equal(await run(["send", "-t", "ada@example.com", "--template", "welcome", "--var", "name=Ada", "--var", "plan=Pro"], t.io), 0, t.err());
  assert.deepEqual(last().body.template, { id: "welcome", variables: { name: "Ada", plan: "Pro" } });
});

test("send explains what is missing", async () => {
  const t = io({ env: { DELIVRIE_API_KEY: KEY } });
  assert.equal(await run(["send", "-t", "ada@example.com", "-s", "Hi"], t.io), 2);
  assert.match(t.err(), /Add a body/);
});

test("no key gives a clear message", async () => {
  const t = io();
  assert.equal(await run(["emails", "list"], t.io), 2);
  assert.match(t.err(), /delivrie login/);
});

test("login checks the key, saves it privately, then other commands use it", async () => {
  const t = io({ stdin: KEY });
  assert.equal(await run(["login"], t.io), 0, t.err());
  assert.match(t.out(), /full-access key/);
  const file = path.join(t.dir, "config.json");
  assert.equal(JSON.parse(fs.readFileSync(file, "utf8")).api_key, KEY);
  if (process.platform !== "win32") assert.equal(fs.statSync(file).mode & 0o777, 0o600);
  const w = { ...t, io: { ...t.io } };
  assert.equal(await run(["whoami"], w.io), 0);
  assert.match(t.out(), /1,234 of 50,000 emails this month/);
  assert.equal(await run(["logout"], t.io), 0);
  assert.equal(fs.existsSync(file), false);
});

test("login recognises sending-only and rejected keys", async () => {
  const s = io({ stdin: "dlv_sending_123456" });
  assert.equal(await run(["login"], s.io), 0);
  assert.match(s.out(), /sending-only/);
  const b = io({ stdin: "dlv_bad_12345678" });
  assert.equal(await run(["login"], b.io), 1);
  assert.match(b.err(), /didn't accept/);
  const n = io({ stdin: "not-a-key" });
  assert.equal(await run(["login"], n.io), 1);
});

test("emails list and get print tables; --json prints the response", async () => {
  const t = io({ env: { DELIVRIE_API_KEY: KEY } });
  assert.equal(await run(["emails", "list", "-n", "5"], t.io), 0);
  assert.equal(last().query, "?limit=5");
  assert.match(t.out(), /em_1\s+delivered\s+ada@example.com\s+Hi/);
  const g = io({ env: { DELIVRIE_API_KEY: KEY } });
  assert.equal(await run(["emails", "get", "em_1"], g.io), 0);
  assert.match(g.out(), /sent/);
  const j = io({ env: { DELIVRIE_API_KEY: KEY } });
  assert.equal(await run(["emails", "get", "em_1", "--json"], j.io), 0);
  assert.equal(JSON.parse(j.out()).id, "em_1");
});

test("domains accept a name instead of an id", async () => {
  const t = io({ env: { DELIVRIE_API_KEY: KEY } });
  assert.equal(await run(["domains", "verify", "acme.com"], t.io), 0, t.err());
  assert.equal(last().path, "/domains/d_1/verify");
  assert.match(t.out(), /x\._domainkey/);
});

test("deleting needs --yes when not interactive", async () => {
  const t = io({ env: { DELIVRIE_API_KEY: KEY } });
  assert.equal(await run(["domains", "delete", "acme.com"], t.io), 2);
  assert.match(t.err(), /--yes/);
  const y = io({ env: { DELIVRIE_API_KEY: KEY } });
  assert.equal(await run(["domains", "delete", "acme.com", "--yes"], y.io), 0);
  assert.equal(last().method, "DELETE");
});

test("keys and webhooks show their secret once", async () => {
  const k = io({ env: { DELIVRIE_API_KEY: KEY } });
  assert.equal(await run(["keys", "create", "CI", "--sending"], k.io), 0);
  assert.deepEqual(last().body, { name: "CI", permission: "sending_access" });
  assert.match(k.out(), /dlv_new_secret/);
  const w = io({ env: { DELIVRIE_API_KEY: KEY } });
  assert.equal(await run(["webhooks", "create", "https://acme.com/hook", "--events", "email.delivered,email.bounced"], w.io), 0);
  assert.deepEqual(last().body.events, ["email.delivered", "email.bounced"]);
  assert.match(w.out(), /whsec_abc/);
});

test("API errors are readable and exit 1", async () => {
  const t = io({ env: { DELIVRIE_API_KEY: KEY } });
  assert.equal(await run(["emails", "get", "missing"], t.io), 1);
  assert.match(t.err(), /Email not found/);
  const j = io({ env: { DELIVRIE_API_KEY: KEY } });
  assert.equal(await run(["emails", "get", "missing", "--json"], j.io), 1);
  assert.equal(JSON.parse(j.out()).error.name, "not_found");
});

test("unknown commands exit 2", async () => {
  const t = io();
  assert.equal(await run(["frobnicate"], t.io), 2);
});
