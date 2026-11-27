// The Delivrie CLI. `run(argv, io)` returns an exit code; io carries stdout/stderr/stdin/env/fetch so tests can drive it.
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { parseArgs, UsageError } from "./args.js";
import { createClient, ApiError } from "./api.js";
import { readConfig, writeConfig, clearConfig, configPath } from "./config.js";
import { makeOut, when, list } from "./format.js";
import { VERSION } from "./version.js";

const DEFAULT_BASE = "https://delivrie.io/api";
const BOOLEANS = ["json", "yes", "help", "version", "sending", "received", "quiet"];
const REPEATABLE = ["to", "cc", "bcc", "reply-to", "attach", "tag", "header", "var", "events"];
const ALIASES = { h: "help", v: "version", y: "yes", q: "quiet", f: "from", t: "to", s: "subject", n: "limit" };

const HELP = {
  main: `Delivrie CLI ${VERSION}

Usage: delivrie <command> [options]

Account
  login                 Save an API key (or set DELIVRIE_API_KEY)
  logout                Forget the saved key
  whoami                Show which key and account the CLI is using
  usage                 Plan, emails sent this month and today

Sending
  send                  Send an email (see delivrie send --help)
  emails list|get|cancel|reschedule

Setup
  domains list|add|get|verify|delete
  keys list|create|delete
  webhooks list|create|test|deliveries
  templates list|get|publish

Audience and logs
  contacts list|add|get|delete
  suppressions list|add|remove
  logs list|get

Options for every command
  --json                Print the raw JSON response
  --api-key <key>       Use this key instead of the saved one
  --base-url <url>      API address (default ${DEFAULT_BASE})
  -h, --help            Help for a command
  -v, --version         Print the version

Docs: https://delivrie.io/docs/cli`,
  login: `Usage: delivrie login [--api-key <key>]

Saves an API key to ${"~/.config/delivrie/config.json"} (readable only by you). Without --api-key it asks for it.
Create a key at https://delivrie.io/api-keys. In CI, set DELIVRIE_API_KEY instead of logging in.`,
  send: `Usage: delivrie send --from <sender> --to <address> --subject <text> (--html <html> | --text <text> | --template <id>)

  -f, --from <sender>        "Acme <hi@acme.com>" on a verified domain
  -t, --to <address>         Repeat or comma-separate for several (up to 50)
      --cc, --bcc <address>  Repeatable
      --reply-to <address>   Repeatable
  -s, --subject <text>
      --html <html>          HTML body
      --html-file <path>     HTML body from a file ("-" reads stdin)
      --text <text>          Plain-text body (made from the HTML when left out)
      --text-file <path>     Plain-text body from a file ("-" reads stdin)
      --template <id|alias>  Send a published template
      --var key=value        Template variable, repeatable
      --attach <path>        Attach a file, repeatable
      --tag name=value       Repeatable
      --header Name:value    Custom header, repeatable
      --schedule <when>      ISO time or "in 1 hour", "tomorrow at 9am" (UTC)
      --idempotency-key <k>  Retrying with the same key never sends twice (one is made for you if left out)

Examples
  delivrie send -f "Acme <hi@acme.com>" -t ada@example.com -s "Hello" --text "It works"
  cat welcome.html | delivrie send -f hi@acme.com -t ada@example.com -s Welcome --html-file -
  delivrie send -t ada@example.com --template welcome --var name=Ada`,
  emails: `Usage:
  delivrie emails list [--limit 20] [--offset 0] [--received]
  delivrie emails get <id>
  delivrie emails cancel <id>                  Cancel a scheduled email
  delivrie emails reschedule <id> --at <when>  Move a scheduled email`,
  domains: `Usage:
  delivrie domains list
  delivrie domains add <name> [--region eu-west-1] [--return-path send]
  delivrie domains get <id|name>               Shows the DNS records to add
  delivrie domains verify <id|name>            Check DNS now
  delivrie domains delete <id|name> [--yes]`,
  keys: `Usage:
  delivrie keys list
  delivrie keys create <name> [--sending] [--domain <id|name>]   The key is shown once
  delivrie keys delete <id> [--yes]`,
  webhooks: `Usage:
  delivrie webhooks list
  delivrie webhooks create <https-url> --events email.delivered,email.bounced   ("*" for all)
  delivrie webhooks test <id>
  delivrie webhooks deliveries <id>`,
  templates: `Usage:
  delivrie templates list
  delivrie templates get <id|alias>
  delivrie templates publish <id|alias>`,
  contacts: `Usage:
  delivrie contacts list [--limit 50] [--offset 0]
  delivrie contacts add <email> [--first-name Ada] [--last-name Lovelace]
  delivrie contacts get <id|email>
  delivrie contacts delete <id|email> [--yes]`,
  suppressions: `Usage:
  delivrie suppressions list
  delivrie suppressions add <email> [<email>...]
  delivrie suppressions remove <email>`,
  logs: `Usage:
  delivrie logs list [--limit 20] [--offset 0]
  delivrie logs get <id>`,
};

