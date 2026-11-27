// Support chat (Figma 10.6). The assistant answers first, from the docs and the customer's own account. "Talk to a
// person" turns the conversation into a numbered ticket (#DLV-2041) with a topic and context attached (the email in
// question with its headers, the domain's DNS checks). The team replies from Admin → Support, resolves it, and the
// customer rates it. Replies left unread for 5 minutes go out by email (see supportCron).
import { type Any, APP_URL, bad, db, domainOf, forbidden, hmacUrl, json, LIMITS, notFound, setting, sha256, SYSTEM_FROM } from "./util.ts";
import { hasAws } from "./ses.ts";
import { deliver } from "./send.ts";
import { searchDocs } from "./docs.js";

// deno-lint-ignore no-explicit-any
type Route = (method: string, path: string, h: (req: Request, c: Any, p: Record<string, string>, url: URL, body: Any) => Promise<any>) => void;

const MAX = 5000;
const esc = (s: string) => String(s).replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch]!));
const preview = (s: string) => s.replace(/```[\s\S]*?```/g, "[code]").replace(/\s+/g, " ").trim().slice(0, 140);
const first = (s: string | null | undefined) => String(s || "").trim().split(/\s+/)[0] || "";
const initials = (s: string | null | undefined) => { const w = String(s || "").trim().split(/\s+/).filter(Boolean); return (w.length > 1 ? w[0][0] + w[1][0] : (w[0] || "D").slice(0, 2)).toUpperCase(); };
export const TOPICS: Record<string, string> = { deliverability: "Deliverability", domains: "Domains & DNS", billing: "Billing", api: "API & SDKs", other: "Something else" };
const ticket = (n: number | null) => (n ? `#DLV-${n}` : "");

const msgOut = (m: Any) => ({ id: m.id, author: m.author, author_name: m.author_name, body: m.body, created_at: m.created_at, meta: m.meta || {} });

function needDashboard(c: Any) { if (c.via !== "dashboard" || !c.userId) throw forbidden("Support chat is only available from the dashboard"); }
async function isAdmin(userId: string | null) {
  if (!userId) return false;
  // Support conversations are for owners and admins; usage viewers only see the admin dashboard's numbers.
  const { data } = await db.from("platform_admins").select("role").eq("user_id", userId).maybeSingle();
  return data?.role === "owner" || data?.role === "admin";
}
async function needAdmin(c: Any) { needDashboard(c); if (!(await isAdmin(c.userId))) throw forbidden("Platform admins only"); }
async function userEmail(id: string | null) {
  if (!id) return null;
  const { data } = await db.auth.admin.getUserById(id);
  return data?.user?.email || null;
}
async function profileName(id: string | null) {
  if (!id) return "";
  const { data } = await db.from("profiles").select("full_name").eq("id", id).maybeSingle();
  return data?.full_name || "";
}

// Notifications go out from the team that owns the system sender's domain, so they never appear in a customer's email log.
async function systemTeam(): Promise<string | null> {
  if (!SYSTEM_FROM) return null;
  const { data } = await db.from("domains").select("team_id").eq("name", domainOf(SYSTEM_FROM)).eq("status", "verified").limit(1);
  return data?.[0]?.team_id || null;
}
export async function notify(to: string[], subject: string, html: string, text: string) {
  if (!to.length || !SYSTEM_FROM || !hasAws()) return false;
  const team = await systemTeam();
  if (!team) return false;
  try {
    const { data: row } = await db.from("emails").insert({ team_id: team, from: SYSTEM_FROM, to, subject, html, text, tags: [{ name: "category", value: "support" }, { name: "system", value: "true" }] }).select("id").single();
    if (row) await deliver(row.id);
    return true;
  } catch (e) { console.error("support notify", e); return false; }
}
const wrap = (inner: string) => `<div style="font-family:Inter,Arial,sans-serif;font-size:15px;line-height:1.6;color:#1b1a1a;max-width:560px">${inner}<p style="color:#8a8f98;font-size:12px;margin-top:28px">Delivrie · 8 The Green, Suite R, Dover, DE 19901 · delivrie.io</p></div>`;
const quote = (s: string) => `<blockquote style="margin:0 0 12px;padding:10px 14px;border-left:3px solid #fad600;background:#f6f6f4;white-space:pre-wrap">${esc(s)}</blockquote>`;

// ------------------------------------------------------------ the team (avatars, "3 on shift now")
let teamCache: { at: number; people: { initials: string; name: string }[]; on_shift: number } | null = null;
async function supportTeam() {
  if (teamCache && Date.now() - teamCache.at < 10 * 60e3) return teamCache;
  const { data: admins } = await db.from("platform_admins").select("user_id").in("role", ["owner", "admin"]);
  const people: { initials: string; name: string }[] = [];
  let onShift = 0;
  for (const a of admins || []) {
    const [name, u] = await Promise.all([profileName(a.user_id), db.auth.admin.getUserById(a.user_id)]);
    const label = name || u.data?.user?.email || "";
    people.push({ initials: initials(name || label.split("@")[0]), name: first(name) || "Delivrie" });
    if (u.data?.user?.last_sign_in_at && Date.now() - new Date(u.data.user.last_sign_in_at).getTime() < 12 * 3600e3) onShift++;
  }
  teamCache = { at: Date.now(), people: people.slice(0, 3), on_shift: onShift };
  return teamCache;
}
async function teamPlan(teamId: string | null) {
  if (!teamId) return "free";
  const { data } = await db.from("teams").select("plan_transactional").eq("id", teamId).maybeSingle();
  return data?.plan_transactional || "free";
}
// What we promise, by plan (matches the pricing page: email support on every paid plan, priority on Scale).
function replyPromise(plan: string, guest = false) {
  if (guest) return { head: "A person will reply within 1 business day", sub: "Monday to Friday, UTC+1. The reply comes here and to your email, so you can close this." , guest: true };
  const name = plan.replace(/^\w/, (c) => c.toUpperCase());
  if (plan === "scale" || plan === "enterprise") return { head: "A person will reply within 1 business day", sub: `${name} plan · priority support, you’re at the front of the queue.` };
  return { head: "A person will reply within 1 business day", sub: `${name} plan · Monday to Friday, UTC+1.` };
}

// ------------------------------------------------------------ account context (for answers, suggestions, attachments)
const PROBLEM = ["bounced", "complained", "failed", "suppressed", "delivery_delayed"];
const STATUS_LABEL: Record<string, string> = { bounced: "Bounced", complained: "Complained", failed: "Failed", suppressed: "Suppressed", delivery_delayed: "Delayed", delivered: "Delivered", opened: "Opened", clicked: "Clicked", sent: "Sent", queued: "Queued", scheduled: "Scheduled" };
function domainChecks(d: Any) {
  const recs = (d.records || []) as Any[];
  const ok = (g: string) => recs.filter((r) => r.group === g).length > 0 && recs.filter((r) => r.group === g).every((r) => r.status === "verified");
  const dmarc = recs.find((r) => r.group === "dmarc");
  return { spf: ok("sending"), dkim: ok("dkim"), dmarc: dmarc?.status === "verified" };
}
const checksLine = (k: { spf: boolean; dkim: boolean; dmarc: boolean }) => `SPF ${k.spf ? "✓" : "missing"}  DKIM ${k.dkim ? "✓" : "missing"}  DMARC ${k.dmarc ? "✓" : "missing"}`;

