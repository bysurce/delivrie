// Dedicated IPs: Amazon SES managed dedicated IP pools, one per team per region. A team admin requests them, a
// platform admin approves, and the team's domains (each has its own configuration set) are pointed at the pool.
// SES allocates the IPs, warms them up per mailbox provider and scales them with volume; early in warm-up some mail
// still goes through the shared pool. Removing them points the domains back at the shared pool and deletes the pool.
import { AwsError, credsFromEnv, sesv2 } from "./aws.ts";
import { type Any, bad, db, forbidden, HttpError } from "./util.ts";
import { notify } from "./support.ts";

// deno-lint-ignore no-explicit-any
type Route = (method: string, path: string, h: (req: Request, c: Any, p: Record<string, string>, url: URL, body: Any) => Promise<any>) => void;

export const DEDICATED_PLANS = ["scale", "enterprise"];
/** Below this daily volume SES may hand the IPs back to the shared pool, so it's guidance shown before requesting. */
export const DEDICATED_MIN_DAILY = 3000;
export const poolName = (teamId: string) => `dlv-team-${teamId}`;
const tlsPolicy = (d: Any) => d.tls === "enforced" ? "REQUIRE" : "OPTIONAL";
const escHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function awsCreds() {
  const c = credsFromEnv();
  if (!c) throw new HttpError(503, "sending_not_configured", "Sending isn't configured on this server");
  return c;
}
const ignore = (codes: string[]) => (e: unknown) => { if (!(e instanceof AwsError && codes.includes(e.code))) throw e; };

/** The pool this team's domain in this region sends through, or null for the shared pool. */
export async function teamPool(teamId: string, region: string): Promise<string | null> {
  const { data } = await db.from("dedicated_ips").select("status,pools").eq("team_id", teamId).maybeSingle();
  if (!data || data.status !== "active") return null;
  return (data.pools || []).find((p: Any) => p.region === region && p.status === "active")?.pool || null;
}

/** For a team with dedicated IPs, makes sure it has a pool in this region (a new domain in a new region). */
export async function ensureTeamPool(teamId: string, region: string): Promise<string | null> {
  const { data } = await db.from("dedicated_ips").select("status,pools").eq("team_id", teamId).maybeSingle();
  if (!data || data.status !== "active") return null;
  const have = (data.pools || []).find((p: Any) => p.region === region && p.status === "active");
  if (have) return have.pool;
  const pool = poolName(teamId);
  try {
    await createPool(awsCreds(), region, pool, teamId);
    await db.from("dedicated_ips").update({ pools: [...(data.pools || []).filter((p: Any) => p.region !== region), { region, pool, status: "active" }] }).eq("team_id", teamId);
    return pool;
  } catch (e) {
    console.error("dedicated pool for new region", teamId, region, e);
    return null; // the domain still sends, through the shared pool
  }
}

async function createPool(c: Any, region: string, pool: string, teamId: string) {
  await sesv2(c, region, "POST", "/v2/email/dedicated-ip-pools", { PoolName: pool, ScalingMode: "MANAGED", Tags: [{ Key: "delivrie_team", Value: teamId }] }).catch(ignore(["AlreadyExistsException"]));
}
/** Points the team's domains in a region at a pool (or back at the shared pool with null). */
async function pointDomains(c: Any, teamId: string, region: string, pool: string | null) {
  const { data: doms } = await db.from("domains").select("id,tls,config_set,region").eq("team_id", teamId).eq("region", region);
  for (const d of doms || []) {
    await sesv2(c, region, "PUT", `/v2/email/configuration-sets/${d.config_set || `dlv-${d.id}`}/delivery-options`, { TlsPolicy: tlsPolicy(d), ...(pool ? { SendingPoolName: pool } : {}) }).catch(ignore(["NotFoundException"]));
  }
}

export async function provision(teamId: string) {
  const c = awsCreds();
  const { data: doms } = await db.from("domains").select("region").eq("team_id", teamId);
  const regions = [...new Set((doms || []).map((d: Any) => d.region).filter(Boolean))] as string[];
  if (!regions.length) throw bad("This team has no domains yet. Dedicated IPs are set up for the regions its domains send from.");
  await db.from("dedicated_ips").update({ status: "provisioning", error: null }).eq("team_id", teamId);
  const pool = poolName(teamId), pools: Any[] = [];
  for (const region of regions) {
    try { await createPool(c, region, pool, teamId); await pointDomains(c, teamId, region, pool); pools.push({ region, pool, status: "active" }); }
    catch (e) { pools.push({ region, pool, status: "failed", error: (e as Error).message.slice(0, 300) }); }
  }
  const ok = pools.some((p) => p.status === "active");
  const failed = pools.filter((p) => p.status === "failed");
  const { data } = await db.from("dedicated_ips").update({ status: ok ? "active" : "failed", pools, activated_at: ok ? new Date().toISOString() : null, error: failed.length ? failed.map((p) => `${p.region}: ${p.error}`).join("; ") : null }).eq("team_id", teamId).select().single();
  return data;
}

