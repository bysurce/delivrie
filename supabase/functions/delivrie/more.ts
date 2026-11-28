// REST routes that close the gaps with Resend's API: duplicating broadcasts, automations and templates, updating
// broadcasts, templates and segments, broadcast recipients and clicked links, contact imports, attachment downloads,
// email share links and renaming API keys. Registered before the other route files so these paths win over
// broader patterns like /automations/:id/:action and /emails/:id.
import { type Any, APP_URL, bad, db, HttpError, notFound, waitUntil } from "./util.ts";
import { EMAIL_RE } from "./mime.ts";
import { emit } from "./send.ts";
import { attachmentLinks } from "./attachments.ts";

// deno-lint-ignore no-explicit-any
type Route = (method: string, path: string, h: (req: Request, c: Any, p: Record<string, string>, url: URL, body: Any) => Promise<any>) => void;
interface Deps {
  needFull: (c: Any) => void;
  upsertContacts: (c: Any, list: Any[], segmentIds?: string[]) => Promise<Any[]>;
  recipientsFor: (teamId: string, b: Any) => Promise<{ list: Any[]; total: number; topicOptOut: number }>;
}

const isUuid = (s: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
const clampLimit = (url: URL, d = 50, max = 100) => Math.min(Math.max(parseInt(url.searchParams.get("limit") || String(d)) || d, 1), max);
const offsetOf = (url: URL) => Math.max(parseInt(url.searchParams.get("offset") || "0") || 0, 0);
const copyName = (n: string, max = 120) => (`Copy of ${n || "Untitled"}`).slice(0, max);

export const broadcastPayload = (b: Any) => ({ id: b.id, name: b.name, status: b.status, from: b.from, subject: b.subject, segment_id: b.segment_id, topic_id: b.topic_id, scheduled_at: b.scheduled_at, sent_at: b.sent_at, recipients: b.recipients ?? null, created_at: b.created_at });

async function getBroadcast(teamId: string, id: string) {
  if (!isUuid(id)) throw notFound("Broadcast");
  const { data } = await db.from("broadcasts").select("*").eq("team_id", teamId).eq("id", id).maybeSingle();
  if (!data) throw notFound("Broadcast");
  return data;
}
async function getTemplate(teamId: string, id: string) {
  const q = db.from("templates").select("*").eq("team_id", teamId);
  const { data } = isUuid(id) ? await q.eq("id", id).maybeSingle() : await q.eq("alias", id).maybeSingle();
  if (!data) throw notFound("Template");
  return data;
}
async function getSegment(teamId: string, id: string) {
  if (!isUuid(id)) throw notFound("Segment");
  const { data } = await db.from("segments").select("*").eq("team_id", teamId).eq("id", id).maybeSingle();
  if (!data) throw notFound("Segment");
  return data;
}
async function getEmail(teamId: string, id: string, direction?: "inbound" | "outbound") {
  if (!isUuid(id)) throw notFound("Email");
  let q = db.from("emails").select("id,direction,attachments,created_at").eq("team_id", teamId).eq("id", id);
  if (direction === "inbound") q = q.eq("direction", "inbound");
  if (direction === "outbound") q = q.neq("direction", "inbound");
  const { data } = await q.maybeSingle();
  if (!data) throw notFound("Email");
  return data;
}

// ---------------------------------------------------------------- CSV
/** Parses CSV (RFC 4180: quoted fields, "" escapes, CRLF or LF). Returns rows of strings. */
export function parseCsv(src: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], field = "", i = 0, quoted = false;
  const s = src.replace(/^﻿/, "");
  while (i < s.length) {
    const ch = s[i];
    if (quoted) {
      if (ch === '"') { if (s[i + 1] === '"') { field += '"'; i += 2; continue; } quoted = false; i++; continue; }
      field += ch; i++; continue;
    }
    if (ch === '"' && field === "") { quoted = true; i++; continue; }
    if (ch === ",") { row.push(field); field = ""; i++; continue; }
    if (ch === "\r") { i++; continue; }
    if (ch === "\n") { row.push(field); rows.push(row); row = []; field = ""; i++; continue; }
    field += ch; i++;
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((x) => x.trim() !== ""));
}