async function accountContext(teamId: string | null) {
  if (!teamId) return { plan: "free", domains: [], findings: [] as Any[], problem: null as Any, stats: { sent: 0, bounced: 0, complained: 0 }, paused: null as string | null };
  const since = new Date(Date.now() - 7 * 86400e3).toISOString();
  const [{ data: team }, { data: domains }, { data: rb }, { count: complained }, { data: problem }] = await Promise.all([
    db.from("teams").select("plan_transactional,sending_paused_at,sending_paused_reason").eq("id", teamId).maybeSingle(),
    db.from("domains").select("id,name,status,records,created_at").eq("team_id", teamId).order("created_at"),
    db.rpc("team_recent_bounces", { p_team: teamId, p_n: 500 }),
    db.from("emails").select("id", { count: "exact", head: true }).eq("team_id", teamId).eq("status", "complained").gte("created_at", since),
    db.from("emails").select("id,subject,status,error,broadcast_id,created_at,domain_id").eq("team_id", teamId).eq("direction", "outbound").in("status", PROBLEM).gte("created_at", since).order("created_at", { ascending: false }).limit(1),
  ]);
  const sent = Number(rb?.[0]?.sent || 0), bounced = Number(rb?.[0]?.bounced || 0);
  const findings: Any[] = [];
  if (team?.sending_paused_at) findings.push({ topic: "deliverability", text: `Sending is paused on this account: ${team.sending_paused_reason || "see Settings"}.` });
  for (const d of domains || []) {
    const k = domainChecks(d);
    if (d.status !== "verified") findings.push({ topic: "domains", domain: d, text: `${d.name} is ${d.status === "pending" ? "still pending" : d.status}: ${!k.dkim ? "the DKIM records aren’t visible in DNS yet" : "waiting for Amazon SES to confirm"}.` });
    else if (!k.dmarc) findings.push({ topic: "deliverability", domain: d, text: `DMARC is missing on ${d.name}, so Gmail and Yahoo treat its mail as less trustworthy.` });
  }
  if (sent >= 50 && bounced / sent > 0.02) findings.push({ topic: "deliverability", text: `${(bounced / sent * 100).toFixed(1)}% of your last ${sent.toLocaleString()} emails hard-bounced. Mailbox providers start filtering above 2%.` });
  if ((complained || 0) > 0) findings.push({ topic: "deliverability", text: `${complained} recipient${complained === 1 ? "" : "s"} marked your email as spam in the last 7 days.` });
  let broadcast: Any = null;
  if (problem?.[0]?.broadcast_id) { const { data } = await db.from("broadcasts").select("id,name").eq("id", problem[0].broadcast_id).maybeSingle(); broadcast = data; }
  return { plan: team?.plan_transactional || "free", domains: domains || [], findings, problem: problem?.[0] ? { ...problem[0], broadcast } : null, stats: { sent, bounced, complained: complained || 0 }, paused: team?.sending_paused_reason || null };
}

// ------------------------------------------------------------ what the assistant knows besides the docs
// Plan prices, as on the pricing page (pricing.js, USD). Allowances and overage come from LIMITS, which enforces them.
const PLAN_PRICES: Record<string, { month: number; year: number }> = { starter: { month: 10, year: 100 }, pro: { month: 20, year: 200 }, scale: { month: 45, year: 450 } };
const n = (x: number) => x.toLocaleString("en-US");
const PRICING_KB = {
  id: "pricing", title: "Pricing", href: "/pricing",
  body: [
    `Free: $0, ${n(LIMITS.free.month)} emails a month (${n(LIMITS.free.day)} a day), ${LIMITS.free.domains} custom domain. No card needed.`,
    ...Object.entries(PLAN_PRICES).map(([id, p]) => `${id[0].toUpperCase() + id.slice(1)}: $${p.month} a month (or $${p.year} a year), ${n(LIMITS[id].month)} emails a month${LIMITS[id].day ? ` (${n(LIMITS[id].day)} a day)` : ", no daily limit"}, then $${(LIMITS[id].overage!.USD / 100).toFixed(2)} per extra 1,000 emails.`),
    "Every plan includes the API, SMTP relay and MCP server. Paid plans are billed in US dollars through Stripe, and you can change or cancel any time from Billing. Bigger volumes or special terms: Talk to a person.",
  ].join("\n"),
};
const PRICING_Q = /\b(price|pricing|cost|costs|cheap|plans?|tiers?|free|overage|how much|discount|nonprofit|upgrade|downgrade|invoice|billing|pay|paid|subscription|starter|scale|yearly|annual|monthly)\b/i;
// Words that appear everywhere in the docs and say nothing about what's being asked.
const NOISE = /\b(delivrie|please|hello|hi|hey|thanks?|thank you)\b/gi;

// ------------------------------------------------------------ the assistant
const TOPIC_WORDS: Record<string, RegExp> = {
  deliverability: /spam|junk|inbox|bounc|complain|deliver|gmail|outlook|yahoo|dmarc|reputation|block|reject|promotions/i,
  domains: /domain|dns|dkim|spf|dmarc|verif|pending|record|cname|txt|mx/i,
  billing: /bill|invoice|plan|price|pay|card|charge|refund|upgrade|subscription|credit/i,
  api: /api|sdk|key|webhook|endpoint|401|403|422|429|rate limit|smtp|mcp|node|python|curl/i,
};
const guessTopic = (q: string) => (Object.entries(TOPIC_WORDS).find(([, re]) => re.test(q))?.[0]) || "other";