export async function deprovision(teamId: string) {
  const c = awsCreds();
  const { data: row } = await db.from("dedicated_ips").select("pools").eq("team_id", teamId).maybeSingle();
  await db.from("dedicated_ips").update({ status: "removing" }).eq("team_id", teamId);
  const { data: doms } = await db.from("domains").select("region").eq("team_id", teamId);
  const regions = [...new Set([...(row?.pools || []).map((p: Any) => p.region), ...(doms || []).map((d: Any) => d.region)].filter(Boolean))] as string[];
  const errors: string[] = [];
  for (const region of regions) {
    try {
      await pointDomains(c, teamId, region, null);
      await sesv2(c, region, "DELETE", `/v2/email/dedicated-ip-pools/${poolName(teamId)}`).catch(ignore(["NotFoundException"]));
    } catch (e) { errors.push(`${region}: ${(e as Error).message.slice(0, 300)}`); }
  }
  const { data } = await db.from("dedicated_ips").update(errors.length ? { status: "failed", error: `Couldn't remove: ${errors.join("; ")}` } : { status: "off", pools: [], removed_at: new Date().toISOString(), error: null }).eq("team_id", teamId).select().single();
  return data;
}

async function emailsFor(userIds: string[]) {
  const out: string[] = [];
  for (const id of userIds) { const { data } = await db.auth.admin.getUserById(id); if (data?.user?.email) out.push(data.user.email); }
  return out;
}
const staffEmails = async () => { const { data } = await db.from("platform_admins").select("user_id").in("role", ["owner", "admin"]); return emailsFor((data || []).map((a: Any) => a.user_id)); };
const teamAdminEmails = async (teamId: string) => { const { data } = await db.from("team_members").select("user_id").eq("team_id", teamId).eq("role", "admin"); return emailsFor((data || []).map((m: Any) => m.user_id)); };
const mail = (to: string[], subject: string, lines: string[]) => to.length ? notify(to, subject, lines.map((l) => `<p style="margin:0 0 12px">${escHtml(l)}</p>`).join(""), lines.join("\n\n"), "dedicated_ips").catch((e) => console.error("dedicated ips email", e)) : Promise.resolve();

async function dailyAverage(teamId: string) {
  const from = new Date(Date.now() - 14 * 864e5).toISOString();
  const { data } = await db.rpc("team_usage", { p_team: teamId, p_from: from });
  return Math.round(Number(data || 0) / 14);
}
const out = (row: Any, extra: Any = {}) => ({ object: "dedicated_ips", status: row?.status || "off", pools: (row?.pools || []).map((p: Any) => ({ region: p.region, status: p.status })), note: row?.note || null, decision_note: row?.decision_note || null, requested_at: row?.requested_at || null, activated_at: row?.activated_at || null, error: row?.error || null, ...extra });

