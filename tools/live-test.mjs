// Live API test: sends real emails to Delivrie's test addresses and checks the parts that only a real
// round trip proves: the delivrie SDK, the official Resend SDK pointed at Delivrie, idempotent retries
// (single, batch and two identical requests at once) and the error format.
//
// Needs DELIVRIE_TEST_KEY (a sending access key). Optional: DELIVRIE_TEST_FROM (default onboarding@delivrie.io),
// DELIVRIE_BASE_URL (default https://delivrie.io/api). Each run sends about 12 emails to *@test.delivrie.io.
// Run: npm i --no-save delivrie resend && node tools/live-test.mjs
import { Delivrie } from "delivrie";
import { Resend } from "resend";

const KEY = process.env.DELIVRIE_TEST_KEY;
const BASE = (process.env.DELIVRIE_BASE_URL || "https://delivrie.io/api").replace(/\/+$/, "");
const FROM = process.env.DELIVRIE_TEST_FROM || "Delivrie CI <onboarding@delivrie.io>";
const RUN = process.env.GITHUB_RUN_ID ? `${process.env.GITHUB_RUN_ID}-${process.env.GITHUB_RUN_ATTEMPT || 1}` : String(Date.now());

if (!KEY) {
  console.log("::warning::DELIVRIE_TEST_KEY isn't set, so the live API test was skipped. Add a sending access key as a repository secret.");
  process.exit(0);
}

let failed = 0;
const results = [];
async function check(name, fn) {
  try {
    await fn();
    results.push(["ok", name]);
    console.log(`ok    ${name}`);
  } catch (e) {
    failed++;
    results.push(["FAIL", name, e.message]);
    console.log(`FAIL  ${name}\n      ${e.message}`);
  }
}
const assert = (cond, msg) => { if (!cond) throw new Error(msg); };
const email = (to, subject) => ({ from: FROM, to, subject: `[CI ${RUN}] ${subject}`, html: `<p>Live API test ${RUN}</p>` });

// ---------------------------------------------------------------- delivrie SDK
const delivrie = new Delivrie(KEY, { baseUrl: BASE, maxRetries: 0 });

await check("delivrie SDK: send to delivered@test.delivrie.io", async () => {
  const { data, error } = await delivrie.emails.send(email("delivered@test.delivrie.io", "SDK send"));
  assert(!error, `error: ${JSON.stringify(error)}`);
  assert(typeof data?.id === "string" && data.id.length > 10, `no id in ${JSON.stringify(data)}`);
});

await check("delivrie SDK: retry with the same idempotency key returns the same email", async () => {
  const key = `ci-${RUN}-single`;
  const a = await delivrie.emails.send(email("delivered@test.delivrie.io", "Idempotent single"), { idempotencyKey: key });
  const b = await delivrie.emails.send(email("delivered@test.delivrie.io", "Idempotent single (retry)"), { idempotencyKey: key });
  assert(!a.error && !b.error, `errors: ${JSON.stringify([a.error, b.error])}`);
  assert(a.data.id === b.data.id, `first ${a.data.id}, retry ${b.data.id}`);
});

await check("delivrie SDK: batch retry with the same key returns the same ids in order", async () => {
  const key = `ci-${RUN}-batch`;
  const list = [email("delivered@test.delivrie.io", "Batch 1"), email("delivered@test.delivrie.io", "Batch 2")];
  const a = await delivrie.emails.batch(list, { idempotencyKey: key });
  const b = await delivrie.emails.batch(list, { idempotencyKey: key });
  assert(!a.error, `first batch: ${JSON.stringify(a.error)}`);
  assert(!b.error, `retry: ${JSON.stringify(b.error)}`);
  const ids = (r) => r.data.data.map((x) => x.id).join(",");
  assert(a.data.data.length === 2, `expected 2 ids, got ${JSON.stringify(a.data)}`);
  assert(ids(a) === ids(b), `first ${ids(a)}, retry ${ids(b)}`);
});

await check("delivrie SDK: validation errors come back as { statusCode, name, message }", async () => {
  const { data, error } = await delivrie.emails.send({ from: FROM, to: "delivered@test.delivrie.io", subject: "No body" });
  assert(data === null, "expected no data");
  assert(error?.statusCode === 422 && error.name === "validation_error" && /html|text/i.test(error.message), `got ${JSON.stringify(error)}`);
});

// ---------------------------------------------------------------- plain HTTP: two identical requests at once
await check("HTTP: two simultaneous sends with one idempotency key return one email", async () => {
  const key = `ci-${RUN}-race`;
  const send = () => fetch(`${BASE}/emails`, {
    method: "POST",
    headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json", "Idempotency-Key": key },
    body: JSON.stringify(email("delivered@test.delivrie.io", "Simultaneous")),
  }).then(async (r) => ({ status: r.status, body: await r.json() }));
  const [a, b] = await Promise.all([send(), send()]);
  assert(a.status === 200 && b.status === 200, `statuses ${a.status} ${JSON.stringify(a.body)} / ${b.status} ${JSON.stringify(b.body)}`);
  assert(a.body.id === b.body.id, `ids ${a.body.id} and ${b.body.id}`);
});

// ---------------------------------------------------------------- official Resend SDK pointed at Delivrie
process.env.RESEND_BASE_URL = BASE; // what the Migrate from Resend guide tells people to set
const resend = new Resend(KEY);

await check("Resend SDK (RESEND_BASE_URL): emails.send", async () => {
  const { data, error } = await resend.emails.send(email(["delivered@test.delivrie.io"], "Resend SDK send"));
  assert(!error, `error: ${JSON.stringify(error)}`);
  assert(typeof data?.id === "string", `no id in ${JSON.stringify(data)}`);
});

await check("Resend SDK: idempotency key on retry", async () => {
  const key = `ci-${RUN}-resend`;
  const a = await resend.emails.send(email("delivered@test.delivrie.io", "Resend idempotent"), { idempotencyKey: key });
  const b = await resend.emails.send(email("delivered@test.delivrie.io", "Resend idempotent (retry)"), { idempotencyKey: key });
  assert(!a.error && !b.error, `errors: ${JSON.stringify([a.error, b.error])}`);
  assert(a.data.id === b.data.id, `first ${a.data.id}, retry ${b.data.id}`);
});

await check("Resend SDK: batch.send", async () => {
  const { data, error } = await resend.batch.send([email("delivered@test.delivrie.io", "Resend batch 1"), email("bounced@test.delivrie.io", "Resend batch 2")]);
  assert(!error, `error: ${JSON.stringify(error)}`);
  assert(Array.isArray(data?.data) && data.data.length === 2, `got ${JSON.stringify(data)}`);
});

await check("Resend SDK: API errors arrive as Resend-style errors", async () => {
  const { data, error } = await resend.emails.send({ from: FROM, to: "delivered@test.delivrie.io", subject: "No body" });
  assert(data === null, "expected no data");
  assert(error?.name === "validation_error", `got ${JSON.stringify(error)}`);
});

// ---------------------------------------------------------------- summary
const lines = results.map(([s, n, m]) => `| ${s === "ok" ? "✅" : "❌"} | ${n} |${m ? ` ${m.replace(/\|/g, "\\|").slice(0, 200)}` : ""}`);
if (process.env.GITHUB_STEP_SUMMARY) {
  const { appendFileSync } = await import("node:fs");
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### Live API test (${results.length - failed}/${results.length} passed)\n\n| | Check | |\n| --- | --- | --- |\n${lines.map((l) => l.endsWith("|") ? l : l + " |").join("\n")}\n`);
}
console.log(`\n${results.length - failed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