async function answer(question: string, teamId: string | null, history: Any[], guest = false) {
  const ctx = await accountContext(teamId);
  const topic = guessTopic(question);
  const hits = searchDocs(question.replace(NOISE, " "), 3);
  const pricing = PRICING_Q.test(question);
  const relevant = ctx.findings.filter((f: Any) => f.topic === topic || (topic === "deliverability" && f.topic === "domains") || (topic === "domains" && f.domain));
  // Chips: the account objects the answer is about, then the docs it drew on.
  const sources: Any[] = [];
  const domainsInPlay = new Map<string, Any>();
  for (const f of relevant) if (f.domain) domainsInPlay.set(f.domain.id, f.domain);
  for (const d of ctx.domains) if (question.toLowerCase().includes(String(d.name).toLowerCase())) domainsInPlay.set(d.id, d);
  for (const d of [...domainsInPlay.values()].slice(0, 2)) sources.push({ kind: "domain", label: `Domains · ${d.name}`, href: `/domains/${d.id}` });
  if (topic === "deliverability" && ctx.problem) {
    if (ctx.problem.broadcast) sources.push({ kind: "broadcast", label: `Broadcast · ${ctx.problem.broadcast.name}`.slice(0, 40), href: `/broadcasts/${ctx.problem.broadcast.id}` });
    else sources.push({ kind: "email", label: `Email · ${STATUS_LABEL[ctx.problem.status] || ctx.problem.status}`, href: `/emails/${ctx.problem.id}` });
  }
  if (pricing) sources.push({ kind: "doc", label: "Pricing", href: PRICING_KB.href });
  for (const d of hits.slice(0, pricing ? 0 : 2)) sources.push({ kind: "doc", label: `Docs · ${d.title}`.slice(0, 40), href: `/docs#${d.id}` });

  const key = Deno.env.get("ANTHROPIC_API_KEY");
  if (key) {
    try {
      const account = guest ? "This visitor isn’t signed in, so there’s no account to look at. For account-specific problems, suggest signing in or \"Talk to a person\"." : [
        `Plan: ${ctx.plan}`,
        `Last 7 days: ${ctx.stats.sent} emails sent, ${ctx.stats.bounced} hard bounces, ${ctx.stats.complained} spam complaints.`,
        ...ctx.domains.map((d: Any) => `Domain ${d.name}: ${d.status}; ${checksLine(domainChecks(d))}`),
        ...ctx.findings.map((f: Any) => `Finding: ${f.text}`),
      ].join("\n");
      // Earlier turns of this conversation, merged so roles alternate and the first is the user's (the API needs that).
      const messages: { role: string; content: string }[] = [];
      for (const m of history.slice(-8)) {
        if (m.author !== "customer" && m.author !== "bot") continue;
        const role = m.author === "customer" ? "user" : "assistant";
        if (messages.length && messages[messages.length - 1].role === role) messages[messages.length - 1].content += `\n\n${m.body}`;
        else messages.push({ role, content: m.body });
      }
      while (messages.length && messages[0].role !== "user") messages.shift();
      if (messages.length && messages[messages.length - 1].role === "user") messages[messages.length - 1].content += `\n\n${question}`;
      else messages.push({ role: "user", content: question });
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST", headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
        body: JSON.stringify({
          model: Deno.env.get("ASK_MODEL") || "claude-haiku-5-5", max_tokens: 600,
          system: `You are the Delivrie assistant inside the Delivrie dashboard (an email API). Answer the customer's question in plain text, 2 to 6 short lines. Use numbered lines for separate points. Use facts from their account below when they're relevant, and say exactly what to do next. Only use the documentation and account facts provided; if they don't cover it, say so and suggest "Talk to a person". Never invent numbers, settings or features. No markdown headings, no bold.\n\nTheir account:\n${account}\n\nDocumentation:\n${pricing ? `## ${PRICING_KB.title}\n${PRICING_KB.body}\n\n` : ""}${hits.map((d: Any) => `## ${d.title}\n${String(d.body).slice(0, 3500)}`).join("\n\n")}`,
          messages,
        }),
      });
      const j = await res.json();
      const text = j?.content?.find?.((b: Any) => b.type === "text")?.text;
      if (text) return { body: String(text).trim(), meta: { sources, feedback: true, mode: "ai", topic } };
      if (j?.error) console.error("assistant", j.error);
    } catch (e) { console.error("assistant", e); }
  }
  // No AI available: account findings first, then the best matching paragraph of the docs (and only that doc as a source).
  const lines: string[] = [];
  let quoted: Any = null;
  if (relevant.length) {
    lines.push(relevant.length === 1 ? "One thing on your account stands out:" : `${relevant.length} things on your account stand out:`);
    relevant.slice(0, 3).forEach((f: Any, i: number) => lines.push(relevant.length === 1 ? f.text : `${i + 1}. ${f.text}`));
  }
  if (pricing) lines.push(PRICING_KB.body);
  else if (hits.length) {
    const terms = question.replace(NOISE, " ").toLowerCase().match(/[a-z0-9]{4,}/g) || [];
    const paras = String(hits[0].body).split(/\n+/).filter((p: string) => p && !p.startsWith("#") && !p.startsWith("```") && p.length > 40);
    const best = paras.map((p: string) => ({ p, s: terms.reduce((n: number, t: string) => n + (p.toLowerCase().includes(t) ? 1 : 0), 0) })).sort((a: Any, b: Any) => b.s - a.s)[0];
    // Only quote the docs when the paragraph is actually about the question.
    if (best && best.s > 0) { lines.push(`From the docs (${hits[0].title}): ${best.p.replace(/`/g, "")}`); quoted = hits[0]; }
  }
  if (!lines.length) lines.push(guest ? "I couldn’t find that in the docs. A person on the team can answer it: choose Talk to a person." : "I couldn’t find that in the docs or your account. A person on the team can take a look.");
  const used = sources.filter((x: Any) => x.kind !== "doc" || x.href === PRICING_KB.href || (quoted && x.href === `/docs#${quoted.id}`));
  return { body: lines.join("\n\n"), meta: { sources: used, feedback: true, mode: "search", topic } };
}