export function registerDedicated(route: Route, d: { needFull: (c: Any) => void }) {
  const teamAdmin = async (c: Any) => {
    if (c.via !== "dashboard") throw forbidden("Manage dedicated IPs from the dashboard (Settings → Deliverability)");
    const { data: me } = await db.from("team_members").select("role").eq("team_id", c.teamId).eq("user_id", c.userId).single();
    if (me?.role !== "admin") throw forbidden("Only team admins can manage dedicated IPs");
  };
  const platformAdmin = async (c: Any, write = false) => {
    if (c.via !== "dashboard") throw forbidden("This endpoint is only available from the dashboard");
    const { data: adm } = c.userId ? await db.from("platform_admins").select("role").eq("user_id", c.userId).maybeSingle() : { data: null };
    if (!adm || adm.role === "support" || (write && !["owner", "admin"].includes(adm.role))) throw forbidden("Only platform admins can do this");
  };

  // ------------------------------------------------------------ the team's view
  route("GET", "/dedicated-ips", async (_r, c) => {
    d.needFull(c);
    const [{ data: row }, { data: team }, avg] = await Promise.all([
      db.from("dedicated_ips").select("*").eq("team_id", c.teamId).maybeSingle(),
      db.from("teams").select("plan_transactional").eq("id", c.teamId).single(),
      dailyAverage(c.teamId),
    ]);
    const plan = team?.plan_transactional || "free";
    return out(row, { plan, eligible: DEDICATED_PLANS.includes(plan), eligible_plans: DEDICATED_PLANS, daily_average: avg, recommended_daily_minimum: DEDICATED_MIN_DAILY });
  });
  route("POST", "/dedicated-ips/request", async (_r, c, _p, _u, b) => {
    await teamAdmin(c);
    const { data: team } = await db.from("teams").select("name,plan_transactional").eq("id", c.teamId).single();
    if (!DEDICATED_PLANS.includes(team?.plan_transactional || "free")) throw new HttpError(403, "plan_required", "Dedicated IPs are available on the Scale and Enterprise plans");
    const { data: cur } = await db.from("dedicated_ips").select("status").eq("team_id", c.teamId).maybeSingle();
    if (cur && ["requested", "provisioning", "active", "removing"].includes(cur.status)) throw bad(`Dedicated IPs are already ${cur.status}`);
    const { count } = await db.from("domains").select("id", { count: "exact", head: true }).eq("team_id", c.teamId);
    if (!count) throw bad("Add a sending domain first. Dedicated IPs are set up for the regions your domains send from.");
    const note = b?.note ? String(b.note).slice(0, 1000) : null;
    const row = { team_id: c.teamId, status: "requested", note, requested_by: c.userId, requested_at: new Date().toISOString(), decided_by: null, decided_at: null, decision_note: null, error: null, pools: [] };
    const { data } = await db.from("dedicated_ips").upsert(row).select().single();
    const avg = await dailyAverage(c.teamId);
    await mail(await staffEmails(), `Dedicated IPs requested: ${team?.name}`, [`${team?.name} (${team?.plan_transactional} plan) asked for dedicated IPs. They've sent about ${avg.toLocaleString("en-US")} emails a day over the last 14 days.`, note ? `Their note: ${note}` : "They didn't add a note.", "Approve or decline it in Admin → Dedicated IPs. Approving creates an Amazon SES managed dedicated IP pool for them in each region they send from. Amazon bills managed dedicated IPs to the Delivrie AWS account: $15 a month plus $0.08 per 1,000 emails sent through them."]);
    return out(data);
  });
  route("POST", "/dedicated-ips/cancel", async (_r, c) => {
    await teamAdmin(c);
    const { data: cur } = await db.from("dedicated_ips").select("status").eq("team_id", c.teamId).maybeSingle();
    if (!cur || ["off", "declined"].includes(cur.status)) throw bad("Dedicated IPs aren't on for this team");
    if (cur.status === "requested") { const { data } = await db.from("dedicated_ips").update({ status: "off" }).eq("team_id", c.teamId).select().single(); return out(data); }
    return out(await deprovision(c.teamId));
  });

  // ------------------------------------------------------------ platform admins
  route("GET", "/admin/dedicated-ips", async (_r, c) => {
    await platformAdmin(c);
    const { data: rows } = await db.from("dedicated_ips").select("*").neq("status", "off").order("requested_at", { ascending: false });
    const ids = (rows || []).map((r: Any) => r.team_id);
    const { data: teams } = ids.length ? await db.from("teams").select("id,name,plan_transactional").in("id", ids) : { data: [] };
    const byId = new Map<string, Any>((teams || []).map((t: Any) => [t.id, t]));
    const data = await Promise.all((rows || []).map(async (r: Any) => ({ ...out(r), team_id: r.team_id, team: byId.get(r.team_id)?.name || r.team_id, plan: byId.get(r.team_id)?.plan_transactional || "free", daily_average: await dailyAverage(r.team_id), pools: r.pools })));
    return { object: "list", data };
  });
  route("POST", "/admin/dedicated-ips/:team/:action", async (_r, c, p, _u, b) => {
    await platformAdmin(c, true);
    const { data: row } = await db.from("dedicated_ips").select("*").eq("team_id", p.team).maybeSingle();
    if (!row) throw new HttpError(404, "not_found", "No dedicated IP request for this team");
    const decided = { decided_by: c.userId, decided_at: new Date().toISOString(), decision_note: b?.note ? String(b.note).slice(0, 1000) : null };
    const { data: team } = await db.from("teams").select("name").eq("id", p.team).single();
    if (p.action === "approve" || p.action === "retry") {
      if (!["requested", "failed", "declined"].includes(row.status)) throw bad(`Can't approve: dedicated IPs are ${row.status}`);
      await db.from("dedicated_ips").update(decided).eq("team_id", p.team);
      const res = await provision(p.team);
      if (res?.status === "active") await mail(await teamAdminEmails(p.team), "Your dedicated IPs are on", [`Dedicated IPs are now set up for ${team?.name}. Amazon SES warms them up gradually with each mailbox provider, so for the first few weeks some of your mail still goes through Delivrie's shared IPs. That's expected and keeps your deliverability steady.`, "Keep your bounce and complaint rates low: on a dedicated IP, your reputation is yours alone."]);
      return out(res);
    }
    if (p.action === "decline") {
      if (row.status !== "requested") throw bad(`Can't decline: dedicated IPs are ${row.status}`);
      const { data } = await db.from("dedicated_ips").update({ ...decided, status: "declined" }).eq("team_id", p.team).select().single();
      await mail(await teamAdminEmails(p.team), "About your dedicated IP request", [`We aren't setting up dedicated IPs for ${team?.name} right now.`, decided.decision_note || "Usually that's because sending volume is still too low for a dedicated IP to keep a good reputation. Delivrie's shared IPs will serve you better until then.", "Reply to this email if you have questions."]);
      return out(data);
    }
    if (p.action === "remove") {
      if (!["active", "failed", "provisioning"].includes(row.status)) throw bad(`Can't remove: dedicated IPs are ${row.status}`);
      return out(await deprovision(p.team));
    }
    throw new HttpError(404, "not_found", "Unknown action. Use approve, retry, decline or remove.");
  });
}
