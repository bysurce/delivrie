// REST routes behind the newer MCP tools: automations and events, usage, received mail. (The Inbox is in inbox.ts.)
import { type Any, bad, db, HttpError, LIMITS, notFound, setting, SUPABASE_URL } from "./util.ts";

// deno-lint-ignore no-explicit-any
type Route = (method: string, path: string, h: (req: Request, c: Any, p: Record<string, string>, url: URL, body: Any) => Promise<any>) => void;
interface Deps { needFull: (c: Any) => void; sendEmails: (c: Any, bodies: Any[], idem: string | null) => Promise<{ id: string }[]> }

const clampLimit = (url: URL, d = 20, max = 100) => Math.min(Math.max(parseInt(url.searchParams.get("limit") || String(d)) || d, 1), max);

// The automations function owns publishing, validation and event ingestion; call it as this team.
async function automationsFn(teamId: string, method: string, path: string, body: Any) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/automations${path}`, {
    method, headers: { "content-type": "application/json", "x-internal-secret": await setting("cron_secret"), "x-team-id": teamId },
    body: JSON.stringify(body || {}),
  });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw new HttpError(res.status, out.name || "automation_error", out.message || `Automations returned ${res.status}`);
  return out;
}

export function registerExtra(route: Route, d: Deps) {
  // ------------------------------------------------------------ usage
  route("GET", "/usage", async (_r, c) => {
    const { data: t } = await db.from("teams").select("plan_transactional,plan_marketing,credits").eq("id", c.teamId).single();
    const plan = t?.plan_transactional || "free";
    const L = LIMITS[plan] || LIMITS.free;
    const now = new Date();
    const month = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)), day = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const [m, dd] = await Promise.all([db.rpc("team_usage", { p_team: c.teamId, p_from: month.toISOString() }), db.rpc("team_usage", { p_team: c.teamId, p_from: day.toISOString() })]);
    return { object: "usage", plan, marketing_plan: t?.plan_marketing || "free", emails_this_month: Number(m.data || 0), monthly_allowance: L.month || null, emails_today: Number(dd.data || 0), daily_limit: L.day || null, credits_emails: Number(t?.credits || 0), overage_after_allowance: !!L.overage, billing_url: "https://delivrie.io/billing" };
  });

  // ------------------------------------------------------------ received mail
  route("GET", "/emails/received", async (_r, c, _p, url) => {
    d.needFull(c);
    const limit = clampLimit(url);
    let q = db.from("emails").select("id,from,to,subject,created_at,thread_id,attachments").eq("team_id", c.teamId).eq("direction", "inbound").order("created_at", { ascending: false }).limit(limit);
    const to = url.searchParams.get("to");
    if (to) q = q.contains("to", [to]);
    const { data } = await q;
    return { object: "list", data: (data || []).map((e: Any) => ({ ...e, attachments: (e.attachments || []).map((a: Any) => ({ filename: a.filename, content_type: a.content_type, size: a.size })) })) };
  });

  // ------------------------------------------------------------ automations & events
  const autoOut = (a: Any) => ({ object: "automation", id: a.id, name: a.name, status: a.status, trigger: a.trigger, steps: Object.values(a.steps || {}).length, reentry: a.reentry, version: a.version, published_at: a.published_at, updated_at: a.updated_at });
  route("GET", "/automations", async (_r, c) => { d.needFull(c); const { data } = await db.from("automations").select("*").eq("team_id", c.teamId).order("updated_at", { ascending: false }); return { object: "list", data: (data || []).map(autoOut) }; });
  route("GET", "/automations/:id", async (_r, c, p) => {
    d.needFull(c);
    const { data: a } = await db.from("automations").select("*").eq("team_id", c.teamId).eq("id", p.id).maybeSingle();
    if (!a) throw notFound("Automation");
    const { data: stats } = await db.from("automation_runs").select("status").eq("automation_id", a.id).eq("test", false).limit(5000);
    const count = (s: string) => (stats || []).filter((r: Any) => r.status === s).length;
    return { ...autoOut(a), steps: a.steps, start_step: a.start_step, runs: { running: count("running"), completed: count("completed"), failed: count("failed"), canceled: count("canceled") } };
  });
  route("GET", "/automations/:id/runs", async (_r, c, p, url) => {
    d.needFull(c);
    let q = db.from("automation_runs").select("id,email,status,trigger,current_step,started_at,finished_at,error,log").eq("team_id", c.teamId).eq("automation_id", p.id).order("started_at", { ascending: false }).limit(clampLimit(url));
    const st = url.searchParams.get("status"); if (st) q = q.eq("status", st);
    const { data } = await q;
    return { object: "list", data: data || [] };
  });
  // Simple linear automations: a trigger and a list of send / wait steps. Branches are built in the dashboard.
  route("POST", "/automations", async (_r, c, _p, _u, b) => {
    d.needFull(c);
    const name = String(b?.name || "Untitled automation").slice(0, 120);
    const trig = b?.trigger || {};
    let trigger: Any;
    if (trig.event || trig.type === "event") trigger = { type: "event", event: String(trig.event || "").trim() };
    else if (trig.segment_id) trigger = { type: "segment", segment_id: trig.segment_id };
    else throw bad("trigger needs an event name (e.g. { \"event\": \"user.created\" }) or a segment_id");
    const list: Any[] = Array.isArray(b?.steps) ? b.steps : [];
    if (!list.length || list.length > 30) throw bad("Add between 1 and 30 steps");
    const steps: Any = {};
    const ids = list.map((_s, i) => `s${i + 1}`);
    for (const [i, s] of list.entries()) {
      const id = ids[i], next = ids[i + 1] || null;
      if (s.type === "send" || s.template_id) {
        if (!s.template_id) throw bad(`Step ${i + 1}: a send step needs a template_id`);
        // An id or an alias, matched with .eq() so the value never becomes part of a filter string.
        const tid = String(s.template_id);
        const { data: t } = await db.from("templates").select("id").eq("team_id", c.teamId).eq(/^[0-9a-f-]{36}$/i.test(tid) ? "id" : "alias", tid).maybeSingle();
        if (!t) throw bad(`Step ${i + 1}: template ${s.template_id} not found`);
        steps[id] = { id, type: "send", template_id: t.id, from: s.from || undefined, subject: s.subject || undefined, next };
      } else if (s.type === "wait") {
        steps[id] = { id, type: "wait", amount: Math.max(1, Number(s.amount) || 1), unit: ["minutes", "hours", "days", "weeks"].includes(s.unit) ? s.unit : "days", next };
      } else throw bad(`Step ${i + 1}: use type send or wait. Build branches in the dashboard.`);
    }
    const { data: a, error } = await db.from("automations").insert({ team_id: c.teamId, name, trigger, steps, start_step: ids[0], reentry: b?.reentry === "always" ? "always" : "once", created_by: c.userId }).select().single();
    if (error) throw bad(error.message);
    if (b?.publish) await automationsFn(c.teamId, "POST", `/automations/${a.id}/publish`, {});
    const { data: fresh } = await db.from("automations").select("*").eq("id", a.id).single();
    return { ...autoOut(fresh), url: `https://delivrie.io/automations/${a.id}` };
  });
  route("POST", "/automations/:id/:action", async (_r, c, p, _u, b) => {
    d.needFull(c);
    if (!["publish", "pause", "resume", "test"].includes(p.action)) throw notFound("Action");
    return await automationsFn(c.teamId, "POST", `/automations/${p.id}/${p.action}`, b || {});
  });
  route("POST", "/events", async (_r, c, _p, _u, b) => automationsFn(c.teamId, "POST", "/events", b || {}));
  route("GET", "/events", async (_r, c, _p, url) => {
    d.needFull(c);
    const name = url.searchParams.get("name");
    if (name) { const { data } = await db.from("events").select("id,name,email,data,created_at").eq("team_id", c.teamId).eq("name", name).order("created_at", { ascending: false }).limit(clampLimit(url)); return { object: "list", data: data || [] }; }
    const { data } = await db.from("event_definitions").select("name,description,fields,first_seen_at,last_seen_at").eq("team_id", c.teamId).order("last_seen_at", { ascending: false, nullsFirst: false });
    return { object: "list", data: data || [] };
  });

  // ------------------------------------------------------------ topics & contact properties (read)
  route("GET", "/topics", async (_r, c) => { d.needFull(c); const { data } = await db.from("topics").select("id,name,description,default_subscription,visibility").eq("team_id", c.teamId).order("created_at"); return { object: "list", data: data || [] }; });
  route("GET", "/contact-properties", async (_r, c) => { d.needFull(c); const { data } = await db.from("contact_properties").select("key,type,fallback").eq("team_id", c.teamId).order("key"); return { object: "list", data: data || [] }; });
}