// ------------------------------------------------------------ attachments for a handoff
async function emailAttachment(teamId: string, emailId: string) {
  const { data: e } = await db.from("emails").select("id,from,to,subject,status,error,created_at,sent_at,ses_message_id,domain_id").eq("team_id", teamId).eq("id", emailId).maybeSingle();
  if (!e) return null;
  const [{ data: ev }, { data: dom }] = await Promise.all([
    db.from("email_events").select("type,data,created_at").eq("email_id", e.id).order("created_at", { ascending: false }).limit(3),
    e.domain_id ? db.from("domains").select("name,records").eq("id", e.domain_id).maybeSingle() : db.from("domains").select("name,records").eq("team_id", teamId).eq("name", domainOf(e.from)).maybeSingle(),
  ]);
  const k = dom ? domainChecks(dom) : null;
  const when = new Date(e.sent_at || e.created_at);
  const headers: [string, string][] = [
    ["From", e.from], ["To", (e.to || []).join(", ")], ["Subject", e.subject || "(no subject)"],
    ["Date", when.toUTCString().replace(/:\d\d GMT$/, " UTC")],
    ["Message-ID", e.ses_message_id ? `<${e.ses_message_id}@email.amazonses.com>` : `<${e.id}>`],
  ];
  if (k) headers.push(["Domain auth", `spf=${k.spf ? "pass" : "none"} dkim=${k.dkim ? "pass" : "none"} dmarc=${k.dmarc ? "pass" : "none"}`]);
  const last = (ev || []).find((x: Any) => ["bounced", "complained", "failed", "suppressed", "delivery_delayed"].includes(x.type));
  const detail = last?.data?.diagnostic || last?.data?.sub_type || last?.data?.reason || e.error || "";
  const extra = [`Status: ${STATUS_LABEL[e.status] || e.status}`, ...(detail ? [`Detail: ${String(detail).slice(0, 300)}`] : []), ...(ev || []).map((x: Any) => `Event: ${x.type} at ${x.created_at}${x.data && Object.keys(x.data).length ? " " + JSON.stringify(x.data).slice(0, 400) : ""}`)];
  return { type: "email", id: e.id, title: e.subject || "(no subject)", sub: `${e.id.slice(0, 8)} · ${STATUS_LABEL[e.status] || e.status}${detail ? ` · ${String(detail).slice(0, 40)}` : ""}`, headers, raw: [...headers.map(([a, b]) => `${a}: ${b}`), ...extra].join("\n"), more: extra.length };
}
async function domainAttachment(teamId: string, domainId: string) {
  const { data: d } = await db.from("domains").select("id,name,status,records").eq("team_id", teamId).eq("id", domainId).maybeSingle();
  if (!d) return null;
  return { type: "domain", id: d.id, title: d.name, sub: d.status === "verified" ? checksLine(domainChecks(d)) : `${d.status.replace(/_/g, " ")} · ${checksLine(domainChecks(d))}` };
}
async function proposeAttachments(teamId: string | null) {
  if (!teamId) return [];
  const ctx = await accountContext(teamId);
  const out: Any[] = [];
  let emailId = ctx.problem?.id;
  if (!emailId) { const { data } = await db.from("emails").select("id").eq("team_id", teamId).eq("direction", "outbound").order("created_at", { ascending: false }).limit(1); emailId = data?.[0]?.id; }
  const em = emailId ? await emailAttachment(teamId, emailId) : null;
  if (em) out.push(em);
  // The domain of that email, or the one with something wrong, or the first.
  const fromDomain = em ? ctx.domains.find((d: Any) => d.name === domainOf(em.headers[0][1])) : null;
  const flagged = ctx.findings.find((f: Any) => f.domain)?.domain;
  const dom = fromDomain || flagged || ctx.domains[0];
  if (dom) { const a = await domainAttachment(teamId, dom.id); if (a) out.push(a); }
  return out;
}

// ------------------------------------------------------------ who's asking
// A signed-in customer (dashboard, or the marketing site with a session) or a visitor who isn't signed in. Visitors
// are known by a random token their browser keeps (only its hash is stored); they get docs-only answers and leave
// an email address when they ask for a person.
type Who = { userId: string | null; teamId: string | null; email: string | null; tokenHash: string | null; ip: string | null; guest: boolean };
const whoFromCtx = (c: Any): Who => ({ userId: c.userId, teamId: c.teamId, email: c.email || null, tokenHash: null, ip: c.ip || null, guest: false });
const GUEST_TOPICS: Record<string, string> = { sales: "Sales & pricing", deliverability: "Deliverability", domains: "Domains & DNS", api: "API & SDKs", billing: "Billing", other: "Something else" };
const EMAIL_RE = /^[^\s@<>()",;:]+@[^\s@<>()",;:]+\.[a-z]{2,}$/i;
const topicsFor = (who: Who) => Object.entries(who.guest ? GUEST_TOPICS : TOPICS).map(([id, label]) => ({ id, label }));
const topicLabel = (id: string | null) => (id ? TOPICS[id] || GUEST_TOPICS[id] || id : null);

// ------------------------------------------------------------ threads
const mine = (q: Any, who: Who) => (who.userId ? q.eq("user_id", who.userId) : q.is("user_id", null).eq("guest_token_hash", who.tokenHash || "-"));
async function myThread(who: Who, id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw notFound("Conversation");
  const { data } = await mine(db.from("support_threads").select("*").eq("id", id), who).maybeSingle();
  if (!data) throw notFound("Conversation");
  return data;
}
async function messages(threadId: string) {
  const { data } = await db.from("support_messages").select("*").eq("thread_id", threadId).order("created_at").limit(500);
  return (data || []).map(msgOut);
}
async function addMessage(t: Any, author: string, body: string, extra: Any = {}) {
  const { data: m } = await db.from("support_messages").insert({ thread_id: t.id, author, body, user_id: extra.user_id || null, author_name: extra.author_name || null, meta: extra.meta || {} }).select().single();
  return m;
}
const threadOut = (t: Any) => ({
  id: t.id, number: t.number, ticket: ticket(t.number), status: t.status, subject: t.subject, topic: t.topic, topic_label: topicLabel(t.topic),
  assignee: t.assignee_name ? { name: first(t.assignee_name), initials: initials(t.assignee_name) } : null,
  resolved_by: t.resolved_by, rating: t.rating, rated_at: t.rated_at, last_message_at: t.last_message_at, last_author: t.last_author, preview: t.last_preview, unread: t.unread_customer || 0, email: t.email,
});
async function newThread(who: Who, subject: string, preview_: string) {
  const { data } = await db.from("support_threads").insert({ team_id: who.teamId, user_id: who.userId, email: who.email || (who.userId ? await userEmail(who.userId) : null), guest_token_hash: who.userId ? null : who.tokenHash, guest_ip: who.guest ? who.ip : null, status: "bot", subject: subject.slice(0, 80), last_message_at: new Date().toISOString(), last_author: "customer", last_preview: preview_ }).select().single();
  return data;
}
async function rateLimit(who: Who, kind: "message" | "thread" | "escalate" = "message") {
  const tooMany = () => bad("You’ve sent a lot of messages in a short time. Give us a moment to catch up.");
  const since = new Date(Date.now() - 10 * 60_000).toISOString();
  const { data: recent } = await mine(db.from("support_threads").select("id").gte("last_message_at", since), who);
  const ids = (recent || []).map((t: Any) => t.id);
  if (ids.length) {
    const { count } = await db.from("support_messages").select("id", { count: "exact", head: true }).in("thread_id", ids).eq("author", "customer").gte("created_at", since);
    if ((count || 0) >= (who.guest ? 15 : 30)) throw tooMany();
  }
  if (!who.guest || !who.ip) return;
  // Visitors: limits per network address too, since a token is free to make.
  const hour = new Date(Date.now() - 3600e3).toISOString(), day = new Date(Date.now() - 86400e3).toISOString();
  if (kind === "thread") { const { count } = await db.from("support_threads").select("id", { count: "exact", head: true }).eq("guest_ip", who.ip).gte("created_at", hour); if ((count || 0) >= 15) throw tooMany(); }
  if (kind === "escalate") { const { count } = await db.from("support_threads").select("id", { count: "exact", head: true }).eq("guest_ip", who.ip).gte("escalated_at", day); if ((count || 0) >= 5) throw bad("You’ve opened a few conversations today. Email support@delivrie.io and we’ll pick it up there."); }
  if (kind === "message") {
    const { data: byIp } = await db.from("support_threads").select("id").eq("guest_ip", who.ip).gte("last_message_at", hour).limit(50);
    const ipIds = (byIp || []).map((t: Any) => t.id);
    if (ipIds.length) { const { count } = await db.from("support_messages").select("id", { count: "exact", head: true }).in("thread_id", ipIds).eq("author", "customer").gte("created_at", hour); if ((count || 0) >= 40) throw tooMany(); }
  }
}
async function notifyAdmins(t: Any, who: string, teamName: string | null, body: string, attachments: Any[] = []) {
  const last = t.support_notified_at ? new Date(t.support_notified_at).getTime() : 0;
  if (Date.now() - last < 10 * 60_000) return;
  const { data: admins } = await db.from("platform_admins").select("user_id").in("role", ["owner", "admin"]);
  const to = (await Promise.all((admins || []).map((a: Any) => userEmail(a.user_id)))).filter(Boolean) as string[];
  const link = `${APP_URL}/admin/support?t=${t.id}`;
  const att = attachments.map((a) => `${a.type === "email" ? "Email" : "Domain"}: ${a.title} (${a.sub})`).join("\n");
  const label = topicLabel(t.topic);
  const org = teamName ? ` (${teamName})` : !t.user_id ? " (website visitor, not signed in)" : "";
  const sent = await notify(to, `${ticket(t.number)} ${who}${label ? ` · ${label}` : ""}`,
    wrap(`<p><b>${esc(who)}</b>${esc(org)} wrote${label ? ` about <b>${esc(label)}</b>` : ""}:</p>${quote(body)}${att ? `<p style="color:#62666d;font-size:13px;white-space:pre-wrap">Attached: ${esc(att)}</p>` : ""}<p><a href="${link}" style="color:#1b1a1a;font-weight:600">Reply in Delivrie →</a></p>`),
    `${who}${org} wrote:\n\n${body}\n\n${att ? `Attached:\n${att}\n\n` : ""}Reply: ${link}`);
  if (sent) await db.from("support_threads").update({ support_notified_at: new Date().toISOString() }).eq("id", t.id);
}
// A link that opens a visitor's conversation in any browser (it moves the conversation to that browser).
async function resumeKey(threadId: string) { return hmacUrl(`${await setting("cron_secret")}:support`, threadId); }