export async function run(argv, io = {}) {
  const stdout = io.stdout || process.stdout, stderr = io.stderr || process.stderr, env = io.env || process.env;
  const out = makeOut(stdout, env), err = makeOut(stderr, env);
  const print = (s = "") => stdout.write(s + "\n");
  const fail = (msg, code = 1) => { stderr.write(err.red("Error: ") + msg + "\n"); return code; };

  let flags, pos;
  try { ({ flags, positionals: pos } = parseArgs(argv, { booleans: BOOLEANS, repeatable: REPEATABLE, aliases: ALIASES })); }
  catch (e) { return fail(e.message, 2); }
  const [cmd, sub, ...rest] = pos;
  if (flags.version) { print(VERSION); return 0; }
  if (!cmd || cmd === "help") { print(HELP[sub] || HELP.main); return 0; }
  if (flags.help) { print(HELP[cmd] || HELP.main); return 0; }

  const cfg = readConfig(env);
  const baseUrl = flags["base-url"] || env.DELIVRIE_BASE_URL || cfg.base_url || DEFAULT_BASE;
  const keyFrom = flags["api-key"] ? "--api-key" : env.DELIVRIE_API_KEY ? "DELIVRIE_API_KEY" : cfg.api_key ? configPath(env) : null;
  const key = flags["api-key"] || env.DELIVRIE_API_KEY || cfg.api_key;
  const client = (k = key) => createClient({ key: k, baseUrl, fetchImpl: io.fetch || globalThis.fetch });
  const need = () => { if (!key) throw new UsageError("No API key. Run `delivrie login`, or set DELIVRIE_API_KEY. Create one at https://delivrie.io/api-keys"); return client(); };
  const json = (v) => print(JSON.stringify(v, null, 2));
  const show = (v, human) => (flags.json ? json(v) : human(v));
  const listOf = (r) => (Array.isArray(r?.data) ? r.data : Array.isArray(r) ? r : []);
  const empty = (what) => print(out.dim(`No ${what} yet.`));
  const confirm = async (q) => {
    if (flags.yes) return true;
    const stdin = io.stdin || process.stdin;
    if (!stdin.isTTY) throw new UsageError(`${q} Add --yes to confirm.`);
    stderr.write(`${q} [y/N] `);
    const ans = await readLine(stdin);
    return /^y(es)?$/i.test(ans.trim());
  };
  const resolveDomain = async (api, ref) => {
    if (!ref) throw new UsageError("Give a domain id or name");
    if (!ref.includes(".")) return ref;
    const d = listOf(await api.request("GET", "/domains")).find((x) => x.name === ref.toLowerCase());
    if (!d) throw new ApiError(404, "not_found", `No domain named ${ref} on this account`);
    return d.id;
  };

  try {
    switch (cmd) {
      // ------------------------------------------------------------ account
      case "login": {
        let k = flags["api-key"];
        if (!k) {
          const stdin = io.stdin || process.stdin;
          if (!stdin.isTTY) k = (await readAll(stdin)).trim();
          else { stderr.write("API key (from https://delivrie.io/api-keys): "); k = (await readLine(stdin, { hidden: true })).trim(); stderr.write("\n"); }
        }
        if (!/^dlv_[A-Za-z0-9_-]{8,}$/.test(k || "")) return fail("That doesn't look like a Delivrie API key (they start with dlv_).");
        const who = await checkKey(client(k));
        if (who.permission === "invalid") return fail("Delivrie didn't accept that key. Check it, or create a new one at https://delivrie.io/api-keys");
        const file = writeConfig({ ...cfg, api_key: k, ...(flags["base-url"] ? { base_url: flags["base-url"] } : {}) }, env);
        if (flags.json) return json({ saved: file, permission: who.permission }), 0;
        print(out.green("✓") + ` Logged in with a ${who.permission === "sending" ? "sending-only" : "full-access"} key. Saved to ${file}`);
        if (who.permission === "sending") print(out.dim("  Sending-only keys can send email but can't list or change domains, keys or webhooks."));
        return 0;
      }
      case "logout": {
        const had = clearConfig(env);
        print(had ? "Logged out. The saved key was removed." : "No saved key to remove.");
        if (env.DELIVRIE_API_KEY) print(out.dim("DELIVRIE_API_KEY is still set in this shell."));
        return 0;
      }
      case "whoami": {
        if (!key) return fail("Not logged in. Run `delivrie login`, or set DELIVRIE_API_KEY.");
        const who = await checkKey(client());
        if (flags.json) return json({ key_prefix: key.slice(0, 10), source: keyFrom, base_url: baseUrl, ...who }), 0;
        if (who.permission === "invalid") return fail("The key in use was rejected. Run `delivrie login` with a new one.");
        print(`${out.bold("Key")}       ${key.slice(0, 10)}… (${who.permission === "sending" ? "sending only" : "full access"})`);
        print(`${out.bold("From")}      ${keyFrom}`);
        print(`${out.bold("API")}       ${baseUrl}`);
        if (who.usage) print(`${out.bold("Plan")}      ${who.usage.plan} · ${fmtUsage(who.usage)}`);
        return 0;
      }
      case "usage": {
        const u = await need().request("GET", "/usage");
        return show(u, () => {
          print(`${out.bold("Plan")}         ${u.plan}${u.marketing_plan && u.marketing_plan !== "free" ? ` (marketing: ${u.marketing_plan})` : ""}`);
          print(`${out.bold("This month")}   ${fmtUsage(u)}`);
          print(`${out.bold("Today")}        ${num(u.emails_today)}${u.daily_limit ? ` of ${num(u.daily_limit)}` : ""}`);
          if (u.credits_emails) print(`${out.bold("Credits")}      ${num(u.credits_emails)} emails`);
        }), 0;
      }

      // ------------------------------------------------------------ sending
      case "send": {
        const api = need();
        const stdin = io.stdin || process.stdin;
        const read = async (p) => (p === "-" ? readAll(stdin) : fs.readFileSync(p, "utf8"));
        const splitList = (v) => (v || []).flatMap((x) => String(x).split(",")).map((x) => x.trim()).filter(Boolean);
        const to = splitList(flags.to).concat(sub && sub.includes("@") ? [sub] : []);
        if (!to.length) throw new UsageError("Add at least one --to address");
        const body = { to };
        if (flags.from) body.from = flags.from;
        if (flags.subject) body.subject = flags.subject;
        if (flags.html !== undefined) body.html = flags.html;
        if (flags["html-file"]) body.html = await read(flags["html-file"]);
        if (flags.text !== undefined) body.text = flags.text;
        if (flags["text-file"]) body.text = await read(flags["text-file"]);
        if (flags.cc) body.cc = splitList(flags.cc);
        if (flags.bcc) body.bcc = splitList(flags.bcc);
        if (flags["reply-to"]) body.reply_to = splitList(flags["reply-to"]);
        if (flags.template) body.template = { id: flags.template, ...(flags.var ? { variables: pairs(flags.var, "=", "--var") } : {}) };
        if (flags.tag) body.tags = Object.entries(pairs(flags.tag, "=", "--tag")).map(([name, value]) => ({ name, value }));
        if (flags.header) body.headers = pairs(flags.header, ":", "--header");
        if (flags.schedule) body.scheduled_at = flags.schedule;
        if (flags.attach) body.attachments = flags.attach.map((p) => ({ filename: path.basename(p), content: fs.readFileSync(p).toString("base64") }));
        if (!body.template && body.html === undefined && body.text === undefined) throw new UsageError("Add a body: --html, --html-file, --text, --text-file or --template");
        if (!body.template && !body.subject) throw new UsageError("Add a --subject");
        const r = await api.request("POST", "/emails", body, { idempotencyKey: flags["idempotency-key"] || randomUUID() });
        if (flags.json) return json(r), 0;
        if (flags.quiet) return print(r.id), 0;
        print(out.green("✓") + ` ${body.scheduled_at ? "Scheduled" : "Sent"} ${out.bold(r.id)} to ${to.join(", ")}`);
        print(out.dim(`  Track it: delivrie emails get ${r.id}`));
        return 0;
      }
      case "emails": {
        const api = need();
        if (sub === "list" || !sub) {
          const r = await api.request("GET", flags.received ? "/emails/received" : "/emails", undefined, { query: { limit: flags.limit || 20, offset: flags.offset } });
          return show(r, () => {
            const rows = listOf(r);
            if (!rows.length) return empty(flags.received ? "received emails" : "emails");
            print(out.table(rows, [
              { label: "ID", get: (e) => e.id },
              { label: "STATUS", get: (e) => out.statusColor(e.last_event || e.status || (flags.received ? "received" : "")) },
              { label: flags.received ? "FROM" : "TO", get: (e) => trunc(flags.received ? e.from : list(e.to), 32) },
              { label: "SUBJECT", get: (e) => trunc(e.subject, 40) },
              { label: "WHEN", get: (e) => when(e.scheduled_at && /scheduled/.test(e.last_event || e.status) ? e.scheduled_at : e.created_at) },
            ]));
          }), 0;
        }
        const id = need1(rest[0], "email id");
        if (sub === "get") {
          const e = await api.request("GET", `/emails/${enc(id)}`);
          return show(e, () => {
            print(`${out.bold(e.subject || "(no subject)")}  ${out.statusColor(e.last_event)}`);
            print(`${out.dim("ID")}       ${e.id}`);
            print(`${out.dim("From")}     ${e.from}`);
            print(`${out.dim("To")}       ${list(e.to)}`);
            if (e.cc?.length) print(`${out.dim("Cc")}       ${list(e.cc)}`);
            print(`${out.dim("Created")}  ${when(e.created_at)}`);
            if (e.scheduled_at) print(`${out.dim("Sends")}    ${e.scheduled_at}`);
            if (e.error) print(`${out.dim("Error")}    ${out.red(e.error)}`);
            if (e.events?.length) { print(""); print(out.dim("Events")); for (const ev of e.events) print(`  ${when(ev.created_at).padEnd(17)} ${out.statusColor(ev.type.replace(/^email\./, ""))}`); }
          }), 0;
        }
        if (sub === "cancel") { const r = await api.request("POST", `/emails/${enc(id)}/cancel`); return show(r, () => print(out.green("✓") + ` Canceled ${id}`)), 0; }
        if (sub === "reschedule") {
          if (!flags.at) throw new UsageError("Add --at <when>, like --at \"in 2 hours\" or an ISO time");
          const r = await api.request("PATCH", `/emails/${enc(id)}`, { scheduled_at: flags.at });
          return show(r, () => print(out.green("✓") + ` ${id} now sends ${flags.at}`)), 0;
        }
        throw new UsageError(`Unknown: emails ${sub}. Try delivrie emails --help`);
      }

      // ------------------------------------------------------------ setup
      case "domains": {
        const api = need();
        if (sub === "list" || !sub) {
          const r = await api.request("GET", "/domains");
          return show(r, () => {
            const rows = listOf(r);
            if (!rows.length) return empty("domains") || print(out.dim("Add one: delivrie domains add example.com"));
            print(out.table(rows, [{ label: "ID", get: (d) => d.id }, { label: "NAME", get: (d) => d.name }, { label: "STATUS", get: (d) => out.statusColor(d.status) }, { label: "REGION", get: (d) => d.region_label || d.region }, { label: "ADDED", get: (d) => when(d.created_at) }]));
          }), 0;
        }
        if (sub === "add") {
          const name = need1(rest[0], "domain name");
          const d = await api.request("POST", "/domains", { name, ...(flags.region ? { region: flags.region } : {}), ...(flags["return-path"] ? { return_path: flags["return-path"] } : {}) });
          return show(d, () => { print(out.green("✓") + ` Added ${out.bold(d.name)} (${d.id}). Add these DNS records, then run: delivrie domains verify ${d.name}`); print(""); printRecords(d); }), 0;
        }
        const id = await resolveDomain(api, rest[0]);
        if (sub === "get") { const d = await api.request("GET", `/domains/${enc(id)}`); return show(d, () => { print(`${out.bold(d.name)}  ${out.statusColor(d.status)}  ${out.dim(d.id)}`); print(""); printRecords(d); }), 0; }
        if (sub === "verify") {
          const d = await api.request("POST", `/domains/${enc(id)}/verify`);
          return show(d, () => { print(`${out.bold(d.name)}: ${out.statusColor(d.status)}`); if (d.status !== "verified") { print(""); printRecords(d); print(""); print(out.dim("DNS changes can take a few minutes to show up. Run verify again later.")); } }), 0;
        }
        if (sub === "delete") {
          if (!(await confirm(`Delete ${rest[0]}? Emails can't be sent from it afterwards.`))) return print("Kept it."), 0;
          const r = await api.request("DELETE", `/domains/${enc(id)}`);
          return show(r, () => print(out.green("✓") + ` Deleted ${rest[0]}`)), 0;
        }
        throw new UsageError(`Unknown: domains ${sub}. Try delivrie domains --help`);
      }
      case "keys": {
        const api = need();
        if (sub === "list" || !sub) {
          const r = await api.request("GET", "/api-keys");
          return show(r, () => {
            const rows = listOf(r);
            if (!rows.length) return empty("API keys");
            print(out.table(rows, [{ label: "ID", get: (k) => k.id }, { label: "NAME", get: (k) => k.name }, { label: "KEY", get: (k) => (k.prefix || "") + "…" }, { label: "ACCESS", get: (k) => k.permission }, { label: "LAST USED", get: (k) => (k.last_used_at ? when(k.last_used_at) : out.dim("never")) }]));
          }), 0;
        }
        if (sub === "create") {
          const name = need1(rest[0], "key name");
          const body = { name, permission: flags.sending ? "sending_access" : "full_access" };
          if (flags.domain) body.domain_id = await resolveDomain(api, flags.domain);
          const r = await api.request("POST", "/api-keys", body);
          return show(r, () => { print(out.green("✓") + ` Created ${out.bold(name)} (${r.id}). Copy it now, it's only shown once:`); print(""); print("  " + out.bold(r.token)); print(""); }), 0;
        }
        if (sub === "delete") {
          const id = need1(rest[0], "key id");
          if (!(await confirm(`Delete key ${id}? Anything using it stops working.`))) return print("Kept it."), 0;
          const r = await api.request("DELETE", `/api-keys/${enc(id)}`);
          return show(r, () => print(out.green("✓") + ` Deleted ${id}`)), 0;
        }
        throw new UsageError(`Unknown: keys ${sub}. Try delivrie keys --help`);
      }
      case "webhooks": {
        const api = need();
        if (sub === "list" || !sub) {
          const r = await api.request("GET", "/webhooks");
          return show(r, () => {
            const rows = listOf(r);
            if (!rows.length) return empty("webhooks");
            print(out.table(rows, [{ label: "ID", get: (w) => w.id }, { label: "ENDPOINT", get: (w) => trunc(w.endpoint, 44) }, { label: "EVENTS", get: (w) => trunc(list(w.events), 40) }, { label: "STATUS", get: (w) => out.statusColor(w.status) }]));
          }), 0;
        }
        if (sub === "create") {
          const endpoint = need1(rest[0], "endpoint URL");
          const events = (flags.events || []).flatMap((e) => e.split(",")).map((e) => e.trim()).filter(Boolean);
          if (!events.length) throw new UsageError("Add --events, like --events email.delivered,email.bounced (or \"*\" for all)");
          const r = await api.request("POST", "/webhooks", { endpoint, events });
          return show(r, () => { print(out.green("✓") + ` Created ${r.id}. Its signing secret (shown once):`); print(""); print("  " + out.bold(r.signing_secret)); print(""); print(out.dim("  Verify requests with it: https://delivrie.io/docs/webhooks")); }), 0;
        }
        const id = need1(rest[0], "webhook id");
        if (sub === "test") { const r = await api.request("POST", `/webhooks/${enc(id)}/test`); return show(r, () => print(out.green("✓") + ` Sent a test event to ${id}${r?.status_code ? ` (endpoint answered ${r.status_code})` : ""}`)), 0; }
        if (sub === "deliveries") {
          const r = await api.request("GET", `/webhooks/${enc(id)}/events`);
          return show(r, () => {
            const rows = listOf(r);
            if (!rows.length) return empty("deliveries");
            print(out.table(rows, [{ label: "ID", get: (d) => d.id }, { label: "EVENT", get: (d) => d.event_type }, { label: "RESULT", get: (d) => (d.delivered ? out.green("delivered") : out.red("failing")) }, { label: "HTTP", get: (d) => d.status_code ?? "" }, { label: "TRIES", get: (d) => d.attempts }, { label: "WHEN", get: (d) => when(d.created_at) }]));
          }), 0;
        }
        throw new UsageError(`Unknown: webhooks ${sub}. Try delivrie webhooks --help`);
      }
      case "templates": {
        const api = need();
        if (sub === "list" || !sub) {
          const r = await api.request("GET", "/templates");
          return show(r, () => {
            const rows = listOf(r);
            if (!rows.length) return empty("templates");
            print(out.table(rows, [{ label: "ID", get: (t) => t.id }, { label: "NAME", get: (t) => trunc(t.name, 36) }, { label: "ALIAS", get: (t) => t.alias || "" }, { label: "STATUS", get: (t) => out.statusColor(t.status) }, { label: "UPDATED", get: (t) => when(t.updated_at) }]));
          }), 0;
        }
        const id = need1(rest[0], "template id or alias");
        if (sub === "get") { const t = await api.request("GET", `/templates/${enc(id)}`); return show(t, () => { print(`${out.bold(t.name)}  ${out.statusColor(t.status)}  ${out.dim(t.id)}`); if (t.alias) print(`${out.dim("Alias")}    ${t.alias}`); if (t.subject) print(`${out.dim("Subject")}  ${t.subject}`); if (t.from) print(`${out.dim("From")}     ${t.from}`); if (t.variables?.length) print(`${out.dim("Variables")} ${t.variables.map((v) => v.key).join(", ")}`); }), 0; }
        if (sub === "publish") { const t = await api.request("POST", `/templates/${enc(id)}/publish`); return show(t, () => print(out.green("✓") + ` Published ${t.name || id}`)), 0; }
        throw new UsageError(`Unknown: templates ${sub}. Try delivrie templates --help`);
      }

      // ------------------------------------------------------------ audience, logs
      case "contacts": {
        const api = need();
        if (sub === "list" || !sub) {
          const r = await api.request("GET", "/contacts", undefined, { query: { limit: flags.limit || 50, offset: flags.offset } });
          return show(r, () => {
            const rows = listOf(r);
            if (!rows.length) return empty("contacts");
            print(out.table(rows, [{ label: "EMAIL", get: (c) => c.email }, { label: "NAME", get: (c) => [c.first_name, c.last_name].filter(Boolean).join(" ") }, { label: "SUBSCRIBED", get: (c) => (c.unsubscribed ? out.red("no") : out.green("yes")) }, { label: "ADDED", get: (c) => when(c.created_at) }]));
          }), 0;
        }
        const ref = need1(rest[0], "contact email or id");
        if (sub === "add") { const r = await api.request("POST", "/contacts", { email: ref, ...(flags["first-name"] ? { first_name: flags["first-name"] } : {}), ...(flags["last-name"] ? { last_name: flags["last-name"] } : {}) }); return show(r, () => print(out.green("✓") + ` Added ${ref} (${r.id})`)), 0; }
        if (sub === "get") { const c = await api.request("GET", `/contacts/${enc(ref)}`); return show(c, () => { print(`${out.bold(c.email)}  ${c.unsubscribed ? out.red("unsubscribed") : out.green("subscribed")}`); const name = [c.first_name, c.last_name].filter(Boolean).join(" "); if (name) print(`${out.dim("Name")}     ${name}`); print(`${out.dim("ID")}       ${c.id}`); print(`${out.dim("Added")}    ${when(c.created_at)}`); for (const [k, v] of Object.entries(c.properties || {})) print(`${out.dim(k.padEnd(8))} ${v}`); }), 0; }
        if (sub === "delete") {
          if (!(await confirm(`Delete contact ${ref}?`))) return print("Kept it."), 0;
          const r = await api.request("DELETE", `/contacts/${enc(ref)}`);
          return show(r, () => print(out.green("✓") + ` Deleted ${ref}`)), 0;
        }
        throw new UsageError(`Unknown: contacts ${sub}. Try delivrie contacts --help`);
      }
      case "suppressions": {
        const api = need();
        if (sub === "list" || !sub) {
          const r = await api.request("GET", "/suppressions");
          return show(r, () => {
            const rows = listOf(r);
            if (!rows.length) return empty("suppressed addresses");
            print(out.table(rows, [{ label: "EMAIL", get: (s) => s.email }, { label: "REASON", get: (s) => s.reason }, { label: "SINCE", get: (s) => when(s.created_at) }]));
          }), 0;
        }
        if (sub === "add") {
          const emails = rest.flatMap((e) => e.split(",")).map((e) => e.trim()).filter(Boolean);
          if (!emails.length) throw new UsageError("Give one or more email addresses");
          const r = await api.request("POST", "/suppressions", emails.length === 1 ? { email: emails[0] } : { emails });
          return show(r, () => print(out.green("✓") + ` Suppressed ${emails.join(", ")}. Delivrie won't send to ${emails.length === 1 ? "it" : "them"}.`)), 0;
        }
        if (sub === "remove") { const e = need1(rest[0], "email address"); const r = await api.request("DELETE", `/suppressions/${enc(e)}`); return show(r, () => print(out.green("✓") + ` ${e} can receive email again`)), 0; }
        throw new UsageError(`Unknown: suppressions ${sub}. Try delivrie suppressions --help`);
      }
      case "logs": {
        const api = need();
        if (sub === "list" || !sub) {
          const r = await api.request("GET", "/logs", undefined, { query: { limit: flags.limit || 20, offset: flags.offset } });
          return show(r, () => {
            const rows = listOf(r);
            if (!rows.length) return empty("API requests");
            print(out.table(rows, [{ label: "ID", get: (l) => l.id }, { label: "REQUEST", get: (l) => `${l.method} ${l.endpoint}` }, { label: "STATUS", get: (l) => (l.status >= 400 ? out.red(l.status) : out.green(l.status)) }, { label: "CLIENT", get: (l) => trunc(l.user_agent, 24) }, { label: "WHEN", get: (l) => when(l.created_at) }]));
          }), 0;
        }
        if (sub === "get") { const l = await api.request("GET", `/logs/${enc(need1(rest[0], "log id"))}`); return json(l), 0; }
        throw new UsageError(`Unknown: logs ${sub}. Try delivrie logs --help`);
      }
      default:
        return fail(`Unknown command "${cmd}". Run delivrie --help to see them all.`, 2);
    }
  } catch (e) {
    if (e instanceof UsageError) return fail(e.message, 2);
    if (e instanceof ApiError) {
      if (flags.json) { stdout.write(JSON.stringify({ error: { statusCode: e.status, name: e.code, message: e.message } }, null, 2) + "\n"); return 1; }
      const hint = e.status === 401 ? " Run `delivrie login` with a valid key." : e.code === "restricted_api_key" ? " This needs a full-access key." : "";
      return fail(`${e.message}${hint}`);
    }
    if (e?.code === "ENOENT") return fail(`File not found: ${e.path}`);
    return fail(e?.message || String(e));
  }

  function printRecords(d) {
    const recs = d.records || [];
    if (!recs.length) return;
    print(out.table(recs, [{ label: "TYPE", get: (r) => r.type }, { label: "NAME", get: (r) => r.name }, { label: "VALUE", get: (r) => (r.priority != null ? `${r.priority} ` : "") + r.value }, { label: "STATUS", get: (r) => out.statusColor(r.status) }]));
  }
}