const HEADER_ALIASES: Record<string, string> = { email: "email", "e-mail": "email", email_address: "email", "email address": "email", first_name: "first_name", firstname: "first_name", "first name": "first_name", first: "first_name", last_name: "last_name", lastname: "last_name", "last name": "last_name", last: "last_name", surname: "last_name", unsubscribed: "unsubscribed" };

/** Turns CSV text into contact objects. Columns other than email, names and unsubscribed become properties. */
export function csvToContacts(csv: string, map?: Record<string, string>) {
  const rows = parseCsv(csv);
  if (!rows.length) throw bad("The CSV is empty");
  const head = rows[0].map((h) => h.trim());
  const cols = head.map((h) => {
    if (map && h in map) return map[h] || null; // null/"" = skip the column
    return HEADER_ALIASES[h.toLowerCase()] || (h ? `property:${h.toLowerCase().replace(/[^a-z0-9_]+/g, "_").replace(/^_|_$/g, "").slice(0, 50)}` : null);
  });
  if (!cols.includes("email")) throw bad("The CSV needs an email column (a header named email, or map one with `columns`)");
  return rows.slice(1).map((r) => {
    const out: Any = { properties: {} };
    cols.forEach((col, i) => {
      const v = (r[i] ?? "").trim();
      if (!col || v === "") return;
      if (col.startsWith("property:")) { const k = col.slice(9); if (k) out.properties[k] = v; }
      else if (col === "unsubscribed") out.unsubscribed = /^(true|yes|1|y)$/i.test(v);
      else out[col] = v;
    });
    if (!Object.keys(out.properties).length) delete out.properties;
    return out;
  });
}

const IMPORT_MAX = 50_000;

async function runImport(c: Any, imp: Any, contacts: Any[], d: Deps) {
  const errors: Any[] = [];
  let created = 0, updated = 0, skipped = 0, processed = 0;
  try {
    await db.from("contact_imports").update({ status: "processing" }).eq("id", imp.id);
    // existing emails before we start, to count created vs updated
    const valid: Any[] = [];
    contacts.forEach((x, i) => {
      const email = String(x?.email || "").trim().toLowerCase();
      if (!EMAIL_RE.test(email)) { skipped++; if (errors.length < 100) errors.push({ row: i + 2, email: x?.email || null, message: "Invalid email address" }); return; }
      valid.push({ ...x, email });
    });
    processed = skipped;
    for (let i = 0; i < valid.length; i += 500) {
      let chunk = valid.slice(i, i + 500);
      const { data: have } = await db.from("contacts").select("email").eq("team_id", c.teamId).in("email", chunk.map((x) => x.email));
      const existing = new Set((have || []).map((x: Any) => x.email));
      if (!imp.update_existing) {
        const before = chunk.length;
        // still add existing contacts to the segments, without changing them
        const keep = chunk.filter((x) => existing.has(x.email)).map((x) => ({ email: x.email }));
        chunk = [...chunk.filter((x) => !existing.has(x.email)), ...keep];
        skipped += keep.length; void before;
      } else updated += chunk.filter((x) => existing.has(x.email)).length;
      try {
        await d.upsertContacts(c, chunk, imp.segment_ids || []);
        created += chunk.filter((x) => !existing.has(x.email)).length;
      } catch (e) {
        skipped += chunk.length;
        if (errors.length < 100) errors.push({ row: null, email: null, message: (e as Error).message.slice(0, 300) });
      }
      processed += chunk.length;
      await db.from("contact_imports").update({ processed, created, updated, skipped, errors }).eq("id", imp.id);
    }
    const { data: fin } = await db.from("contact_imports").update({ status: "completed", processed: contacts.length, created, updated, skipped, errors, completed_at: new Date().toISOString() }).eq("id", imp.id).select().single();
    await emit(c.teamId, "contact.import.completed", importOut(fin));
  } catch (e) {
    const { data: fin } = await db.from("contact_imports").update({ status: "failed", error: (e as Error).message.slice(0, 500), errors, completed_at: new Date().toISOString() }).eq("id", imp.id).select().single();
    await emit(c.teamId, "contact.import.completed", importOut(fin)).catch(() => {});
  }
}
const importOut = (r: Any) => r && ({ object: "contact_import", id: r.id, status: r.status, segment_ids: r.segment_ids, update_existing: r.update_existing, total: r.total, processed: r.processed, created: r.created, updated: r.updated, skipped: r.skipped, errors: r.errors, error: r.error, created_at: r.created_at, completed_at: r.completed_at });