// ------------------------------------------------------------ customer handlers (shared by the dashboard and the site)
type H = (who: Who, p: Record<string, string>, url: URL, b: Any) => Promise<Any>;
const CUSTOMER: [string, string, H][] = [
  ["GET", "/support/home", async (who, _p, url) => {
    const page = url.searchParams.get("page") || "";
    const [ctx, team, name, { data: recent }, { data: unreadRows }] = await Promise.all([
      accountContext(who.teamId), supportTeam(), profileName(who.userId),
      mine(db.from("support_threads").select("*").neq("status", "bot").order("last_message_at", { ascending: false }).limit(1), who),
      mine(db.from("support_threads").select("unread_customer").gt("unread_customer", 0), who),
    ]);
    // Suggestions: what's wrong on the account first, weighted toward the page they're on, then common questions.
    const sugg: Any[] = [];
    const pageTopic = /^\/domains/.test(page) ? "domains" : /^\/(webhooks|keys|logs)/.test(page) ? "api" : /^\/billing/.test(page) ? "billing" : /^\/(emails|broadcasts|suppressions|metrics)/.test(page) ? "deliverability" : /^\/(pricing|compare|vs)/.test(page) ? "sales" : "";
    const findings = [...ctx.findings].sort((a: Any, b: Any) => Number(b.topic === pageTopic) - Number(a.topic === pageTopic));
    for (const f of findings) {
      if (sugg.length >= 2) break;
      if (f.domain && f.topic === "domains") sugg.push({ icon: "globe", title: `${f.domain.name} still says ${f.domain.status === "pending" ? "Pending" : f.domain.status}`, sub: "Domains · DNS checks", q: `Why is ${f.domain.name} still ${f.domain.status}?` });
      else if (f.domain) sugg.push({ icon: "shield", title: `Add DMARC to ${f.domain.name}`, sub: "Deliverability · keeps mail out of spam", q: `How do I add DMARC to ${f.domain.name}?` });
      else if (/bounced/.test(f.text)) sugg.push({ icon: "mail", title: "My emails are bouncing", sub: "Deliverability · your last 7 days", q: "Why are my emails bouncing?" });
      else if (/spam/.test(f.text)) sugg.push({ icon: "alert", title: "People marked my email as spam", sub: "Deliverability · complaints", q: "Why are people marking my email as spam?" });
      else if (/paused/i.test(f.text)) sugg.push({ icon: "pause", title: "Why is my sending paused?", sub: "Account · sending", q: "Why is sending paused on my account?" });
    }
    const common = who.guest ? [
      { icon: "card", title: "How does pricing work?", sub: "Plans · free tier and overage", q: "How does Delivrie pricing work?", topic: "sales" },
      { icon: "arrow-right", title: "Switch from Resend", sub: "Migration · same API shape", q: "How do I migrate from Resend?", topic: "api" },
      { icon: "send", title: "Send my first email", sub: "Getting started · 5 minutes", q: "How do I send my first email?", topic: "api" },
      { icon: "mail", title: "Keep emails out of spam", sub: "Deliverability", q: "How do I keep my emails out of spam?", topic: "deliverability" },
    ] : [
      { icon: "mail", title: "Emails to Gmail land in spam", sub: "Deliverability · 3 min read", q: "Why are my emails to Gmail going to spam?", topic: "deliverability" },
      { icon: "globe", title: "My domain won’t verify", sub: "Domains · DNS checks", q: "Why isn’t my domain verifying?", topic: "domains" },
      { icon: "webhook", title: "Webhook retries and signatures", sub: "Webhooks", q: "How do webhook retries and signatures work?", topic: "api" },
      { icon: "card", title: "Change or cancel my plan", sub: "Billing", q: "How do I change or cancel my plan?", topic: "billing" },
    ];
    common.sort((a, b) => Number(b.topic === pageTopic) - Number(a.topic === pageTopic));
    for (const s of common) { if (sugg.length >= 3) break; if (!sugg.some((x) => x.title === s.title)) sugg.push(s); }
    const r = recent?.[0];
    let recentOut = null;
    if (r) {
      const by = r.last_author === "support" ? (first(r.assignee_name) || "Delivrie") : r.last_author === "customer" ? "You" : "Delivrie";
      recentOut = { id: r.id, title: r.subject || topicLabel(r.topic) || "Conversation", sub: `${by}: ${r.last_preview || ""}`.slice(0, 80), status: r.status, assignee: r.assignee_name ? initials(r.assignee_name) : null, unread: r.unread_customer || 0 };
    }
    return {
      name: first(name), guest: who.guest, suggestions: sugg.slice(0, 3), recent: recentOut, team: team.people, on_shift: team.on_shift,
      unread: (unreadRows || []).reduce((n: number, t: Any) => n + (t.unread_customer || 0), 0),
      ai: !!Deno.env.get("ANTHROPIC_API_KEY"), topics: topicsFor(who),
    };
  }],
  ["GET", "/support/unread", async (who) => {
    const { data } = await mine(db.from("support_threads").select("id,number,unread_customer,last_preview,last_message_at,assignee_name").gt("unread_customer", 0).order("last_message_at", { ascending: false }).limit(5), who);
    const t = data?.[0];
    return { unread: (data || []).reduce((n: number, x: Any) => n + (x.unread_customer || 0), 0), latest: t ? { thread_id: t.id, ticket: ticket(t.number), name: t.assignee_name ? `${first(t.assignee_name)} from Support` : "Delivrie support", initials: t.assignee_name ? initials(t.assignee_name) : "D", preview: t.last_preview, at: t.last_message_at } : null };
  }],
  ["GET", "/support/threads", async (who) => {
    const { data } = await mine(db.from("support_threads").select("*").order("last_message_at", { ascending: false }).limit(50), who);
    return { object: "list", data: (data || []).map(threadOut) };
  }],
  ["GET", "/support/threads/:id", async (who, p) => {
    const t = await myThread(who, p.id);
    await db.from("support_threads").update({ unread_customer: 0, customer_seen_at: new Date().toISOString() }).eq("id", t.id);
    const msgs = await messages(t.id);
    const lastMine = [...msgs].reverse().find((m) => m.author === "customer");
    return {
      thread: threadOut({ ...t, unread_customer: 0 }), messages: msgs,
      typing: !!(t.agent_typing_at && Date.now() - new Date(t.agent_typing_at).getTime() < 8000),
      seen: !!(lastMine && t.status !== "bot" && t.support_seen_at && t.support_seen_at >= lastMine.created_at),
      promise: t.status === "bot" ? null : replyPromise(await teamPlan(t.team_id), !t.user_id),
    };
  }],
  // Ask the assistant, or write to the team once the conversation is a ticket.
  ["POST", "/support/messages", async (who, _p, _u, b) => {
    const body = String(b?.body || "").trim();
    if (!body) throw bad("Write a message first");
    if (body.length > MAX) throw bad(`Messages can be up to ${MAX.toLocaleString()} characters`);
    let t = b?.thread_id ? await myThread(who, String(b.thread_id)) : null;
    await rateLimit(who, t ? "message" : "thread");
    const name = (await profileName(who.userId)) || t?.guest_name || who.email || (who.guest ? "Visitor" : "Customer");
    const now = new Date().toISOString();
    if (!t) t = await newThread(who, body, preview(body));
    const mineMsg = await addMessage(t, "customer", body, { user_id: who.userId, author_name: first(name) || name });
    if (t.status === "bot") {
      const history = await messages(t.id);
      const a = await answer(body, who.teamId, history.slice(0, -1), who.guest);
      const bot = await addMessage(t, "bot", a.body, { author_name: "Delivrie assistant", meta: a.meta });
      await db.from("support_threads").update({ last_message_at: new Date().toISOString(), last_author: "bot", last_preview: preview(a.body), topic: t.topic || (a.meta.topic !== "other" ? a.meta.topic : null) }).eq("id", t.id);
      return { thread: threadOut({ ...t, status: "bot" }), messages: [msgOut(mineMsg), msgOut(bot)] };
    }
    // A ticket: replying to a resolved one reopens it.
    const patch: Any = { status: "open", team_id: who.teamId || t.team_id, last_message_at: now, last_author: "customer", last_preview: preview(body), unread_support: (t.unread_support || 0) + 1 };
    const out = [msgOut(mineMsg)];
    if (t.status === "closed") { patch.resolved_at = null; patch.rating = null; patch.rating_comment = null; patch.rated_at = null; out.push(msgOut(await addMessage(t, "system", "Conversation reopened", { meta: { icon: "refresh" } }))); }
    await db.from("support_threads").update(patch).eq("id", t.id);
    const { data: team } = who.teamId ? await db.from("teams").select("name").eq("id", who.teamId).maybeSingle() : { data: null };
    await notifyAdmins({ ...t, ...patch }, name, team?.name || null, body);
    return { thread: threadOut({ ...t, ...patch }), messages: out };
  }],
  ["POST", "/support/messages/:id/feedback", async (who, p, _u, b) => {
    if (!/^[0-9a-f-]{36}$/i.test(p.id)) throw notFound("Message");
    const { data: m } = await db.from("support_messages").select("id,thread_id,meta,author").eq("id", p.id).maybeSingle();
    if (!m || m.author !== "bot") throw notFound("Message");
    await myThread(who, m.thread_id);
    const meta = { ...(m.meta || {}), helpful: b?.helpful === false ? false : true };
    await db.from("support_messages").update({ meta }).eq("id", m.id);
    return { id: m.id, meta };
  }],
  // "Talk to a person": the assistant asks what it's about and shows what it will attach (visitors: their email).
  ["POST", "/support/handoff", async (who, _p, _u, b) => {
    let t = b?.thread_id ? await myThread(who, String(b.thread_id)) : null;
    if (t && t.status !== "bot") return { thread: threadOut(t), messages: [] };
    if (!t) { await rateLimit(who, "thread"); t = await newThread(who, "Talk to a person", "Talk to a person"); }
    const me = await addMessage(t, "customer", "Talk to a person", { user_id: who.userId, author_name: first(await profileName(who.userId)) || null, meta: { kind: "handoff" } });
    const attachments = who.guest ? [] : await proposeAttachments(who.teamId);
    const ask = who.guest ? "Sure. Which email should we reply to, and what’s it about?" : "Sure. I’ll pass this on with context so you don’t repeat yourself. What’s it about?";
    const bot = await addMessage(t, "bot", ask, { author_name: "Delivrie assistant", meta: { kind: "topics", topics: topicsFor(who), suggested: t.topic || (who.guest ? "sales" : null), attachments, ask_email: who.guest } });
    await db.from("support_threads").update({ last_message_at: new Date().toISOString(), last_author: "bot", last_preview: "What’s it about?" }).eq("id", t.id);
    return { thread: threadOut(t), messages: [msgOut(me), msgOut(bot)] };
  }],
  // Open the ticket: topic, what happened, the attachments they kept (visitors: the email to reply to).
  ["POST", "/support/threads/:id/escalate", async (who, p, _u, b) => {
    const t = await myThread(who, p.id);
    if (t.status !== "bot") throw bad("This conversation is already with the team");
    const topics = who.guest ? GUEST_TOPICS : TOPICS;
    const topic = topics[String(b?.topic || "")] ? String(b.topic) : "other";
    const body = String(b?.body || "").trim().slice(0, MAX);
    if (!body) throw bad("Tell us a little about the problem");
    let email = t.email, guestName: string | null = null;
    if (who.guest) {
      email = String(b?.email || "").trim().toLowerCase().slice(0, 200);
      if (!EMAIL_RE.test(email)) throw bad("Add the email address we should reply to");
      guestName = String(b?.name || "").trim().slice(0, 80) || null;
    }
    await rateLimit(who, "escalate");
    // Re-read attachments from the account (never trust what the browser sends back).
    const attachments: Any[] = [];
    if (!who.guest) for (const a of (Array.isArray(b?.attachments) ? b.attachments : []).slice(0, 4)) {
      const x = a?.type === "email" ? await emailAttachment(who.teamId!, String(a.id)) : a?.type === "domain" ? await domainAttachment(who.teamId!, String(a.id)) : null;
      if (x) attachments.push(x);
    }
    const { data: num } = await db.rpc("support_next_number");
    const name = (await profileName(who.userId)) || guestName || email || "Customer";
    const now = new Date().toISOString();
    const patch: Any = { status: "open", number: num, topic, subject: body.split("\n")[0].slice(0, 80), escalated_at: now, team_id: who.teamId || t.team_id, email, guest_name: guestName, last_message_at: now, last_author: "customer", last_preview: preview(body), unread_support: 1 };
    await db.from("support_threads").update(patch).eq("id", t.id);
    const nt = { ...t, ...patch };
    const out = [
      await addMessage(nt, "customer", body, { user_id: who.userId, author_name: first(name) || name, meta: { topic, topic_label: topics[topic], attachments } }),
      await addMessage(nt, "system", `Conversation ${ticket(num)} opened`, { meta: { icon: "check-circle", kind: "opened" } }),
    ];
    // While they wait: a concrete fix the assistant can draft, when there is one.
    const ctx = await accountContext(who.teamId);
    const noDmarc = ctx.findings.find((f: Any) => f.domain && /DMARC/.test(f.text));
    if (noDmarc && (topic === "deliverability" || topic === "domains")) {
      out.push(await addMessage(nt, "bot", "While you wait: adding DMARC usually fixes this. I can draft the record.", { author_name: "Delivrie assistant", meta: { actions: [{ id: "draft_dmarc", label: "Draft DMARC record", icon: "sparkle", domain_id: noDmarc.domain.id }] } }));
    }
    const { data: team } = who.teamId ? await db.from("teams").select("name").eq("id", who.teamId).maybeSingle() : { data: null };
    await notifyAdmins(nt, name + (who.guest ? ` <${email}>` : ""), team?.name || null, body, attachments);
    return { thread: threadOut(nt), messages: out.map(msgOut), promise: replyPromise(ctx.plan, who.guest) };
  }],
  // Assistant actions offered as buttons (only ones that read the customer's own account).
  ["POST", "/support/threads/:id/action", async (who, p, _u, b) => {
    const t = await myThread(who, p.id);
    if (b?.action !== "draft_dmarc" || !who.teamId) throw bad("Unknown action");
    const { data: d } = await db.from("domains").select("id,name").eq("team_id", who.teamId).eq("id", String(b?.domain_id || "")).maybeSingle();
    if (!d) throw notFound("Domain");
    const email = who.email || await userEmail(who.userId) || `dmarc@${d.name}`;
    const rua = domainOf(email) === d.name ? email : `dmarc@${d.name}`;
    const body = `Add this TXT record at _dmarc.${d.name}:\n\n\`\`\`\nv=DMARC1; p=none; rua=mailto:${rua}\n\`\`\`\n\nStart with p=none to watch reports for a couple of weeks, then move to p=quarantine.`;
    const m = await addMessage(t, "bot", body, { author_name: "Delivrie assistant", meta: { actions: [{ label: `Open ${d.name}`, icon: "external", href: `/domains/${d.id}` }] } });
    await db.from("support_threads").update({ last_message_at: new Date().toISOString() }).eq("id", t.id);
    return { messages: [msgOut(m)] };
  }],
  ["POST", "/support/threads/:id/rate", async (who, p, _u, b) => {
    const t = await myThread(who, p.id);
    if (t.status !== "closed") throw bad("You can rate a conversation once it’s resolved");
    const rating = ["bad", "okay", "great"].includes(b?.rating) ? b.rating : null;
    if (!rating) throw bad("Pick Bad, Okay or Great");
    const comment = String(b?.comment || "").trim().slice(0, 1000) || null;
    await db.from("support_threads").update({ rating, rating_comment: comment, rated_at: new Date().toISOString() }).eq("id", t.id);
    return { thread: threadOut({ ...t, rating, rating_comment: comment, rated_at: new Date().toISOString() }) };
  }],
  // Visitors: open a conversation from the link in a reply email (moves it to this browser).
  ["POST", "/support/claim", async (who, _p, _u, b) => {
    if (!who.guest) throw bad("Sign out to open a visitor conversation");
    const id = String(b?.thread_id || "");
    if (!/^[0-9a-f-]{36}$/i.test(id) || String(b?.key || "") !== await resumeKey(id)) throw notFound("Conversation");
    const { data } = await db.from("support_threads").update({ guest_token_hash: who.tokenHash }).eq("id", id).is("user_id", null).select("id").maybeSingle();
    if (!data) throw notFound("Conversation");
    return { thread_id: data.id };
  }],
];