// A sending-only key gets 403 from /usage; a bad key gets 401.
async function checkKey(api) {
  try { const usage = await api.request("GET", "/usage"); return { permission: "full", usage }; }
  catch (e) {
    if (e instanceof ApiError && e.status === 403) return { permission: "sending" };
    if (e instanceof ApiError && e.status === 401) return { permission: "invalid" };
    throw e;
  }
}

const enc = encodeURIComponent;
const num = (n) => Number(n || 0).toLocaleString("en-US");
const trunc = (s, n) => { s = String(s ?? ""); return s.length > n ? s.slice(0, n - 1) + "…" : s; };
const fmtUsage = (u) => `${num(u.emails_this_month)}${u.monthly_allowance ? ` of ${num(u.monthly_allowance)}` : ""} emails this month`;
function need1(v, what) { if (!v) throw new UsageError(`Give the ${what}`); return v; }
function pairs(items, sep, flag) {
  const o = {};
  for (const it of items) { const i = it.indexOf(sep); if (i < 1) throw new UsageError(`${flag} expects name${sep}value, got "${it}"`); o[it.slice(0, i).trim()] = it.slice(i + 1).trim(); }
  return o;
}
function readAll(stream) {
  return new Promise((resolve, reject) => { let s = ""; stream.setEncoding?.("utf8"); stream.on("data", (c) => (s += c)); stream.on("end", () => resolve(s)); stream.on("error", reject); });
}
function readLine(stream, { hidden = false } = {}) {
  return new Promise((resolve) => {
    let s = "";
    const raw = hidden && typeof stream.setRawMode === "function";
    if (raw) stream.setRawMode(true);
    stream.resume(); stream.setEncoding?.("utf8");
    const onData = (chunk) => {
      for (const ch of String(chunk)) {
        if (ch === "\r" || ch === "\n") { done(); return; }
        if (ch === "\u0003") { done(); process.exit(130); }
        if (ch === "\u007f") s = s.slice(0, -1); else s += ch;
      }
    };
    const done = () => { stream.off("data", onData); if (raw) stream.setRawMode(false); stream.pause(); resolve(s); };
    stream.on("data", onData);
  });
}