export function registerMore(route: Route, d: Deps) {
  // ------------------------------------------------------------ broadcasts
  route("PATCH", "/broadcasts/:id", async (_r, c, p, _u, b) => {
    d.needFull(c);
    const bc = await getBroadcast(c.teamId, p.id);
    if (bc.status !== "draft") throw bad(`Only draft broadcasts can be edited. This one is ${bc.status}.`);
    const patch: Any = {};
    for (const k of ["name", "from", "reply_to", "subject", "preview_text", "segment_id", "topic_id"]) if (k in (b || {})) patch[k] = b[k] === "" ? null : b[k];
    if (b?.content) patch.content = b.content;
    else if (typeof b?.html === "string") patch.content = { blocks: [{ id: "h1", type: "html", html: b.html }] };
    else if (typeof b?.text === "string") patch.content = { blocks: [{ id: "t1", type: "text", html: String(b.text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/\n/g, "<br>") }] };
    if (patch.name !== undefined && !String(patch.name || "").trim()) throw bad("`name` can't be empty");
    for (const k of ["segment_id", "topic_id"]) if (patch[k] && !isUuid(String(patch[k]))) throw bad(`Invalid \`${k}\``);
    if (patch.segment_id) await getSegment(c.teamId, patch.segment_id);
    if (!Object.keys(patch).length) throw bad("Nothing to update. Pass name, from, reply_to, subject, preview_text, segment_id, topic_id, html, text or content.");
    const { data, error } = await db.from("broadcasts").update(patch).eq("id", bc.id).select().single();
    if (error) throw bad(error.message);
    await emit(c.teamId, "broadcast.updated", broadcastPayload(data));
    return { object: "broadcast", id: data.id };
  });
  route("POST", "/broadcasts/:id/duplicate", async (_r, c, p, _u, b) => {
    d.needFull(c);
    const bc = await getBroadcast(c.teamId, p.id);
    const { data, error } = await db.from("broadcasts").insert({ team_id: c.teamId, name: b?.name ? String(b.name).slice(0, 200) : copyName(bc.name, 200), from: bc.from, reply_to: bc.reply_to, segment_id: bc.segment_id, topic_id: bc.topic_id, subject: bc.subject, preview_text: bc.preview_text, content: bc.content, created_by: c.userId }).select().single();
    if (error) throw bad(error.message);
    await emit(c.teamId, "broadcast.created", broadcastPayload(data));
    return { object: "broadcast", id: data.id, name: data.name, status: data.status };
  });
  // Who a broadcast went to (once it's sending or sent), or who it will go to (a draft or scheduled one).
  route("GET", "/broadcasts/:id/recipients", async (_r, c, p, url) => {
    const bc = await getBroadcast(c.teamId, p.id);
    const limit = clampLimit(url), offset = offsetOf(url);
    if (["sending", "sent"].includes(bc.status)) {
      let q = db.from("emails").select("id,to,contact_id,status,sent_at,created_at", { count: "exact" }).eq("team_id", c.teamId).eq("broadcast_id", bc.id).order("created_at").range(offset, offset + limit - 1);
      const st = url.searchParams.get("status"); if (st) q = q.eq("status", st);
      const { data, count } = await q;
      const ids = (data || []).map((e: Any) => e.id);
      const { data: ev } = ids.length ? await db.from("email_events").select("email_id,type").in("email_id", ids).in("type", ["delivered", "opened", "clicked", "bounced", "complained", "unsubscribed"]) : { data: [] };
      const flags = new Map<string, Set<string>>();
      for (const e of ev || []) { if (!flags.has(e.email_id)) flags.set(e.email_id, new Set()); flags.get(e.email_id)!.add(e.type); }
      const rows = (data || []).map((e: Any) => { const f = flags.get(e.id) || new Set(); return { object: "broadcast_recipient", email_id: e.id, email: e.to?.[0], contact_id: e.contact_id, status: e.status, sent_at: e.sent_at, delivered: f.has("delivered"), opened: f.has("opened"), clicked: f.has("clicked"), bounced: f.has("bounced"), complained: f.has("complained"), unsubscribed: f.has("unsubscribed") }; });
      return { object: "list", data: rows, total: count ?? rows.length, has_more: offset + rows.length < (count ?? 0), recipients: bc.recipients ?? count ?? rows.length, topic_opt_out: 0 };
    }
    const r = await d.recipientsFor(c.teamId, bc);
    const rows = r.list.slice(offset, offset + limit).map((ct: Any) => ({ object: "broadcast_recipient", email: ct.email, contact_id: ct.id, status: "pending" }));
    // `total` (segment size), `topic_opt_out` and `recipients` (who it will reach) are kept for older clients.
    return { object: "list", data: rows, has_more: offset + rows.length < r.list.length, total: r.total, topic_opt_out: r.topicOptOut, recipients: r.list.length };
  });
  route("GET", "/broadcasts/:id/links", async (_r, c, p) => {
    d.needFull(c);
    const bc = await getBroadcast(c.teamId, p.id);
    const { data: ev } = await db.from("email_events").select("email_id,data,emails!inner(broadcast_id)").eq("team_id", c.teamId).eq("type", "clicked").eq("emails.broadcast_id", bc.id).limit(50000);
    const by = new Map<string, { clicks: number; people: Set<string> }>();
    for (const e of ev || []) {
      const link = String(e.data?.link || "");
      if (!link) continue;
      if (!by.has(link)) by.set(link, { clicks: 0, people: new Set() });
      const x = by.get(link)!; x.clicks++; x.people.add(e.email_id);
    }
    const data = [...by].map(([link, x]) => ({ object: "broadcast_link", link, clicks: x.clicks, unique_clicks: x.people.size })).sort((a, b) => b.clicks - a.clicks);
    return { object: "list", data, total_clicks: data.reduce((n, x) => n + x.clicks, 0) };
  });

  // ------------------------------------------------------------ automations
  route("POST", "/automations/:id/duplicate", async (_r, c, p, _u, b) => {
    d.needFull(c);
    if (!isUuid(p.id)) throw notFound("Automation");
    const { data: a } = await db.from("automations").select("*").eq("team_id", c.teamId).eq("id", p.id).maybeSingle();
    if (!a) throw notFound("Automation");
    const { data, error } = await db.from("automations").insert({ team_id: c.teamId, name: b?.name ? String(b.name).slice(0, 120) : copyName(a.name), status: "draft", trigger: a.trigger, steps: a.steps, start_step: a.start_step, reentry: a.reentry, created_by: c.userId }).select().single();
    if (error) throw bad(error.message);
    return { object: "automation", id: data.id, name: data.name, status: data.status, url: `${APP_URL}/automations/${data.id}` };
  });
  route("PATCH", "/automations/:id", async (_r, c, p, _u, b) => {
    d.needFull(c);
    if (!isUuid(p.id)) throw notFound("Automation");
    const { data: a } = await db.from("automations").select("id,status").eq("team_id", c.teamId).eq("id", p.id).maybeSingle();
    if (!a) throw notFound("Automation");
    const patch: Any = {};
    if (typeof b?.name === "string") { if (!b.name.trim()) throw bad("`name` can't be empty"); patch.name = b.name.trim().slice(0, 120); }
    if (b?.reentry !== undefined) { if (!["once", "always"].includes(b.reentry)) throw bad("`reentry` is once or always"); patch.reentry = b.reentry; }
    if (!Object.keys(patch).length) throw bad("Pass `name` or `reentry`. Change steps in the dashboard, or create a new automation.");
    await db.from("automations").update(patch).eq("id", a.id);
    return { object: "automation", id: a.id, ...patch };
  });
  route("DELETE", "/automations/:id", async (_r, c, p) => {
    d.needFull(c);
    if (!isUuid(p.id)) throw notFound("Automation");
    const { data } = await db.from("automations").delete().eq("team_id", c.teamId).eq("id", p.id).select("id");
    if (!data?.length) throw notFound("Automation");
    return { object: "automation", id: p.id, deleted: true };
  });

  // ------------------------------------------------------------ templates
  route("PATCH", "/templates/:id", async (_r, c, p, _u, b) => {
    d.needFull(c);
    const t = await getTemplate(c.teamId, p.id);
    const patch: Any = {};
    for (const k of ["name", "alias", "from", "reply_to", "subject", "variables"]) if (k in (b || {})) patch[k] = b[k] === "" ? null : b[k];
    if (b?.content) patch.content = b.content;
    else if (typeof b?.html === "string") patch.content = { blocks: [{ id: "h1", type: "html", html: b.html }] };
    if (patch.name !== undefined && !String(patch.name || "").trim()) throw bad("`name` can't be empty");
    if (patch.variables !== undefined && !Array.isArray(patch.variables)) throw bad("`variables` is a list of { name, type, fallback }");
    if (!Object.keys(patch).length) throw bad("Nothing to update");
    // Changes are a draft: emails keep using the published version until the template is published again.
    const { error } = await db.from("templates").update(patch).eq("id", t.id);
    if (error) throw bad(error.message.includes("duplicate") ? "A template with this alias already exists" : error.message);
    return { object: "template", id: t.id, status: t.status, note: t.status === "published" ? "Saved. Publish the template to use these changes when sending." : undefined };
  });
  route("POST", "/templates/:id/duplicate", async (_r, c, p, _u, b) => {
    d.needFull(c);
    const t = await getTemplate(c.teamId, p.id);
    const { data, error } = await db.from("templates").insert({ team_id: c.teamId, name: b?.name ? String(b.name) : copyName(t.name), alias: b?.alias || null, from: t.from, reply_to: t.reply_to, subject: t.subject, content: t.content, html: t.html, variables: t.variables || [], folder_id: t.folder_id ?? null, created_by: c.userId }).select("id,name").single();
    if (error) throw bad(error.message.includes("duplicate") ? "A template with this alias already exists" : error.message);
    return { object: "template", id: data.id, name: data.name };
  });
  route("DELETE", "/templates/:id", async (_r, c, p) => {
    d.needFull(c);
    const t = await getTemplate(c.teamId, p.id);
    await db.from("templates").delete().eq("id", t.id);
    return { object: "template", id: t.id, deleted: true };
  });

  // ------------------------------------------------------------ segments
  route("GET", "/segments/:id", async (_r, c, p) => {
    d.needFull(c);
    const s = await getSegment(c.teamId, p.id);
    const { count } = await db.from("segment_contacts").select("contact_id", { count: "exact", head: true }).eq("segment_id", s.id);
    return { object: "segment", ...s, contacts: count || 0 };
  });
  route("PATCH", "/segments/:id", async (_r, c, p, _u, b) => {
    d.needFull(c);
    const s = await getSegment(c.teamId, p.id);
    const name = String(b?.name || "").trim();
    if (!name) throw bad("Pass a new `name`");
    const { data } = await db.from("segments").update({ name: name.slice(0, 120) }).eq("id", s.id).select().single();
    return { object: "segment", id: data.id, name: data.name };
  });
  route("GET", "/segments/:id/contacts", async (_r, c, p, url) => {
    d.needFull(c);
    const s = await getSegment(c.teamId, p.id);
    const limit = clampLimit(url), offset = offsetOf(url);
    const { data, count } = await db.from("segment_contacts").select("contacts!inner(id,email,first_name,last_name,unsubscribed,properties,created_at)", { count: "exact" }).eq("segment_id", s.id).range(offset, offset + limit - 1);
    const rows = (data || []).map((r: Any) => ({ object: "contact", ...r.contacts }));
    return { object: "list", data: rows, total: count ?? rows.length, has_more: offset + rows.length < (count ?? 0) };
  });
  route("DELETE", "/segments/:id/contacts", async (_r, c, p, _u, b) => {
    d.needFull(c);
    const s = await getSegment(c.teamId, p.id);
    const items: string[] = (Array.isArray(b?.contacts) ? b.contacts : [b?.email || b?.id || b?.contact_id]).filter(Boolean).map((x: Any) => String(typeof x === "string" ? x : x.email || x.id).trim());
    if (!items.length) throw bad("Pass `contacts`: a list of emails or contact ids");
    const emails = items.filter((x) => x.includes("@")).map((x) => x.toLowerCase()), ids = items.filter((x) => isUuid(x));
    const found: Any[] = [];
    if (emails.length) found.push(...((await db.from("contacts").select("id").eq("team_id", c.teamId).in("email", emails)).data || []));
    if (ids.length) found.push(...((await db.from("contacts").select("id").eq("team_id", c.teamId).in("id", ids)).data || []));
    const cids = [...new Set(found.map((x) => x.id))];
    if (cids.length) await db.from("segment_contacts").delete().eq("segment_id", s.id).in("contact_id", cids);
    return { object: "segment", id: s.id, removed: cids.length };
  });
  route("DELETE", "/segments/:id/contacts/:contact", async (_r, c, p) => {
    d.needFull(c);
    const s = await getSegment(c.teamId, p.id);
    const key = decodeURIComponent(p.contact);
    const q = db.from("contacts").select("id").eq("team_id", c.teamId);
    const { data: ct } = key.includes("@") ? await q.eq("email", key.toLowerCase()).maybeSingle() : isUuid(key) ? await q.eq("id", key).maybeSingle() : { data: null };
    if (!ct) throw notFound("Contact");
    await db.from("segment_contacts").delete().eq("segment_id", s.id).eq("contact_id", ct.id);
    return { object: "segment", id: s.id, contact_id: ct.id, removed: true };
  });

  // ------------------------------------------------------------ contact imports
  route("POST", "/contacts/imports", async (_r, c, _p, _u, b) => {
    d.needFull(c);
    let contacts: Any[];
    if (typeof b?.csv === "string") contacts = csvToContacts(b.csv, b.columns && typeof b.columns === "object" ? b.columns : undefined);
    else if (Array.isArray(b?.contacts)) contacts = b.contacts.map((x: Any) => typeof x === "string" ? { email: x } : x);
    else throw bad("Pass `csv` (CSV text with an email column) or `contacts` (a list of { email, first_name, last_name, properties })");
    if (!contacts.length) throw bad("No contacts to import");
    if (contacts.length > IMPORT_MAX) throw bad(`One import takes up to ${IMPORT_MAX.toLocaleString("en-US")} contacts. Split the file.`);
    const segIds: string[] = [...new Set<string>((Array.isArray(b?.segment_ids) ? b.segment_ids : b?.segment_id ? [b.segment_id] : []).map(String))];
    for (const s of segIds) await getSegment(c.teamId, s);
    const { data: imp, error } = await db.from("contact_imports").insert({ team_id: c.teamId, segment_ids: segIds, update_existing: b?.update_existing !== false, total: contacts.length, created_by: c.userId }).select().single();
    if (error) throw bad(error.message);
    waitUntil(runImport(c, imp, contacts, d));
    return importOut(imp);
  });
  route("GET", "/contacts/imports", async (_r, c, _p, url) => {
    d.needFull(c);
    const { data } = await db.from("contact_imports").select("*").eq("team_id", c.teamId).order("created_at", { ascending: false }).limit(clampLimit(url, 20));
    return { object: "list", data: (data || []).map(importOut) };
  });
  route("GET", "/contacts/imports/:id", async (_r, c, p) => {
    d.needFull(c);
    if (!isUuid(p.id)) throw notFound("Import");
    const { data } = await db.from("contact_imports").select("*").eq("team_id", c.teamId).eq("id", p.id).maybeSingle();
    if (!data) throw notFound("Import");
    return importOut(data);
  });

  // ------------------------------------------------------------ attachments
  const listAtt = async (c: Any, id: string, dir?: "inbound" | "outbound") => {
    d.needFull(c);
    const e = await getEmail(c.teamId, id, dir);
    return { object: "list", data: await attachmentLinks(e) };
  };
  const oneAtt = async (c: Any, id: string, att: string, dir?: "inbound" | "outbound") => {
    d.needFull(c);
    const e = await getEmail(c.teamId, id, dir);
    const all = await attachmentLinks(e);
    const a = all.find((x) => x.id === att || x.filename === decodeURIComponent(att));
    if (!a) throw notFound("Attachment");
    return a;
  };
  route("GET", "/emails/received/:id/attachments", (_r, c, p) => listAtt(c, p.id, "inbound"));
  route("GET", "/emails/received/:id/attachments/:att", (_r, c, p) => oneAtt(c, p.id, p.att, "inbound"));
  route("GET", "/emails/:id/attachments", (_r, c, p) => listAtt(c, p.id));
  route("GET", "/emails/:id/attachments/:att", (_r, c, p) => oneAtt(c, p.id, p.att));

  // ------------------------------------------------------------ share links
  route("POST", "/emails/:id/share", async (_r, c, p, _u, b) => {
    d.needFull(c);
    if (!isUuid(p.id)) throw notFound("Email");
    const { data: e } = await db.from("emails").select("id").eq("team_id", c.teamId).eq("id", p.id).maybeSingle();
    if (!e) throw notFound("Email");
    const hours = b?.expires_in_hours === undefined ? 24 : Number(b.expires_in_hours);
    if (!Number.isFinite(hours) || hours < 1 || hours > 24 * 30) throw bad("`expires_in_hours` is between 1 and 720 (30 days)");
    const { data: s, error } = await db.from("email_shares").insert({ email_id: e.id, team_id: c.teamId, expires_at: new Date(Date.now() + hours * 3600e3).toISOString(), created_by: c.userId }).select().single();
    if (error) throw bad(error.message);
    return { object: "email_share", email_id: e.id, url: `${APP_URL}/share/${s.token}`, token: s.token, expires_at: s.expires_at };
  });
  route("DELETE", "/emails/:id/share", async (_r, c, p) => {
    d.needFull(c);
    if (!isUuid(p.id)) throw notFound("Email");
    const { data } = await db.from("email_shares").delete().eq("team_id", c.teamId).eq("email_id", p.id).select("token");
    return { object: "email_share", email_id: p.id, revoked: data?.length || 0 };
  });

  // ------------------------------------------------------------ webhooks (update and delete; Zapier, n8n and Make subscribe and unsubscribe with these)
  route("PATCH", "/webhooks/:id", async (_r, c, p, _u, b) => {
    d.needFull(c);
    if (!isUuid(p.id)) throw notFound("Webhook");
    const patch: Any = {};
    if (b?.endpoint !== undefined) { if (!/^https:\/\//.test(String(b.endpoint))) throw bad("endpoint must be an https:// URL"); patch.endpoint = String(b.endpoint); }
    if (b?.events !== undefined) { if (!Array.isArray(b.events) || !b.events.length) throw bad("Choose at least one event"); patch.events = b.events.map(String); }
    if (b?.status !== undefined) { if (!["enabled", "disabled"].includes(b.status)) throw bad("status is enabled or disabled"); patch.status = b.status; }
    if (!Object.keys(patch).length) throw bad("Pass endpoint, events or status");
    const { data } = await db.from("webhooks").update(patch).eq("team_id", c.teamId).eq("id", p.id).select("id,endpoint,events,status,created_at").maybeSingle();
    if (!data) throw notFound("Webhook");
    return { object: "webhook", ...data };
  });
  route("DELETE", "/webhooks/:id", async (_r, c, p) => {
    d.needFull(c);
    if (!isUuid(p.id)) throw notFound("Webhook");
    const { data } = await db.from("webhooks").delete().eq("team_id", c.teamId).eq("id", p.id).select("id");
    if (!data?.length) throw notFound("Webhook");
    return { object: "webhook", id: p.id, deleted: true };
  });

  // ------------------------------------------------------------ api keys
  route("PATCH", "/api-keys/:id", async (_r, c, p, _u, b) => {
    d.needFull(c);
    if (!isUuid(p.id)) throw notFound("API key");
    const name = String(b?.name || "").trim();
    if (!name || name.length > 100) throw bad("Pass a new `name` (1 to 100 characters)");
    const { data } = await db.from("api_keys").update({ name }).eq("team_id", c.teamId).eq("id", p.id).select("id,name,prefix,permission,domain_id,last_used_at,created_at").maybeSingle();
    if (!data) throw notFound("API key");
    return { object: "api_key", ...data };
  });
}

export { HttpError };