// The website's chat for visitors who aren't signed in: /api/public/support/… with an x-support-token header.
export async function supportPublic(req: Request, path: string, url: URL, ip: string | null): Promise<Response | null> {
  if (!path.startsWith("/public/support/")) return null;
  const sub = path.slice("/public".length);
  const token = (req.headers.get("x-support-token") || "").trim();
  if (!/^[A-Za-z0-9_-]{32,128}$/.test(token)) throw bad("Missing visitor token");
  const who: Who = { userId: null, teamId: null, email: null, tokenHash: await sha256(token), ip, guest: true };
  for (const [method, pattern, h] of CUSTOMER) {
    if (method !== req.method) continue;
    const names: string[] = [];
    const re = new RegExp("^" + pattern.replace(/:(\w+)/g, (_m, n) => { names.push(n); return "([^/]+)"; }) + "$");
    const m = sub.match(re);
    if (!m) continue;
    const params = Object.fromEntries(names.map((n, i) => [n, decodeURIComponent(m[i + 1])]));
    const body = method === "GET" ? null : await req.json().catch(() => ({}));
    return json(await h(who, params, url, body));
  }
  return null;
}

export function registerSupport(route: Route) {
  // ------------------------------------------------------------ customer (dashboard and signed-in site visitors)
  for (const [method, path, h] of CUSTOMER) route(method, path, (_r, c, p, url, b) => { needDashboard(c); return h(whoFromCtx(c), p, url, b); });

  // ------------------------------------------------------------ admin
  route("GET", "/support/admin/threads", async (_r, c, _p, url) => {
    await needAdmin(c);
    const status = url.searchParams.get("status") || "open";
    let q = db.from("support_threads").select("*").neq("status", "bot").order("last_message_at", { ascending: false }).limit(200);
    if (status !== "all") q = q.eq("status", status);
    const { data: rows } = await q;
    const teamIds = [...new Set((rows || []).map((r: Any) => r.team_id).filter(Boolean))];
    const { data: teams } = teamIds.length ? await db.from("teams").select("id,name,plan_transactional").in("id", teamIds) : { data: [] };
    const tm = new Map<string, Any>((teams || []).map((t: Any) => [t.id, t]));
    const { count } = await db.from("support_threads").select("id", { count: "exact", head: true }).neq("status", "bot").gt("unread_support", 0);
    return {
      unread_threads: count || 0,
      data: (rows || []).map((r: Any) => ({ id: r.id, ticket: ticket(r.number), topic: topicLabel(r.topic), email: r.email, visitor: !r.user_id, team: tm.get(r.team_id)?.name || null, plan: tm.get(r.team_id)?.plan_transactional || null, status: r.status, last_message_at: r.last_message_at, last_author: r.last_author, preview: r.last_preview, unread: r.unread_support, rating: r.rating, assignee: first(r.assignee_name) || null })),
    };
  });
  route("GET", "/support/admin/unread", async (_r, c) => {
    await needAdmin(c);
    const { count } = await db.from("support_threads").select("id", { count: "exact", head: true }).neq("status", "bot").gt("unread_support", 0);
    return { unread_threads: count || 0 };
  });
  route("GET", "/support/admin/threads/:id", async (_r, c, p) => {
    await needAdmin(c);
    const { data: t } = await db.from("support_threads").select("*").eq("id", p.id).maybeSingle();
    if (!t) throw notFound("Conversation");
    await db.from("support_threads").update({ unread_support: 0, support_seen_at: new Date().toISOString() }).eq("id", t.id);
    const { data: team } = t.team_id ? await db.from("teams").select("id,name,plan_transactional,created_at").eq("id", t.team_id).maybeSingle() : { data: null };
    return { thread: { id: t.id, ticket: ticket(t.number), topic: topicLabel(t.topic), email: t.email, visitor: !t.user_id, guest_name: t.guest_name, status: t.status, team, customer_seen_at: t.customer_seen_at, created_at: t.created_at, assignee: first(t.assignee_name) || null, rating: t.rating, rating_comment: t.rating_comment, resolved_by: t.resolved_by }, messages: await messages(t.id) };
  });
  route("POST", "/support/admin/threads/:id/typing", async (_r, c, p) => {
    await needAdmin(c);
    await db.from("support_threads").update({ agent_typing_at: new Date().toISOString() }).eq("id", p.id);
    return { ok: true };
  });
  route("POST", "/support/admin/threads/:id/messages", async (_r, c, p, _u, b) => {
    await needAdmin(c);
    const body = String(b?.body || "").trim();
    if (!body) throw bad("Write a reply first");
    if (body.length > MAX) throw bad(`Replies can be up to ${MAX.toLocaleString()} characters`);
    const { data: t } = await db.from("support_threads").select("*").eq("id", p.id).maybeSingle();
    if (!t) throw notFound("Conversation");
    const full = (await profileName(c.userId)) || "Delivrie";
    const agent = first(full);
    const now = new Date().toISOString();
    // The first reply from someone new: "Tolu joined · 11:58".
    if (t.assignee_id !== c.userId) await addMessage(t, "system", `${agent} joined`, { meta: { icon: "users", kind: "joined" } });
    const m = await addMessage(t, "support", body, { user_id: c.userId, author_name: agent, meta: { initials: initials(full) } });
    await db.from("support_threads").update({ status: "open", assignee_id: c.userId, assignee_name: full, agent_typing_at: null, last_message_at: now, last_author: "support", last_preview: preview(body), unread_customer: (t.unread_customer || 0) + 1, unread_support: 0, support_seen_at: now }).eq("id", t.id);
    return { message: msgOut(m), emailed: false };
  });
  route("PATCH", "/support/admin/threads/:id", async (_r, c, p, _u, b) => {
    await needAdmin(c);
    const { data: t } = await db.from("support_threads").select("*").eq("id", p.id).maybeSingle();
    if (!t) throw notFound("Conversation");
    const status = b?.status === "closed" ? "closed" : "open";
    const agent = first(await profileName(c.userId)) || "Delivrie";
    const now = new Date().toISOString();
    const patch: Any = status === "closed" ? { status, resolved_at: now, resolved_by: agent, agent_typing_at: null } : { status, resolved_at: null };
    await db.from("support_threads").update(patch).eq("id", t.id);
    if (status !== t.status) await addMessage(t, "system", status === "closed" ? `Marked resolved by ${agent}` : `Reopened by ${agent}`, { meta: { icon: status === "closed" ? "check-circle" : "refresh", kind: status === "closed" ? "resolved" : "reopened" } });
    return { id: t.id, status };
  });
}

