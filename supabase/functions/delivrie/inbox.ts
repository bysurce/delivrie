// Inboxes for people and agents (REST + the hook for new mail): named inboxes on receiving domains, Gmail-style
// search, threads with spam and trash, assignment, internal notes, shared drafts, and the inbox agent (agent.ts).
import { type Any, bad, db, HttpError, notFound, waitUntil } from "./util.ts";
import { EMAIL_RE } from "./mime.ts";
import { emit } from "./send.ts";
import { agentConfig, AGENT_ACTIONS, AGENT_RUNS, AGENT_TONES, runAgent, textToHtml } from "./agent.ts";

// deno-lint-ignore no-explicit-any
type Route = (method: string, path: string, h: (req: Request, c: Any, p: Record<string, string>, url: URL, body: Any) => Promise<any>) => void;
interface Deps { needFull: (c: Any) => void; sendEmails: (c: Any, bodies: Any[], idem: string | null) => Promise<{ id: string }[]> }

const STATUSES = ["open", "archived", "spam", "trash"];
const MAX_INBOXES = 50;
const clampLimit = (url: URL, d = 20, max = 100) => Math.min(Math.max(parseInt(url.searchParams.get("limit") || String(d)) || d, 1), max);
const lower = (s: unknown) => String(s ?? "").trim().toLowerCase();
// Safe inside PostgREST or()/ilike filters: no separators, wildcards or brackets from the caller.
const term = (s: string) => s.replace(/[,%()*\\:"]/g, " ").replace(/\s+/g, " ").trim().slice(0, 100);
const isUuid = (s: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
const reSubject = (s: string) => /^re:/i.test(s) ? s : `Re: ${s}`;

// ------------------------------------------------------------------ search
/** Gmail-style search: words, "quoted phrases", from: to: subject: label: is: in: has: before: after:. */
export function parseQuery(q: string) {
  const out = { text: [] as string[], from: [] as string[], to: [] as string[], subject: [] as string[], label: [] as string[], is: new Set<string>(), in: null as string | null, has: new Set<string>(), before: null as string | null, after: null as string | null };
  const re = /(\w+):(?:"([^"]*)"|(\S+))|"([^"]*)"|(\S+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(String(q || "")))) {
    if (m[1]) {
      const k = m[1].toLowerCase(), v = (m[2] ?? m[3] ?? "").trim();
      if (!v) continue;
      if (k === "from" || k === "to" || k === "subject" || k === "label") out[k].push(v);
      else if (k === "is") out.is.add(v.toLowerCase().replace(/_/g, "-"));
      else if (k === "in") out.in = v.toLowerCase();
      else if (k === "has") out.has.add(v.toLowerCase().replace(/s$/, ""));
      else if ((k === "before" || k === "after") && !isNaN(Date.parse(v))) out[k] = new Date(v).toISOString();
      else out.text.push(`${m[1]}:${v}`);
    } else out.text.push(m[4] ?? m[5]);
  }
  return out;
}
const IN_STATUS: Record<string, string> = { inbox: "open", open: "open", archive: "archived", archived: "archived", spam: "spam", trash: "trash", anywhere: "all", all: "all" };

// ------------------------------------------------------------------ shapes
async function labelMap(teamId: string) {
  const { data } = await db.from("inbox_labels").select("id,name,color").eq("team_id", teamId).order("name");
  return { byId: new Map<string, string>((data || []).map((l: Any) => [l.id, l.name])), rows: (data || []) as Any[] };
}
async function people(ids: string[]) {
  const uniq = [...new Set(ids.filter(Boolean))];
  if (!uniq.length) return new Map<string, Any>();
  const { data } = await db.from("profiles").select("id,email,full_name").in("id", uniq);
  return new Map<string, Any>((data || []).map((p: Any) => [p.id, { id: p.id, email: p.email, name: p.full_name || p.email }]));
}
const needsReply = (t: Any) => t.status === "open" && !!t.last_inbound_at && (!t.last_outbound_at || t.last_inbound_at > t.last_outbound_at);
const threadOut = (t: Any, labels: Map<string, string>, who: Map<string, Any>) => ({
  object: "inbox_thread", id: t.id, inbox_id: t.inbox_id, mailbox: t.mailbox, contact: t.contact, contact_name: t.contact_name, subject: t.subject,
  snippet: t.snippet, message_count: t.message_count, unread: t.unread, status: t.status,
  labels: (t.labels || []).map((id: string) => labels.get(id)).filter(Boolean), assignee: t.assignee_id ? who.get(t.assignee_id) || { id: t.assignee_id } : null,
  last_at: t.last_at, needs_reply: needsReply(t), created_at: t.created_at,
});
const inboxOut = (i: Any, counts?: Any) => ({
  object: "inbox", id: i.id, name: i.name, address: i.address, description: i.description, domain_id: i.domain_id,
  agent: agentConfig({}, i.agent), created_at: i.created_at, updated_at: i.updated_at, ...(counts ? { counts } : {}),
});
const draftOut = (d: Any) => ({ object: "inbox_draft", id: d.id, thread_id: d.thread_id, inbox_id: d.inbox_id, from: d.from, to: d.to, cc: d.cc, bcc: d.bcc, subject: d.subject, text: d.text, html: d.html, source: d.source, note: d.note, status: d.status, sent_email_id: d.sent_email_id, created_at: d.created_at, updated_at: d.updated_at });

// ------------------------------------------------------------------ lookups
async function getThread(teamId: string, id: string) {
  if (!isUuid(id)) throw notFound("Thread");
  const { data: t } = await db.from("inbox_threads").select("*").eq("team_id", teamId).eq("id", id).maybeSingle();
  if (!t) throw notFound("Thread");
  return t;
}
/** An inbox by id or address. */
async function getInbox(teamId: string, ref: string) {
  const r = String(ref || "").trim();
  const { data } = await db.from("inboxes").select("*").eq("team_id", teamId).eq(isUuid(r) ? "id" : "address", isUuid(r) ? r : r.toLowerCase()).maybeSingle();
  if (!data) throw notFound("Inbox");
  return data;
}
/** A team member by "me", email or user id. */
async function member(c: Any, ref: unknown) {
  const r = lower(ref);
  if (r === "me") { if (!c.userId) throw bad("\"me\" needs a signed-in user. Pass a team member's email instead."); return c.userId; }
  const { data: mem } = await db.from("team_members").select("user_id").eq("team_id", c.teamId);
  const ids = (mem || []).map((m: Any) => m.user_id);
  if (isUuid(r) && ids.includes(r)) return r;
  const { data: profs } = ids.length ? await db.from("profiles").select("id,email").in("id", ids) : { data: [] };
  const hit = (profs || []).find((x: Any) => lower(x.email) === r);
  if (!hit) throw bad(`${ref} isn't on this team`);
  return hit.id;
}
/** The receiving domain an address belongs to; adds the address to an "only specific addresses" domain. */
async function receivingDomain(teamId: string, address: string) {
  const host = address.split("@")[1] || "";
  const { data: doms } = await db.from("domains").select("id,name,receiving_enabled,receiving_subdomain,receiving_mode,receiving_addresses").eq("team_id", teamId);
  const d = (doms || []).filter((x: Any) => host === x.name || host.endsWith("." + x.name)).sort((a: Any, b: Any) => b.name.length - a.name.length)[0];
  if (!d) throw bad(`Add ${host} as a domain and turn on receiving before creating an inbox on it`);
  if (!d.receiving_enabled) throw bad(`Turn on receiving for ${d.name} first (Domains → ${d.name} → Receiving)`);
  if (d.receiving_subdomain && host !== `${d.receiving_subdomain}.${d.name}`) throw bad(`Mail for ${d.name} arrives at ${d.receiving_subdomain}.${d.name}. Use an address there, like ${address.split("@")[0]}@${d.receiving_subdomain}.${d.name}`);
  if (d.receiving_mode === "specific" && !(d.receiving_addresses || []).includes(address)) {
    await db.from("domains").update({ receiving_addresses: [...(d.receiving_addresses || []), address] }).eq("id", d.id);
  }
  return d;
}

// ------------------------------------------------------------------ new mail (called from send.ts)
/** After a received email is stored: spam goes to Spam, webhooks fire, and the inbox's agent runs. */
export async function onInboundMail(e: Any, spam: boolean) {
  if (!e?.thread_id) return;
  const { data: t } = await db.from("inbox_threads").select("id,team_id,inbox_id,status,message_count").eq("id", e.thread_id).maybeSingle();
  if (!t) return;
  // A new conversation that the receiving server flagged as spam starts in Spam.
  if (spam && t.message_count <= 1 && t.status !== "spam") { await db.from("inbox_threads").update({ status: "spam" }).eq("id", t.id); t.status = "spam"; }
  await emit(t.team_id, "inbox.email.received", { email_id: e.id, thread_id: t.id, inbox_id: t.inbox_id, from: e.from, to: e.to, subject: e.subject, status: t.status, created_at: e.created_at });
  if (!t.inbox_id || t.status === "spam" || t.status === "trash") return;
  const { data: inbox } = await db.from("inboxes").select("agent").eq("id", t.inbox_id).maybeSingle();
  if (!inbox?.agent?.enabled) return;
  waitUntil(runAgent(t.team_id, t.id, { emailId: e.id }).catch((err) => console.error("inbox agent", t.id, err)));
}

export function registerInbox(route: Route, d: Deps) {
  // ------------------------------------------------------------ inboxes
  route("GET", "/inboxes", async (_r, c) => {
    d.needFull(c);
    const [{ data: rows }, { data: th }] = await Promise.all([
      db.from("inboxes").select("*").eq("team_id", c.teamId).order("name"),
      db.from("inbox_threads").select("inbox_id,status,unread,last_inbound_at,last_outbound_at").eq("team_id", c.teamId).in("status", ["open"]).limit(10000),
    ]);
    const counts = (id: string) => { const mine = (th || []).filter((t: Any) => t.inbox_id === id); return { open: mine.length, unread: mine.filter((t: Any) => t.unread).length, needs_reply: mine.filter(needsReply).length }; };
    return { object: "list", data: (rows || []).map((i: Any) => inboxOut(i, counts(i.id))) };
  });
  route("POST", "/inboxes", async (_r, c, _p, _u, b) => {
    d.needFull(c);
    const address = lower(b?.address);
    if (!EMAIL_RE.test(address)) throw bad("Give the inbox an address, like support@in.yourdomain.com");
    const { count } = await db.from("inboxes").select("id", { count: "exact", head: true }).eq("team_id", c.teamId);
    if ((count || 0) >= MAX_INBOXES) throw bad(`A team can have up to ${MAX_INBOXES} inboxes`);
    const dom = await receivingDomain(c.teamId, address);
    const name = String(b?.name || address.split("@")[0].replace(/[._-]+/g, " ").replace(/\b\w/g, (x) => x.toUpperCase())).trim().slice(0, 60);
    const { data: i, error } = await db.from("inboxes").insert({
      team_id: c.teamId, domain_id: dom.id, address, name: name || "Inbox", description: b?.description ? String(b.description).slice(0, 300) : null,
      agent: agentConfig(b?.agent || {}), created_by: c.userId,
    }).select().single();
    if (error) throw bad(/duplicate|unique/.test(error.message) ? `There's already an inbox for ${address}` : error.message);
    await emit(c.teamId, "inbox.created", { inbox_id: i.id, address: i.address, name: i.name });
    return inboxOut(i);
  });
  route("GET", "/inboxes/:id", async (_r, c, p) => { d.needFull(c); return inboxOut(await getInbox(c.teamId, decodeURIComponent(p.id))); });
  route("PATCH", "/inboxes/:id", async (_r, c, p, _u, b) => {
    d.needFull(c);
    const i = await getInbox(c.teamId, decodeURIComponent(p.id));
    const patch: Any = {};
    if (b?.name !== undefined) { const n = String(b.name || "").trim().slice(0, 60); if (!n) throw bad("name can't be empty"); patch.name = n; }
    if (b?.description !== undefined) patch.description = b.description ? String(b.description).slice(0, 300) : null;
    if (b?.agent !== undefined) patch.agent = agentConfig(b.agent, i.agent);
    if (!Object.keys(patch).length) throw bad("Nothing to change. Pass name, description or agent.");
    const { data: out } = await db.from("inboxes").update(patch).eq("id", i.id).select().single();
    await emit(c.teamId, "inbox.updated", { inbox_id: i.id, changes: Object.keys(patch) });
    return inboxOut(out);
  });
  route("DELETE", "/inboxes/:id", async (_r, c, p) => {
    d.needFull(c);
    const i = await getInbox(c.teamId, decodeURIComponent(p.id));
    await db.from("inboxes").delete().eq("id", i.id);
    await emit(c.teamId, "inbox.deleted", { inbox_id: i.id, address: i.address });
    return { object: "inbox", id: i.id, deleted: true, note: "Its conversations stay in the Inbox under Other mail." };
  });
  route("GET", "/inboxes/:id/agent-runs", async (_r, c, p, url) => {
    d.needFull(c);
    const i = await getInbox(c.teamId, decodeURIComponent(p.id));
    const { data } = await db.from("inbox_agent_runs").select("*").eq("inbox_id", i.id).order("created_at", { ascending: false }).limit(clampLimit(url));
    return { object: "list", data: data || [], limits: { actions: AGENT_ACTIONS, tones: AGENT_TONES, runs_per_month: AGENT_RUNS } };
  });

  // ------------------------------------------------------------ threads
  route("GET", "/inbox/threads", async (_r, c, _p, url) => {
    d.needFull(c);
    const sp = url.searchParams, Q = parseQuery(sp.get("q") || "");
    const { byId, rows: labelRows } = await labelMap(c.teamId);
    const limit = clampLimit(url);
    const post = Q.has.size > 0 || sp.get("needs_reply") === "true" || Q.is.has("needs-reply");
    let q = db.from("inbox_threads").select("*").eq("team_id", c.teamId).order("last_at", { ascending: false }).limit(post ? Math.min(limit * 5, 500) : limit);
    // folder: status param, then in:/is: in the query, else open mail
    const status = sp.get("status") || (Q.in ? IN_STATUS[Q.in] : null) || ["archived", "spam", "trash"].find((s) => Q.is.has(s)) || "open";
    if (status !== "all") { if (!STATUSES.includes(status)) throw bad("status must be open, archived, spam, trash or all"); q = q.eq("status", status); }
    const inboxRef = sp.get("inbox");
    if (inboxRef === "none") q = q.is("inbox_id", null);
    else if (inboxRef) q = q.eq("inbox_id", (await getInbox(c.teamId, inboxRef)).id);
    const mailbox = sp.get("mailbox"); if (mailbox) q = q.eq("mailbox", lower(mailbox));
    if (sp.get("unread") === "true" || Q.is.has("unread")) q = q.eq("unread", true);
    if (Q.is.has("read")) q = q.eq("unread", false);
    const assignee = sp.get("assignee");
    if (assignee === "none" || Q.is.has("unassigned")) q = q.is("assignee_id", null);
    else if (assignee) q = q.eq("assignee_id", await member(c, assignee));
    else if (Q.is.has("assigned")) q = q.not("assignee_id", "is", null);
    for (const name of [...(sp.get("label") ? [sp.get("label") as string] : []), ...Q.label]) {
      const l = labelRows.find((x: Any) => x.name.toLowerCase() === name.toLowerCase());
      if (!l) return { object: "list", data: [] };
      q = q.contains("labels", [l.id]);
    }
    for (const f of Q.from) { const s = term(f); if (s) q = q.or(`contact.ilike.%${s}%,contact_name.ilike.%${s}%`); }
    for (const f of Q.to) { const s = term(f); if (s) q = q.ilike("mailbox", `%${s}%`); }
    for (const f of Q.subject) { const s = term(f); if (s) q = q.ilike("subject", `%${s}%`); }
    if (Q.before) q = q.lt("last_at", Q.before);
    if (Q.after) q = q.gte("last_at", Q.after);
    for (const w of [...Q.text, ...(sp.get("search") ? [sp.get("search") as string] : [])]) { const s = term(w); if (s) q = q.or(`subject.ilike.%${s}%,contact.ilike.%${s}%,contact_name.ilike.%${s}%,snippet.ilike.%${s}%`); }
    const { data, error } = await q;
    if (error) throw bad(error.message);
    let list = data || [];
    if (sp.get("needs_reply") === "true" || Q.is.has("needs-reply")) list = list.filter(needsReply);
    if (list.length && Q.has.has("attachment")) {
      const { data: hits } = await db.from("emails").select("thread_id,attachments").in("thread_id", list.map((t: Any) => t.id)).limit(5000);
      const ids = new Set((hits || []).filter((h: Any) => (h.attachments || []).length).map((h: Any) => h.thread_id));
      list = list.filter((t: Any) => ids.has(t.id));
    }
    if (list.length && Q.has.has("draft")) {
      const { data: hits } = await db.from("inbox_drafts").select("thread_id").in("thread_id", list.map((t: Any) => t.id)).eq("status", "draft");
      const ids = new Set((hits || []).map((h: Any) => h.thread_id));
      list = list.filter((t: Any) => ids.has(t.id));
    }
    list = list.slice(0, limit);
    const who = await people(list.map((t: Any) => t.assignee_id));
    return { object: "list", data: list.map((t: Any) => threadOut(t, byId, who)) };
  });
  route("GET", "/inbox/threads/:id", async (_r, c, p) => {
    d.needFull(c);
    const t = await getThread(c.teamId, p.id);
    const [{ byId }, { data: msgs }, { data: notes }, { data: drafts }, { data: runs }] = await Promise.all([
      labelMap(c.teamId),
      db.from("emails").select("id,direction,from,to,cc,subject,text,html,status,created_at,headers,attachments").eq("thread_id", t.id).order("created_at").limit(100),
      db.from("inbox_notes").select("*").eq("thread_id", t.id).order("created_at"),
      db.from("inbox_drafts").select("*").eq("thread_id", t.id).eq("status", "draft").order("updated_at", { ascending: false }),
      db.from("inbox_agent_runs").select("id,status,actions,summary,error,created_at").eq("thread_id", t.id).order("created_at", { ascending: false }).limit(5),
    ]);
    const who = await people([t.assignee_id, ...(notes || []).map((n: Any) => n.author_id)]);
    const strip = (h: string) => h.replace(/<(script|style)[\s\S]*?<\/\1>/gi, "").replace(/<br\s*\/?>/gi, "\n").replace(/<\/p>/gi, "\n\n").replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").trim();
    return {
      ...threadOut(t, byId, who),
      messages: (msgs || []).map((m: Any) => ({ id: m.id, direction: m.direction, from: m.from, to: m.to, cc: m.cc, subject: m.subject, status: m.status, created_at: m.created_at, message_id: m.headers?.["message-id"] || null, text: (m.text || (m.html ? strip(m.html) : "")).slice(0, 20000), attachments: (m.attachments || []).map((a: Any) => a.filename) })),
      notes: (notes || []).map((n: Any) => ({ id: n.id, body: n.body, author: n.author_kind === "agent" ? { agent: true } : who.get(n.author_id) || null, created_at: n.created_at })),
      drafts: (drafts || []).map(draftOut),
      agent_runs: runs || [],
    };
  });
  route("POST", "/inbox/threads/:id/reply", async (_r, c, p, _u, b) => {
    const t = await getThread(c.teamId, p.id);
    const text = String(b?.text || "").trim();
    const html = b?.html ? String(b.html) : text ? textToHtml(text) : "";
    if (!text && !html) throw bad("Write a reply in `text` or `html`");
    const { data: last } = await db.from("emails").select("headers").eq("thread_id", t.id).eq("direction", "inbound").order("created_at", { ascending: false }).limit(1).maybeSingle();
    const mid = last?.headers?.["message-id"];
    const refs = [last?.headers?.references, mid].filter(Boolean).join(" ").trim();
    const [out] = await d.sendEmails(c, [{ from: b?.from || t.mailbox, to: [t.contact], cc: b?.cc || undefined, subject: reSubject(t.subject), text: text || undefined, html, headers: mid ? { "In-Reply-To": mid, References: refs } : {}, tags: [{ name: "source", value: "inbox" }] }], null);
    if (b?.draft_id && isUuid(String(b.draft_id))) await db.from("inbox_drafts").update({ status: "sent", sent_email_id: out.id }).eq("team_id", c.teamId).eq("id", b.draft_id);
    return { object: "email", id: out.id, thread_id: t.id };
  });
  route("PATCH", "/inbox/threads/:id", async (_r, c, p, _u, b) => {
    d.needFull(c);
    const t = await getThread(c.teamId, p.id);
    const patch: Any = {};
    if (b?.status) { if (!STATUSES.includes(b.status)) throw bad("status must be open, archived, spam or trash"); patch.status = b.status; }
    if (typeof b?.unread === "boolean") patch.unread = b.unread;
    if (b?.assignee !== undefined) patch.assignee_id = b.assignee === null || b.assignee === "" || b.assignee === "none" ? null : await member(c, b.assignee);
    if (Array.isArray(b?.labels)) {
      const { rows } = await labelMap(c.teamId);
      const ids: string[] = [];
      for (const name of b.labels.map((x: unknown) => String(x).trim()).filter(Boolean)) {
        let l = rows.find((x: Any) => x.name.toLowerCase() === name.toLowerCase());
        if (!l) { const { data } = await db.from("inbox_labels").insert({ team_id: c.teamId, name: name.slice(0, 40), color: "#a774f2" }).select("id,name").single(); l = data; if (l) rows.push(l); }
        if (l) ids.push(l.id);
      }
      patch.labels = ids;
    }
    if (!Object.keys(patch).length) throw bad("Nothing to change. Pass status, unread, assignee or labels.");
    await db.from("inbox_threads").update(patch).eq("id", t.id);
    await emit(c.teamId, "inbox.thread.updated", { thread_id: t.id, inbox_id: t.inbox_id, changes: { ...patch, ...(patch.labels ? { labels: b.labels } : {}) }, by: c.via === "dashboard" ? "member" : "api" });
    return { object: "inbox_thread", id: t.id, ...patch, labels: b?.labels };
  });
  route("GET", "/inbox/labels", async (_r, c) => { d.needFull(c); const { rows } = await labelMap(c.teamId); return { object: "list", data: rows }; });
  route("POST", "/inbox/threads/:id/agent", async (_r, c, p) => {
    d.needFull(c);
    const t = await getThread(c.teamId, p.id);
    const run = await runAgent(c.teamId, t.id, { manual: true });
    return { object: "inbox_agent_run", ...(run || { status: "skipped" }) };
  });

  // ------------------------------------------------------------ notes (internal, never emailed)
  route("GET", "/inbox/threads/:id/notes", async (_r, c, p) => {
    d.needFull(c);
    const t = await getThread(c.teamId, p.id);
    const { data } = await db.from("inbox_notes").select("*").eq("thread_id", t.id).order("created_at");
    const who = await people((data || []).map((n: Any) => n.author_id));
    return { object: "list", data: (data || []).map((n: Any) => ({ object: "inbox_note", id: n.id, body: n.body, author: n.author_kind === "agent" ? { agent: true } : who.get(n.author_id) || null, created_at: n.created_at })) };
  });
  route("POST", "/inbox/threads/:id/notes", async (_r, c, p, _u, b) => {
    d.needFull(c);
    const t = await getThread(c.teamId, p.id);
    const body = String(b?.body || "").trim();
    if (!body || body.length > 5000) throw bad("A note needs a body of 1 to 5,000 characters");
    const { data: n } = await db.from("inbox_notes").insert({ team_id: c.teamId, thread_id: t.id, author_id: c.userId, author_kind: "member", body }).select().single();
    return { object: "inbox_note", id: n.id, body: n.body, created_at: n.created_at };
  });
  route("DELETE", "/inbox/notes/:id", async (_r, c, p) => {
    d.needFull(c);
    if (!isUuid(p.id)) throw notFound("Note");
    const { data: n } = await db.from("inbox_notes").select("id,author_id,author_kind").eq("team_id", c.teamId).eq("id", p.id).maybeSingle();
    if (!n) throw notFound("Note");
    if (c.userId && n.author_kind === "member" && n.author_id !== c.userId) throw new HttpError(403, "forbidden", "You can only delete your own notes");
    await db.from("inbox_notes").delete().eq("id", n.id);
    return { object: "inbox_note", id: n.id, deleted: true };
  });

  // ------------------------------------------------------------ drafts (shared by the team; the agent writes them too)
  const getDraft = async (teamId: string, id: string) => {
    if (!isUuid(id)) throw notFound("Draft");
    const { data } = await db.from("inbox_drafts").select("*").eq("team_id", teamId).eq("id", id).maybeSingle();
    if (!data) throw notFound("Draft");
    return data;
  };
  const addrList = (v: unknown, field: string) => {
    const list = (Array.isArray(v) ? v : v ? [v] : []).map((a) => String(a).trim()).filter(Boolean);
    if (list.length > 50) throw bad(`${field} can have at most 50 addresses`);
    for (const a of list) if (!EMAIL_RE.test(a.replace(/^.*<([^>]+)>.*$/, "$1"))) throw bad(`Invalid ${field} address: ${a}`);
    return list;
  };
  route("GET", "/inbox/drafts", async (_r, c, _p, url) => {
    d.needFull(c);
    let q = db.from("inbox_drafts").select("*").eq("team_id", c.teamId).eq("status", url.searchParams.get("status") || "draft").order("updated_at", { ascending: false }).limit(clampLimit(url));
    const th = url.searchParams.get("thread_id"); if (th) q = q.eq("thread_id", th);
    const ib = url.searchParams.get("inbox"); if (ib) q = q.eq("inbox_id", (await getInbox(c.teamId, ib)).id);
    const src = url.searchParams.get("source"); if (src) q = q.eq("source", src);
    const { data } = await q;
    return { object: "list", data: (data || []).map(draftOut) };
  });
  route("POST", "/inbox/drafts", async (_r, c, _p, _u, b) => {
    d.needFull(c);
    const row: Any = { team_id: c.teamId, created_by: c.userId, source: "user" };
    if (b?.thread_id) {
      const t = await getThread(c.teamId, String(b.thread_id));
      Object.assign(row, { thread_id: t.id, inbox_id: t.inbox_id, from: t.mailbox, to: [t.contact], subject: reSubject(t.subject) });
    } else if (b?.inbox) {
      const i = await getInbox(c.teamId, String(b.inbox));
      Object.assign(row, { inbox_id: i.id, from: i.address });
    } else if (!b?.from) throw bad("Pass thread_id to reply in a conversation, or inbox (or from) to start a new email");
    if (b?.from) row.from = String(b.from);
    if (b?.to !== undefined) row.to = addrList(b.to, "to");
    if (b?.cc !== undefined) row.cc = addrList(b.cc, "cc");
    if (b?.bcc !== undefined) row.bcc = addrList(b.bcc, "bcc");
    if (b?.subject !== undefined) row.subject = String(b.subject).slice(0, 998);
    row.text = String(b?.text || "").slice(0, 100000);
    row.html = b?.html ? String(b.html).slice(0, 500000) : row.text ? textToHtml(row.text) : null;
    const { data: dr, error } = await db.from("inbox_drafts").insert(row).select().single();
    if (error) throw bad(error.message);
    await emit(c.teamId, "inbox.draft.created", { draft_id: dr.id, thread_id: dr.thread_id, inbox_id: dr.inbox_id, source: "user" });
    return draftOut(dr);
  });
  route("GET", "/inbox/drafts/:id", async (_r, c, p) => { d.needFull(c); return draftOut(await getDraft(c.teamId, p.id)); });
  route("PATCH", "/inbox/drafts/:id", async (_r, c, p, _u, b) => {
    d.needFull(c);
    const dr = await getDraft(c.teamId, p.id);
    if (dr.status !== "draft") throw bad(`This draft was already ${dr.status}`);
    const patch: Any = {};
    if (b?.to !== undefined) patch.to = addrList(b.to, "to");
    if (b?.cc !== undefined) patch.cc = addrList(b.cc, "cc");
    if (b?.bcc !== undefined) patch.bcc = addrList(b.bcc, "bcc");
    if (b?.subject !== undefined) patch.subject = String(b.subject).slice(0, 998);
    if (b?.from !== undefined) patch.from = String(b.from);
    if (b?.text !== undefined) { patch.text = String(b.text).slice(0, 100000); if (b?.html === undefined) patch.html = patch.text ? textToHtml(patch.text) : null; }
    if (b?.html !== undefined) patch.html = b.html ? String(b.html).slice(0, 500000) : null;
    if (!Object.keys(patch).length) throw bad("Nothing to change");
    const { data } = await db.from("inbox_drafts").update(patch).eq("id", dr.id).select().single();
    return draftOut(data);
  });
  route("DELETE", "/inbox/drafts/:id", async (_r, c, p) => {
    d.needFull(c);
    const dr = await getDraft(c.teamId, p.id);
    await db.from("inbox_drafts").update({ status: "discarded" }).eq("id", dr.id);
    return { object: "inbox_draft", id: dr.id, discarded: true };
  });
  route("POST", "/inbox/drafts/:id/send", async (_r, c, p) => {
    d.needFull(c);
    const dr = await getDraft(c.teamId, p.id);
    if (dr.status !== "draft") throw bad(`This draft was already ${dr.status}`);
    if (!dr.to?.length) throw bad("Add at least one recipient (to) before sending");
    if (!dr.text && !dr.html) throw bad("The draft is empty");
    let headers: Any = {};
    if (dr.thread_id) {
      const { data: last } = await db.from("emails").select("headers").eq("thread_id", dr.thread_id).eq("direction", "inbound").order("created_at", { ascending: false }).limit(1).maybeSingle();
      const mid = last?.headers?.["message-id"];
      if (mid) headers = { "In-Reply-To": mid, References: [last?.headers?.references, mid].filter(Boolean).join(" ").trim() };
    }
    const [out] = await d.sendEmails(c, [{ from: dr.from, to: dr.to, cc: dr.cc?.length ? dr.cc : undefined, bcc: dr.bcc?.length ? dr.bcc : undefined, subject: dr.subject || "(no subject)", text: dr.text || undefined, html: dr.html || undefined, headers, tags: [{ name: "source", value: dr.source === "agent" ? "inbox_agent_draft" : "inbox" }] }], `draft-${dr.id}`);
    await db.from("inbox_drafts").update({ status: "sent", sent_email_id: out.id }).eq("id", dr.id);
    return { object: "email", id: out.id, draft_id: dr.id, thread_id: dr.thread_id };
  });
}