// Replies the customer hasn't read after 5 minutes go to them by email (once per batch of replies). Runs every minute.
export async function supportCron() {
  const cutoff = new Date(Date.now() - 5 * 60e3).toISOString();
  const { data: rows } = await db.from("support_threads").select("*").gt("unread_customer", 0).eq("last_author", "support").lt("last_message_at", cutoff).limit(20);
  let sent = 0;
  for (const t of rows || []) {
    if (!t.email || (t.customer_emailed_at && t.customer_emailed_at >= t.last_message_at)) continue;
    const since = [t.customer_seen_at, t.customer_emailed_at].filter(Boolean).sort().pop() || t.created_at;
    const { data: msgs } = await db.from("support_messages").select("author_name,body,created_at").eq("thread_id", t.id).eq("author", "support").gt("created_at", since).order("created_at");
    if (!msgs?.length) { await db.from("support_threads").update({ customer_emailed_at: new Date().toISOString() }).eq("id", t.id); continue; }
    const who = `${first(msgs[msgs.length - 1].author_name) || "Delivrie"} from Support`;
    const link = t.user_id ? `${APP_URL}/emails?support=${t.id}` : `${APP_URL}/?support=${t.id}&key=${await resumeKey(t.id)}`;
    const subject = `${who} replied${t.number ? ` · ${ticket(t.number)}` : ""}`;
    const ok = await notify([t.email], subject,
      wrap(`<p><b>${esc(who)}</b> replied${t.subject ? ` about “${esc(t.subject)}”` : ""}:</p>${msgs.map((m: Any) => quote(m.body)).join("")}<p><a href="${link}" style="color:#1b1a1a;font-weight:600">Open the conversation →</a></p><p style="color:#62666d;font-size:13px">${t.user_id ? "Reply from Contact support in your Delivrie dashboard." : "Reply from Contact support on delivrie.io."}</p>`),
      `${who} replied:\n\n${msgs.map((m: Any) => m.body).join("\n\n")}\n\nOpen the conversation: ${link}`);
    await db.from("support_threads").update({ customer_emailed_at: new Date().toISOString() }).eq("id", t.id);
    if (ok) sent++;
  }
  return sent;
}
