// Platform admin: sign-ups, users, teams, revenue, sending health, the support inbox and website settings.
// Access is checked in the database (platform_admins + security-definer functions); this page only renders.
import { sb, state, api } from "../lib/sb.js";
import { esc, icon, num, fmtDate, fmtDateTime, ago, badge, toast, errToast, on, debounce, confirmModal, formModal, fieldHtml, emptyState, initials } from "../lib/ui.js";
import { lineChart } from "../lib/chart.js";

// Roles: owner (everything, manages admins), admin (everything else), viewer (read-only usage oversight).
// The database enforces this; the page only hides what a role can't use.
// "support" (answer customers) and "everyone" (any admin role) sit outside the viewer < admin < owner ladder.
const TABS = [["overview", "Overview", "viewer"], ["users", "Users", "viewer"], ["teams", "Teams", "viewer"], ["blocked", "Blocked IPs", "admin"], ["revenue", "Revenue", "viewer"], ["support", "Support", "support"], ["leaderboard", "Leaderboard", "everyone"], ["inbox", "Inbox", "admin"], ["website", "Website", "admin"], ["admins", "Admins", "owner"]];
const RANK = { support: 0, viewer: 1, admin: 2, owner: 3 };
const ROLE_LABEL = { owner: "Owner", admin: "Admin", viewer: "Usage viewer", support: "Support" };
let ROLE = null;
const can = (min) => min === "everyone" ? !!ROLE : min === "support" ? ["owner", "admin", "support"].includes(ROLE) : (RANK[ROLE] ?? -1) >= RANK[min];
const money = (amount, currency) => new Intl.NumberFormat("en-US", { style: "currency", currency, minimumFractionDigits: (amount || 0) % 100 ? 2 : 0, maximumFractionDigits: 2 }).format((amount || 0) / 100);
const pct = (a, b, d = 1) => b ? `${((a / b) * 100).toFixed(d)}%` : "0%";
const planBadge = (p) => badge(p === "free" ? "Free" : p.replace(/^\w/, (c) => c.toUpperCase()), p === "free" ? "gray" : p === "scale" || p === "enterprise" ? "blue" : "yellow");

async function rpc(name: string, args?: Record<string, unknown>): Promise<any> {
  const { data, error } = await sb.rpc(name, args);
  if (error) throw error;
  return data;
}

export default async function admin(ctx) {
  const root = ctx.root;
  ROLE = await rpc("platform_role").catch(() => null);
  const tab = ctx.params.tab || (ROLE === "support" ? "support" : "overview");
  root.innerHTML = `<div class="admin">
    <header class="admin-top"><a href="/emails" class="row-flex" style="gap:10px"><img src="/assets/logo.svg" width="122" height="22" alt="Delivrie"></a>${badge(ROLE_LABEL[ROLE] || "Admin", "yellow")}<span class="grow"></span><span class="dim" style="font-size:calc(12.5px + var(--fs-up, 0px))">${esc(state.user?.email || "")}</span><a class="btn btn-ghost btn-sm" href="/emails">Back to app ${icon("arrow-right", 12)}</a></header>
    <div class="page wide"><div class="ul-tabs">${TABS.filter((t) => can(t[2])).map(([k, l]) => `<a class="ul-tab ${k === tab ? "on" : ""}" href="/admin/${k === "overview" ? "" : k}">${l}${k === "support" ? '<span data-support-count></span>' : ""}</a>`).join("")}</div><div data-body><div class="card card-pad row-flex"><span class="spinner"></span><span class="muted">Loading…</span></div></div></div></div>`;
  const body = root.querySelector("[data-body]");

  if (!ROLE) {
    body.innerHTML = `<div class="card">${emptyState({ icon: "shield", title: "Admins only", desc: "This account isn't a Delivrie platform admin. Ask an existing admin to add you." })}</div>`;
    return;
  }
  if (can("support")) api("GET", "/support/admin/unread").then((r) => { const n = r.waiting || r.unread_threads; const a = root.querySelector("[data-support-count]"); if (a && n) a.innerHTML = ` <span class="badge yellow" style="margin-left:4px" title="${r.waiting ? `${r.waiting} waiting to be accepted` : "unread"}">${n}</span>`; }).catch(() => {});
  const fn = { overview, users, teams, blocked, revenue, support, leaderboard, inbox, website, admins }[tab];
  const need = TABS.find((t) => t[0] === tab)?.[2];
  if (!fn || !need || !can(need)) return ctx.navigate(ROLE === "support" ? "/admin/support" : "/admin", { replace: true });
  try { await fn(body, ctx); } catch (e) { errToast(e); body.innerHTML = `<div class="card">${emptyState({ icon: "alert", title: "Couldn't load", desc: esc(e.message) })}</div>`; }
}

// ---------------------------------------------------------------- overview
async function overview(body) {
  let days = 30;
  const [o, daily] = await Promise.all([rpc("admin_overview"), rpc("admin_daily", { p_days: days })]);
  const st = o.status_30d || {};
  const sent = o.emails_30d || 0;
  const delivered = (st.delivered || 0) + (st.opened || 0) + (st.clicked || 0);
  // Sends that reached Amazon SES (leaves out test addresses, our own notices, and mail screened out before sending)
  const attempted = ["sent", "delivered", "delivery_delayed", "opened", "clicked", "bounced", "complained"].reduce((n, k) => n + (st[k] || 0), 0);
  const hard = o.hard_bounced_30d ?? st.bounced ?? 0;
  const paid = Object.entries<number>(o.plans || {}).filter(([p]) => p !== "free").reduce((s, [, n]) => s + n, 0);
  const stat = (k, v, sub) => `<div class="stat"><div class="k">${k}</div><div class="v">${v}</div>${sub ? `<div class="dim" style="font-size:calc(11.5px + var(--fs-up, 0px));margin-top:4px">${sub}</div>` : ""}</div>`;
  const draw = (rows) => {
    body.innerHTML = `
      <div class="stat-grid" style="grid-template-columns:repeat(4,1fr)">
        ${stat("Users", num(o.users), `+${num(o.users_7d)} this week · +${num(o.users_30d)} in 30 days`)}
        ${stat("Active (7 days)", num(o.active_7d), `${pct(o.users_confirmed, o.users)} confirmed email`)}
        ${stat("Teams", num(o.teams), `${num(paid)} paying`)}
        ${stat("Revenue (30 days)", esc(money(o.revenue_30d?.USD || 0, "USD")), `All time ${esc(money(o.revenue_all?.USD || 0, "USD"))}${o.revenue_ngn_all ? ` · incl. ${esc(money(o.revenue_ngn_all, "NGN"))} converted` : ""}`)}
      </div>
      <div class="stat-grid" style="grid-template-columns:repeat(4,1fr)">
        ${stat("Emails (30 days)", num(sent), `${num(o.emails_today)} today`)}
        ${stat("Delivered", pct(delivered, attempted), `${num(delivered)} emails`)}
        ${stat("Bounce rate", pct(hard, attempted), `${num(hard)} hard bounces · keep under 4% · ${num(o.blocked_30d || 0)} bad addresses stopped before sending`)}
        ${stat("Complaint rate", pct(st.complained || 0, attempted, 2), `${num(st.complained || 0)} complaints · keep under 0.08%`)}
      </div>
      <div data-ses-rep>${sesRepHtml()}</div>
      <div class="admin-grid">
        <div class="card card-pad"><div class="row-flex"><h3 class="h3">Sign-ups</h3><span class="grow"></span><div class="seg">${[7, 30, 90].map((d) => `<button class="${d === days ? "on" : ""}" data-days="${d}">${d}d</button>`).join("")}</div></div><div data-chart="signups" style="margin-top:12px"></div></div>
        <div class="card card-pad"><div class="row-flex"><h3 class="h3">Email volume</h3><span class="grow"></span><span class="dim" style="font-size:calc(12px + var(--fs-up, 0px))">sent · delivered · bounced</span></div><div data-chart="emails" style="margin-top:12px"></div></div>
      </div>
      <div class="admin-grid three">
        <div class="card card-pad"><h3 class="h3">Plans</h3>${bars(o.plans, o.teams)}</div>
        <div class="card card-pad"><h3 class="h3">Marketing</h3>${bars(o.marketing_plans, o.teams)}</div>
        <div class="card card-pad"><h3 class="h3">Platform</h3><div class="kv" style="margin-top:10px"><span class="k">Domains</span><span>${num(o.domains)} · ${num(o.domains_verified)} verified</span><span class="k">API keys</span><span>${num(o.api_keys)}</span><span class="k">Credits held</span><span>${num(o.credits_outstanding)} emails</span><span class="k">Support (30d)</span><span><a href="/admin/inbox">${num(o.support_30d)} requests · ${num(o.feedback_30d)} feedback</a></span></div></div>
      </div>`;
    const labels = rows.map((r) => new Date(r.day + "T00:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" }));
    lineChart(body.querySelector('[data-chart="signups"]'), { labels, height: 200, series: [{ name: "Users", color: "#fad600", values: rows.map((r) => Number(r.signups)) }, { name: "Teams", color: "#4c8df6", values: rows.map((r) => Number(r.teams)) }] });
    lineChart(body.querySelector('[data-chart="emails"]'), { labels, height: 200, series: [{ name: "Sent", color: "#8a8f98", values: rows.map((r) => Number(r.sent)) }, { name: "Delivered", color: "#3fa672", values: rows.map((r) => Number(r.delivered)) }, { name: "Bounced", color: "#e5484d", values: rows.map((r) => Number(r.bounced)) }] });
  };
  draw(daily);
  sesRepCard(body);
  regionsCard(body);
  on(body, "click", "[data-days]", async (_e, b) => {
    days = Number(b.dataset.days);
    try { draw(await rpc("admin_daily", { p_days: days })); } catch (e) { errToast(e); }
  });
}
// Amazon's own numbers: the bounce and complaint rates SES publishes for the account (per region), which are what its
// warnings and reviews go by. Ours above are close but count differently (fixed 30 days, no system mail).
let SES_REP = null;
const SES_LIMITS = { bounce: [0.05, 0.10], complaint: [0.001, 0.005] };
function sesRepHtml() {
  if (!SES_REP) return `<div class="dim" style="margin:-4px 0 16px;font-size:calc(12px + var(--fs-up, 0px))">Loading Amazon SES reputation…</div>`;
  if (SES_REP.error) return `<div class="dim" style="margin:-4px 0 16px;font-size:calc(12px + var(--fs-up, 0px))">Amazon SES reputation: ${esc(SES_REP.error)}</div>`;
  const fmt = (v, d) => v == null ? "—" : `${(v * 100).toFixed(d)}%`;
  const tone = (v, k) => v == null ? "gray" : v >= SES_LIMITS[k][1] ? "red" : v >= SES_LIMITS[k][0] ? "orange" : "green";
  const word = (v, k) => v == null ? "No data yet" : v >= SES_LIMITS[k][1] ? "Review level" : v >= SES_LIMITS[k][0] ? "Warning level" : "Healthy";
  const enf = { HEALTHY: ["Healthy", "green"], PROBATION: ["Under review", "orange"], SHUTDOWN: ["Sending paused by Amazon", "red"] };
  const small = 'class="dim" style="font-size:calc(11.5px + var(--fs-up, 0px));margin-top:4px"';
  return SES_REP.data.map((r) => {
    const e = enf[r.enforcement] || [r.enforcement || "Unknown", "gray"];
    const when = r.bounce?.at ? ` · updated ${ago(r.bounce.at)}` : "";
    const rate = (k, label, d, limits) => `<div class="stat"><div class="k">${label}</div><div class="v">${fmt(r[k]?.rate, d)} ${badge(word(r[k]?.rate, k), tone(r[k]?.rate, k))}</div><div ${small}>14-day peak ${fmt(r[k]?.peak_14d, d)} · ${limits}</div></div>`;
    return `<h3 class="section-title">What Amazon sees <span class="dim" style="font-weight:400">Amazon SES · ${esc(r.label)}${when}</span></h3>
      ${r.error ? `<div class="dim" style="margin:-4px 0 10px;font-size:calc(12px + var(--fs-up, 0px))">${esc(r.error)}</div>` : ""}
      <div class="stat-grid" style="grid-template-columns:repeat(4,1fr)">
        <div class="stat"><div class="k">Account status</div><div class="v">${badge(e[0], e[1])}</div><div ${small}>${r.sending === false ? "Sending is turned off" : "Sending is on"}</div></div>
        ${rate("bounce", "Bounce rate", 2, "warning at 5% · review at 10%")}
        ${rate("complaint", "Complaint rate", 3, "warning at 0.1% · review at 0.5%")}
        <div class="stat"><div class="k">Sent (24 hours)</div><div class="v">${r.sent_24h == null ? "—" : num(r.sent_24h)}</div><div ${small}>${r.max_24h ? `of ${num(r.max_24h)} allowed a day` : ""}</div></div>
      </div>`;
  }).join("") || `<div class="dim" style="margin:-4px 0 16px">Amazon SES isn't set up.</div>`;
}
async function sesRepCard(body) {
  if (!SES_REP) {
    try { SES_REP = await api("GET", "/dashboard/ses-reputation"); } catch (e) { SES_REP = { error: e.message || "couldn't load" }; }
  }
  const box = body.querySelector("[data-ses-rep]");
  if (box) box.innerHTML = sesRepHtml();
}
// Sending regions: a region is offered to customers once AWS grants SES production access there.
async function regionsCard(body, fresh = false) {
  let box = body.querySelector("[data-regions]");
  if (!box) { box = document.createElement("div"); box.dataset.regions = ""; box.className = "card card-pad"; box.style.marginTop = "14px"; body.appendChild(box); }
  box.innerHTML = `<div class="row-flex"><h3 class="h3">Sending regions</h3><span class="grow"></span><span class="spinner"></span></div>`;
  try {
    const { data } = await api("GET", `/dashboard/regions${fresh ? "?fresh=1" : ""}`);
    box.innerHTML = `<div class="row-flex"><h3 class="h3">Sending regions</h3><span class="grow"></span><button class="btn btn-secondary btn-sm" data-recheck>${icon("refresh", 12)} Check again</button></div>
      <p class="dim" style="font-size:calc(12.5px + var(--fs-up, 0px));margin:6px 0 12px">Customers can pick a region once AWS grants SES production access there. Request it in the AWS console: SES → Account dashboard → Request production access, in each region.</p>
      <div class="table-wrap"><table class="t"><thead><tr><th>Region</th><th>SES access</th><th>Offered to customers</th><th>Checked</th></tr></thead><tbody>${data.map((r) => `<tr><td>${esc(r.label)}</td><td>${r.error ? badge("Error", "red") + ` <span class="dim" style="font-size:calc(11.5px + var(--fs-up, 0px))">${esc(r.error)}</span>` : r.production ? badge("Production", "green") : badge("Sandbox", "yellow")}</td><td>${r.offered ? badge("Yes", "green") : badge("No", "gray")}</td><td class="dim">${esc(ago(r.checked_at))}</td></tr>`).join("")}</tbody></table></div>`;
    box.querySelector("[data-recheck]").onclick = () => regionsCard(body, true);
  } catch (e) { box.innerHTML = `<h3 class="h3">Sending regions</h3><p class="dim" style="margin-top:8px">${esc(e.message || "Couldn't load regions")}</p>`; }
}
function bars(map, total) {
  const rows = Object.entries<number>(map || {}).sort((a, b) => b[1] - a[1]);
  if (!rows.length) return `<p class="dim" style="margin-top:10px">No teams yet.</p>`;
  return `<div style="display:flex;flex-direction:column;gap:10px;margin-top:12px">${rows.map(([k, n]) => `<div><div class="row-flex" style="font-size:calc(12.5px + var(--fs-up, 0px))"><span>${esc(k.replace(/^\w/, (c) => c.toUpperCase()))}</span><span class="grow"></span><span class="dim">${num(n)} · ${pct(n, total)}</span></div><div class="meter"><i style="width:${total ? (n / total) * 100 : 0}%"></i></div></div>`).join("")}</div>`;
}

// ---------------------------------------------------------------- users
async function users(body) {
  let q = "", page = 0;
  const size = 50;
  body.innerHTML = `<div class="row-flex" style="margin-bottom:14px"><div class="input-wrap" style="max-width:320px;flex:1"><span class="lead">${icon("search", 13)}</span><input class="input" data-q placeholder="Search by email" style="padding-left:30px"></div><span class="grow"></span><span class="dim" data-total></span></div><div data-list></div>`;
  const list = body.querySelector("[data-list]");
  const load = async () => {
    const rows = await rpc("admin_users", { p_search: q, p_limit: size, p_offset: page * size });
    const banned = new Set(rows.length ? await rpc("admin_banned_users", { p_ids: rows.map((u) => u.id) }).catch(() => []) : []);
    byId = new Map(rows.map((u) => [u.id, u]));
    const total = rows[0]?.total || 0;
    body.querySelector("[data-total]").textContent = `${num(total)} users`;
    list.innerHTML = rows.length ? `<div class="table-wrap"><table class="t"><thead><tr><th>User</th><th>Sign-in</th><th>Teams</th><th>Signed up</th><th>Last seen</th>${can("admin") ? "<th></th>" : ""}</tr></thead><tbody>${rows.map((u) => `<tr>
        <td><div class="cell"><span class="avatar" style="width:24px;height:24px;font-size:calc(10.5px + var(--fs-up, 0px))">${esc(initials(u.name || u.email))}</span><div><div>${esc(u.name || u.email)}</div>${u.name ? `<div class="dim" style="font-size:calc(12px + var(--fs-up, 0px))">${esc(u.email)}</div>` : ""}</div></div></td>
        <td>${badge(u.provider === "email" ? "Email" : u.provider.replace(/^\w/, (c) => c.toUpperCase()), "gray")} ${u.confirmed ? "" : badge("Unconfirmed", "orange")}</td>
        <td>${(u.teams || []).map((t) => `<span class="row-flex" style="gap:6px;font-size:calc(12.5px + var(--fs-up, 0px))">${esc(t.name)} ${planBadge(t.plan)}</span>`).join("") || `<span class="dim">—</span>`}</td>
        <td class="muted" title="${esc(fmtDateTime(u.created_at))}">${fmtDate(u.created_at)}</td>
        <td class="muted">${banned.has(u.id) ? badge("Banned", "red") : u.last_sign_in_at ? ago(u.last_sign_in_at) : "Never"}</td>
        ${can("admin") ? `<td style="text-align:right">${banned.has(u.id) ? `<button class="btn btn-secondary btn-sm" data-unban="${esc(u.id)}">Unban</button>` : `<button class="btn btn-ghost btn-sm" data-ban="${esc(u.id)}" style="color:var(--red)">Ban</button>`}</td>` : ""}</tr>`).join("")}</tbody></table></div>${pagerHtml(page, total, size)}` : `<div class="card">${emptyState({ icon: "users", title: "No users found" })}</div>`;
  };
  let byId = new Map();
  on(body, "click", "[data-ban]", (_e, b) => {
    const u = byId.get(b.dataset.ban); if (!u) return;
    formModal({
      title: "Ban account", danger: true, submit: "Ban account",
      desc: `<b>${esc(u.email)}</b> will be signed out and can't sign in again. Teams they run alone stop sending. The addresses they've used the dashboard from are blocked for 90 days (from the API, the dashboard and new sign-ups), except ones a paying customer or an admin also uses. You can lift any of it later.`,
      fields: [{ name: "reason", label: "Reason (kept for your records)", placeholder: "Phishing" }],
      onSubmit: async (v) => { const r = await rpc("admin_ban_user", { p_user: u.id, p_banned: true, p_reason: v.reason || null }); toast(`Banned. ${r.ips_blocked} address${r.ips_blocked === 1 ? "" : "es"} blocked.`, "ok"); await load(); },
    });
  });
  on(body, "click", "[data-unban]", async (_e, b) => {
    const u = byId.get(b.dataset.unban); if (!u) return;
    if (!(await confirmModal({ title: "Unban account", desc: `<b>${esc(u.email)}</b> will be able to sign in again, and the addresses blocked with their ban are unblocked. Sending stays paused for their teams until you resume it under Teams.`, confirm: "Unban", danger: false }))) return;
    try { await rpc("admin_ban_user", { p_user: u.id, p_banned: false }); toast("Unbanned", "ok"); await load(); } catch (e) { errToast(e); }
  });
  on(body, "input", "[data-q]", debounce((_e, i) => { q = body.querySelector("[data-q]").value.trim(); page = 0; load().catch(errToast); }, 300));
  on(body, "click", "[data-page]", (_e, b) => { page = Number(b.dataset.page); load().catch(errToast); });
  await load();
}
const pagerHtml = (page, total, size) => total > size ? `<div class="row-flex" style="margin-top:12px;justify-content:flex-end;gap:8px"><span class="dim" style="font-size:calc(12px + var(--fs-up, 0px))">${num(page * size + 1)}–${num(Math.min(total, (page + 1) * size))} of ${num(total)}</span><button class="btn btn-secondary btn-sm" data-page="${page - 1}" ${page ? "" : "disabled"}>Previous</button><button class="btn btn-secondary btn-sm" data-page="${page + 1}" ${(page + 1) * size < total ? "" : "disabled"}>Next</button></div>` : "";

// ---------------------------------------------------------------- blocked IPs
// Addresses blocked when an account was banned. Each block ends after 90 days; lift one sooner if it's hitting
// someone else (mobile networks share addresses).
async function blocked(body) {
  const load = async () => {
    const rows = await rpc("admin_blocked_ips");
    body.innerHTML = `<p class="muted" style="margin:0 0 14px;max-width:720px">Addresses of banned accounts. They can't use the API or dashboard, or sign up. Blocks end on their own after 90 days. If one is stopping a real customer (mobile networks share addresses), unblock it.</p>
      ${rows.length ? `<div class="table-wrap"><table class="t"><thead><tr><th>Address</th><th>Banned account</th><th>Reason</th><th>Other accounts seen</th><th>Blocked</th><th>Ends</th><th></th></tr></thead><tbody>${rows.map((r) => `<tr>
        <td class="mono">${esc(r.ip)}</td><td>${esc(r.user_email || "—")}</td><td class="muted">${esc(r.reason || "—")}</td>
        <td>${r.other_accounts ? badge(`${num(r.other_accounts)} other`, "orange") : `<span class="dim">None</span>`}</td>
        <td class="muted" title="${esc(fmtDateTime(r.created_at))}">${ago(r.created_at)}</td><td class="muted">${r.expires_at ? fmtDate(r.expires_at) : "Never"}</td>
        <td style="text-align:right"><button class="btn btn-secondary btn-sm" data-unblock="${esc(r.ip)}">Unblock</button></td></tr>`).join("")}</tbody></table></div>`
        : `<div class="card">${emptyState({ icon: "shield", title: "No blocked addresses", desc: "Banning an account in Users blocks the addresses it used." })}</div>`}`;
  };
  on(body, "click", "[data-unblock]", async (_e, b) => {
    try { await rpc("admin_unblock_ip", { p_ip: b.dataset.unblock }); toast("Unblocked", "ok"); await load(); } catch (e) { errToast(e); }
  });
  await load();
}

// ---------------------------------------------------------------- teams
async function teams(body) {
  let q = "", page = 0, rows = [];
  const size = 50;
  body.innerHTML = `<div class="row-flex" style="margin-bottom:14px"><div class="input-wrap" style="max-width:320px;flex:1"><span class="lead">${icon("search", 13)}</span><input class="input" data-q placeholder="Search teams" style="padding-left:30px"></div><span class="grow"></span><span class="dim" data-total></span></div><div data-list></div>`;
  const list = body.querySelector("[data-list]");
  const load = async () => {
    const [r, paused] = await Promise.all([rpc("admin_teams", { p_search: q, p_limit: size, p_offset: page * size }), rpc("admin_paused_teams").catch(() => [])]);
    const pmap = new Map((paused || []).map((x) => [x.id, x]));
    rows = r.map((t) => ({ ...t, paused: pmap.get(t.id) || null }));
    const total = rows[0]?.total || 0;
    body.querySelector("[data-total]").textContent = `${num(total)} teams`;
    list.innerHTML = rows.length ? `<div class="table-wrap"><table class="t"><thead><tr><th>Team</th><th>Plan</th><th class="r">Emails (30d)</th><th class="r">Members</th><th class="r">Domains</th><th class="r">Credits</th><th>Created</th><th></th></tr></thead><tbody>${rows.map((t) => `<tr>
        <td><div>${esc(t.name)}</div><div class="dim" style="font-size:calc(12px + var(--fs-up, 0px))">${esc(t.owner_email || "")}</div></td>
        <td>${t.paused ? `<span title="${esc(t.paused.sending_paused_reason || "")}">${badge("Sending paused", "red")}</span> ` : ""}${planBadge(t.plan)} ${t.plan_marketing && t.plan_marketing !== "free" ? badge("Mkt " + t.plan_marketing, "gray") : ""} ${t.billing_status === "past_due" ? badge("Past due", "red") : t.billing_status === "cancelling" ? badge("Cancelling", "orange") : ""}</td>
        <td class="r">${num(t.emails_30d)}</td><td class="r">${num(t.members)}</td><td class="r">${num(t.domains)}</td><td class="r">${num(t.credits)}</td>
        <td class="muted">${fmtDate(t.created_at)}</td>
        <td class="act">${can("admin") ? `<button class="ibtn" data-team="${t.id}" title="Manage">${icon("more")}</button>` : ""}</td></tr>`).join("")}</tbody></table></div>${pagerHtml(page, total, size)}` : `<div class="card">${emptyState({ icon: "users", title: "No teams found" })}</div>`;
  };
  on(body, "input", "[data-q]", debounce(() => { q = body.querySelector("[data-q]").value.trim(); page = 0; load().catch(errToast); }, 300));
  on(body, "click", "[data-page]", (_e, b) => { page = Number(b.dataset.page); load().catch(errToast); });
  on(body, "click", "[data-team]", async (_e, b) => {
    const t = rows.find((r) => r.id === b.dataset.team);
    const { menu } = await import("../lib/ui.js");
    menu(b, [
      { header: t.name },
      t.paused
        ? { label: "Resume sending", icon: "play", onClick: async () => {
            if (!(await confirmModal({ title: "Resume sending", desc: `<b>${esc(t.name)}</b> was paused: ${esc(t.paused.sending_paused_reason || "no reason recorded")}<br><br>Resume only once they've explained the cause and cleaned their list.`, confirm: "Resume sending", danger: false }))) return;
            try { await rpc("admin_set_sending_paused", { p_team: t.id, p_paused: false }); toast("Sending resumed"); load(); } catch (e) { errToast(e); }
          } }
        : { label: "Pause sending", icon: "pause", onClick: () => formModal({ title: "Pause sending", desc: `Stop <b>${esc(t.name)}</b> from sending until you resume it. Their API calls get 403 sending_paused.`, fields: [{ name: "reason", label: "Reason (shown to the team)", placeholder: "High bounce rate from an imported list" }], submit: "Pause sending",
            async onSubmit(v) { await rpc("admin_set_sending_paused", { p_team: t.id, p_paused: true, p_reason: v.reason }); toast("Sending paused"); load(); } }) },
      { sep: true },
      ...["free", "starter", "pro", "scale", "enterprise"].filter((p) => p !== t.plan).map((p) => ({ label: `Set plan: ${p.replace(/^\w/, (c) => c.toUpperCase())}`, icon: "card", onClick: async () => {
        if (!(await confirmModal({ title: "Change plan", desc: `Move <b>${esc(t.name)}</b> to <b>${esc(p)}</b> without charging them? Use this for comps and support fixes.`, confirm: "Change plan", danger: false }))) return;
        try { await rpc("admin_set_plan", { p_team: t.id, p_plan: p }); toast("Plan updated"); load(); } catch (e) { errToast(e); }
      } })),
      { label: "Grant credits", icon: "zap", onClick: () => formModal({ title: "Grant credits", desc: `Add pay-as-you-go email credits to ${esc(t.name)}. Use a negative number to remove.`, fields: [{ name: "n", label: "Emails", placeholder: "10000" }], submit: "Grant", validate: (v) => /^-?\d+$/.test(v.n.trim()),
        async onSubmit(v) { const left = await rpc("admin_grant_credits", { p_team: t.id, p_emails: Number(v.n) }); toast(`${t.name} now has ${num(left)} credits`); load(); } }) },
    ], { align: "right", width: 220 });
  });
  await load();
}

// ---------------------------------------------------------------- admins (owners only)
async function admins(body) {
  const ROLES = [["support", "Support", "Answers customers in Support: gets an email for every new request, accepts conversations, replies and resolves them. Sees the leaderboard, nothing else."],
    ["viewer", "Usage viewer", "Sees the overview, users, teams, usage, revenue and the support leaderboard. Can’t change anything or read support conversations."],
    ["admin", "Admin", "Everything except managing admins: plans, credits, pausing sending, support (with request emails) and website settings."],
    ["owner", "Owner", "Everything, including adding and removing admins."]];
  const roleOpts = (cur) => ROLES.map(([v, l]) => `<option value="${v}" ${v === cur ? "selected" : ""}>${l}</option>`).join("");
  let rows = [];
  const load = async () => {
    rows = await rpc("admin_list_admins");
    body.innerHTML = `<div class="row-flex" style="margin-bottom:14px"><div><h3 style="margin:0;font-size:max(15px, var(--fs-min, 0px))">Admins</h3><p class="dim" style="margin:4px 0 0;font-size:calc(12.5px + var(--fs-up, 0px))">People who can open this admin area, and what they can do.</p></div><span class="grow"></span><button class="btn btn-primary btn-sm" data-add>${icon("plus", 12)} Add admin</button></div>
      <div class="table-wrap"><table class="t"><thead><tr><th>Person</th><th>Role</th><th>Added</th><th></th></tr></thead><tbody>${rows.map((a) => `<tr>
        <td><div class="cell"><span class="avatar" style="width:24px;height:24px;font-size:calc(10.5px + var(--fs-up, 0px))">${esc(initials(a.full_name || a.email))}</span><div><div>${esc(a.full_name || a.email)}${a.user_id === state.user?.id ? ' <span class="dim">(you)</span>' : ""}</div>${a.full_name ? `<div class="dim" style="font-size:calc(12px + var(--fs-up, 0px))">${esc(a.email)}</div>` : ""}</div></div></td>
        <td><select class="input" data-role="${a.user_id}" style="height:30px;width:auto;min-width:150px">${roleOpts(a.role)}</select></td>
        <td class="muted">${fmtDate(a.created_at)}${a.added_by_email ? `<div class="dim" style="font-size:calc(12px + var(--fs-up, 0px))">by ${esc(a.added_by_email)}</div>` : ""}</td>
        <td class="act"><button class="ibtn" data-remove="${a.user_id}" title="Remove admin access">${icon("trash")}</button></td></tr>`).join("")}</tbody></table></div>
      <div class="card card-pad" style="margin-top:16px"><h3 style="margin:0 0 10px;font-size:max(14px, var(--fs-min, 0px))">What each role can do</h3>${ROLES.map(([, l, d]) => `<div style="display:flex;gap:10px;padding:6px 0"><b style="min-width:110px">${l}</b><span class="muted">${d}</span></div>`).join("")}</div>`;
  };
  on(body, "change", "[data-role]", async (_e, sel) => {
      const a = rows.find((x) => x.user_id === sel.dataset.role);
      try { await rpc("admin_set_admin_role", { p_user: a.user_id, p_role: sel.value }); toast(`${a.full_name || a.email} is now ${ROLE_LABEL[sel.value]}`); if (a.user_id === state.user?.id) return location.reload(); await load(); }
      catch (e) { errToast(e); sel.value = a.role; }
    });
    on(body, "click", "[data-remove]", async (_e, b) => {
      const a = rows.find((x) => x.user_id === b.dataset.remove);
      if (!(await confirmModal({ title: "Remove admin access", desc: `<b>${esc(a.full_name || a.email)}</b> will no longer be able to open the admin area. Their own Delivrie account and teams aren’t affected.`, confirm: "Remove access" }))) return;
      try { await rpc("admin_remove_admin", { p_user: a.user_id }); toast("Admin access removed"); if (a.user_id === state.user?.id) return location.assign("/emails"); await load(); } catch (e) { errToast(e); }
    });
    on(body, "click", "[data-add]", () => formModal({ title: "Add a person", desc: "Give someone Support to have them answer customers, or an admin role for more. They need a Delivrie account first. Ask them to sign up at delivrie.io, then add them here with the email they used.",
      fields: [{ name: "email", label: "Email", type: "email", placeholder: "teammate@company.com" }, { name: "role", label: "Role", type: "select", value: "support", options: ROLES.map(([value, label]) => ({ value, label })) }],
      submit: "Add admin", validate: (v) => /@/.test(v.email || ""),
      async onSubmit(v) { await rpc("admin_add_admin", { p_email: v.email.trim(), p_role: v.role }); toast(`${v.email.trim()} added as ${ROLE_LABEL[v.role]}`); await load(); } }));
  await load();
}

// ---------------------------------------------------------------- revenue
async function revenue(body) {
  const [o, inv] = await Promise.all([rpc("admin_overview"), rpc("admin_invoices", { p_limit: 200 })]);
  const paying = Object.entries<number>(o.plans || {}).filter(([p]) => p !== "free").reduce((s, [, n]) => s + n, 0);
  // Every payment in US dollars. Naira payments (the retired Paystack plans) are converted at the official rate when they were paid
  // (about ₦1,347 to the dollar), with the naira amount shown alongside.
  const paidRows = inv.filter((i) => i.status === "success");
  const usd = (i) => i.amount_usd ?? (String(i.currency).toUpperCase() === "USD" ? i.amount : 0);
  const amountCell = (i) => String(i.currency).toUpperCase() === "USD" ? money(i.amount, "USD")
    : `${money(usd(i), "USD")}<div class="dim" style="font-size:calc(11.5px + var(--fs-up, 0px))">${esc(money(i.amount, String(i.currency).toUpperCase()))} · Paystack</div>`;
  const ngnNote = (k) => o[k] ? `incl. ${esc(money(o[k], "NGN"))} converted` : "";
  body.innerHTML = `<div class="stat-grid" style="grid-template-columns:repeat(4,1fr)">
      <div class="stat"><div class="k">Paying teams</div><div class="v">${num(paying)}</div></div>
      <div class="stat"><div class="k">Last 30 days</div><div class="v">${esc(money(o.revenue_30d?.USD || 0, "USD"))}</div><div class="dim" style="font-size:calc(11.5px + var(--fs-up, 0px));margin-top:4px">${ngnNote("revenue_ngn_30d")}</div></div>
      <div class="stat"><div class="k">All time</div><div class="v">${esc(money(o.revenue_all?.USD || 0, "USD"))}</div><div class="dim" style="font-size:calc(11.5px + var(--fs-up, 0px));margin-top:4px">${ngnNote("revenue_ngn_all")}</div></div>
      <div class="stat"><div class="k">Payments</div><div class="v">${num(paidRows.length)}</div><div class="dim" style="font-size:calc(11.5px + var(--fs-up, 0px));margin-top:4px">${num(inv.length - paidRows.length)} failed</div></div>
    </div>
    <h3 class="section-title">Payments <span class="dim" style="font-weight:400">in US dollars</span></h3>
    ${inv.length ? `<div class="table-wrap"><table class="t"><thead><tr><th>Date</th><th>Team</th><th>Item</th><th class="r">Amount</th><th>Status</th><th>Reference</th></tr></thead><tbody>${inv.map((i) => `<tr><td class="muted">${fmtDateTime(i.created_at)}</td><td>${esc(i.team || "—")}</td><td>${esc(i.kind)}${i.plan ? ` · ${esc(i.plan)}` : ""}</td><td class="r" style="font-variant-numeric:tabular-nums">${amountCell(i)}</td><td>${i.status === "success" ? badge("Paid", "green") : badge("Failed", "red")}</td><td class="mono dim" style="font-size:calc(11.5px + var(--fs-up, 0px))">${esc(i.reference)}</td></tr>`).join("")}</tbody></table></div>`
      : `<div class="card">${emptyState({ icon: "card", title: "No payments yet", desc: "Payments show up here as they land." })}</div>`}`;
}

// ---------------------------------------------------------------- inbox
async function inbox(body) {
  const rows = await rpc("admin_inbox", { p_limit: 100 });
  const impact = { low: "gray", medium: "yellow", high: "orange", critical: "red" };
  body.innerHTML = rows.length ? `<div style="display:flex;flex-direction:column;gap:10px" class="stagger">${rows.map((r) => `<div class="card card-pad"><div class="row-flex" style="gap:8px">${r.kind === "support" ? badge("Support", "blue") : r.kind === "sales" ? badge("Sales lead", "green") : badge("Feedback", "gray")}${r.impact ? badge(r.impact, impact[r.impact] || "gray") : ""}<b style="font-weight:500">${esc(r.subject || (r.kind === "feedback" ? "Feedback" : ""))}</b><span class="grow"></span><span class="dim" style="font-size:calc(12px + var(--fs-up, 0px))" title="${esc(fmtDateTime(r.created_at))}">${ago(r.created_at)}</span></div>
      <p style="margin:10px 0;white-space:pre-wrap;font-size:calc(13px + var(--fs-up, 0px));line-height:1.55">${esc(r.message)}</p>
      <div class="row-flex dim" style="font-size:calc(12px + var(--fs-up, 0px));gap:6px">${icon("users", 12)} ${esc(r.email || "Unknown")}${r.team ? ` · ${esc(r.team)}` : ""}<span class="grow"></span>${r.email ? `<a class="btn btn-secondary btn-sm" href="mailto:${esc(r.email)}?subject=${encodeURIComponent("Re: " + (r.subject || "Your Delivrie feedback"))}" data-native>Reply</a>` : ""}</div></div>`).join("")}</div>` : `<div class="card">${emptyState({ icon: "mail", title: "Inbox zero", desc: "Support requests and feedback from the app land here." })}</div>`;
}

// ---------------------------------------------------------------- website
// Public pages read these settings from /api/public/site (cached ~30 seconds). See site-config.ts and middleware.ts.
const SITE_PAGES: [path: string, name: string, locked?: boolean][] = [
  ["/", "Home", true], ["/pricing", "Pricing"], ["/resend-alternative", "Resend alternative"], ["/brevo-alternative", "Brevo alternative"], ["/about", "About"], ["/customers", "Customers"], ["/careers", "Careers"],
  ["/blog", "Blog"], ["/changelog", "Changelog"], ["/brand", "Brand"], ["/status", "Status"], ["/contact-sales", "Contact sales"],
  ["/support", "Support", true], ["/terms", "Terms", true], ["/privacy", "Privacy", true], ["/dpa", "DPA"], ["/acceptable-use", "Acceptable use"],
  ["/cookies", "Cookies"], ["/subprocessors", "Subprocessors"], ["/security", "Security"],
];
const CMP_PRICES = [["r20", "Resend at 20,000 emails ($)", 20], ["b20", "Brevo at 20,000 emails ($)", 32], ["r100", "Resend at 100,000 emails ($)", 65], ["b100", "Brevo at 100,000 emails ($)", 82], ["rOver", "Resend per extra 1,000 ($)", 0.9], ["bBrand", "Brevo footer removal ($/month)", 12]];
const SITE_TABS = [["pages", "Pages"], ["banner", "Announcement bar"], ["compare", "Compare"], ["edit", "Edit pages"], ["payments", "Payments"]];

async function website(body, ctx) {
  const sub = new URLSearchParams(location.search).get("s") || "pages";
  const raw = (await rpc("admin_site_get")) || {};
  const cfg = { pages: raw.pages?.value || {}, banner: raw.banner?.value || {}, compare: raw.compare?.value || {}, edits: raw.edits?.value || {}, billing: raw.billing?.value || {} };
  const save = async (key, value, msg = "Saved. Live within a minute.") => { await rpc("admin_site_set", { p_key: key, p_value: value }); cfg[key] = value; toast(msg); };
  body.innerHTML = `<div class="seg-tabs">${SITE_TABS.map(([k, l]) => `<a class="seg-tab ${k === sub ? "on" : ""}" href="/admin/website?s=${k}" style="display:inline-flex;align-items:center">${l}</a>`).join("")}</div><div data-site></div>`;
  const el = body.querySelector("[data-site]");
  const views: Record<string, (el: any, cfg: any, save: any, ctx?: any) => unknown> = { pages: sitePages, banner: siteBanner, compare: siteCompare, edit: siteEditor, payments: sitePayments };
  const view = views[sub] || sitePages;
  await view(el, cfg, save, ctx);
}

function sitePages(el, cfg, save) {
  el.innerHTML = `<p class="dim" style="margin:0 0 14px;font-size:calc(13px + var(--fs-up, 0px))">A page that's off shows "not found" and its links disappear from the menus and footer. Home, Support, Terms and Privacy always stay on, because app directories (ChatGPT, Claude) link to them.</p>
    <div class="table-wrap"><table class="t"><thead><tr><th>Page</th><th>Address</th><th class="r">On</th></tr></thead><tbody>${SITE_PAGES.map(([path, name, locked]) => `<tr>
      <td>${esc(name)}</td><td class="muted mono" style="font-size:calc(12px + var(--fs-up, 0px))"><a href="${path}" target="_blank" rel="noopener">delivrie.io${path === "/" ? "" : path}</a></td>
      <td class="r">${locked ? `<span class="dim" style="font-size:calc(12px + var(--fs-up, 0px))">Always on</span>` : `<input type="checkbox" class="toggle" data-page="${path}" ${cfg.pages[path] === false ? "" : "checked"} aria-label="${esc(name)} on">`}</td></tr>`).join("")}</tbody></table></div>`;
  on(el, "change", "[data-page]", async (_e, t) => {
    const next = { ...cfg.pages };
    if (t.checked) delete next[t.dataset.page]; else next[t.dataset.page] = false;
    try { await save("pages", next, t.checked ? "Page is on" : "Page is off. It shows \"not found\" within a minute."); } catch (e) { t.checked = !t.checked; errToast(e); }
  });
}

// Payments are in US dollars through Stripe for everyone. Turning Stripe off pauses new payments; the billing server reads this within a minute, nothing needs deploying.
function sitePayments(el, cfg, save) {
  const draw = () => {
    const on = cfg.billing?.stripe !== false;
    el.innerHTML = `<div class="card card-pad" style="max-width:640px;display:flex;flex-direction:column;gap:16px">
        <label class="row-flex" style="justify-content:space-between;gap:16px"><span><b style="font-weight:500">Stripe · US dollars</b><div class="dim" style="font-size:calc(12px + var(--fs-up, 0px))">Every plan, top-up and overage, in every country. Card payments with Stripe Tax.</div></span><input type="checkbox" class="toggle" data-pay="stripe" ${on ? "checked" : ""} aria-label="Stripe on"></label>
        <div class="banner" style="margin:0">${on ? `${badge("Live", "green")} <span>Everyone pays in US dollars through Stripe.</span>` : `${badge("Paused", "red")} <span>Payments are paused. Nobody can upgrade or top up until Stripe is switched back on.</span>`}</div></div>`;
  };
  draw();
  on(el, "change", "[data-pay]", async (_e, t) => {
    if (!t.checked && !(await confirmModal({ title: "Pause payments?", desc: "With Stripe off nobody can upgrade or top up. Plans already running keep working and renewing.", confirm: "Pause payments" }))) { t.checked = true; return; }
    try { await save("billing", { stripe: t.checked }, "Saved. Applies within a minute."); } catch (e) { errToast(e); }
    draw();
  });
}

function siteBanner(el, cfg, save) {
  const b = { on: false, text: "", link: "", link_text: "", tone: "warm", ...cfg.banner };
  el.innerHTML = `<div class="card card-pad" style="max-width:640px;display:flex;flex-direction:column;gap:14px">
      <label class="row-flex" style="justify-content:space-between"><span><b style="font-weight:500">Show the announcement bar</b><div class="dim" style="font-size:calc(12px + var(--fs-up, 0px))">A strip at the very top of every public page. Visitors can close it.</div></span><input type="checkbox" class="toggle" name="on" ${b.on ? "checked" : ""}></label>
      ${fieldHtml({ name: "text", label: "Message", value: b.text, placeholder: "SMTP is live: send from WordPress, Laravel and more" })}
      <div class="row-flex" style="gap:12px;align-items:flex-start"><div style="flex:2">${fieldHtml({ name: "link", label: "Link", value: b.link, placeholder: "/docs/smtp", optional: true })}</div><div style="flex:1">${fieldHtml({ name: "link_text", label: "Link text", value: b.link_text, placeholder: "Learn more", optional: true })}</div></div>
      
      <div class="field"><label>Preview</label><div data-preview></div></div>
      <div class="row-flex" style="justify-content:flex-end"><button class="btn btn-primary" data-save>Save</button></div></div>`;
  const read = () => ({ on: el.querySelector("[name=on]").checked, text: el.querySelector("[name=text]").value.trim(), link: el.querySelector("[name=link]").value.trim(), link_text: el.querySelector("[name=link_text]").value.trim() });
  const preview = () => { const v = read(); el.querySelector("[data-preview]").innerHTML = v.text ? `<div style="padding:9px 14px;border-radius:8px;text-align:center;font-size:calc(13px + var(--fs-up, 0px));font-weight:500;background:#f4eee4;color:#1f1d1e">${esc(v.text)}${v.link ? ` <span style="color:#67625f;font-weight:400">${esc((v.link_text || "Learn more").replace(/[\s→>»]+$/, ""))} →</span>` : ""}${v.on ? "" : ` <span style="opacity:.6">(hidden)</span>`}</div>` : `<div class="dim" style="font-size:calc(12.5px + var(--fs-up, 0px))">Type a message to see it here.</div>`; };
  el.addEventListener("input", preview); el.addEventListener("change", preview); preview();
  el.querySelector("[data-save]").addEventListener("click", async (e) => {
    const v = read();
    if (v.on && !v.text) return toast("Add a message first", "error");
    if (v.link && !/^(https?:\/\/|\/|mailto:)/.test(v.link)) return toast("Links start with /, https:// or mailto:", "error");
    e.target.disabled = true; try { await save("banner", v); } catch (err) { errToast(err); } e.target.disabled = false;
  });
}

async function siteCompare(el, cfg, save) {
  const c = { fx: "", date: "", prices: {}, rows: {}, ...cfg.compare };
  el.innerHTML = `<div class="card card-pad row-flex" style="gap:10px"><span class="spinner"></span><span class="dim">Loading the comparison…</span></div>`;
  // The default rows and notes live in pricing.ts; read them from the pricing page.
  const rows = await new Promise<{ id: string; label: string; explain: string }[]>((resolve) => {
    const f = document.createElement("iframe"); f.style.cssText = "position:absolute;width:1px;height:1px;opacity:0;pointer-events:none"; f.src = "/pricing?dlv_edit=1";
    const done = (v) => { f.remove(); resolve(v); };
    f.onload = () => { try { done(f.contentWindow.DelivrieCompareRows()); } catch { done([]); } };
    setTimeout(() => done([]), 8000); document.body.appendChild(f);
  });
  const inp = (name, value, ph, w = "") => `<input class="input" name="${name}" value="${esc(value ?? "")}" placeholder="${esc(ph ?? "")}" style="${w}">`;
  el.innerHTML = `<p class="dim" style="margin:0 0 14px;font-size:calc(13px + var(--fs-up, 0px))">Figures and notes for Pricing → Compare. Leave a box empty to keep the default (shown in grey). Delivrie's own prices come from your plans and aren't edited here.</p>
    <div class="card card-pad" style="display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px">
      <div class="field"><label>Prices checked on</label>${inp("date", c.date, "13 November 2026")}</div>
      ${CMP_PRICES.map(([k, l, d]) => `<div class="field"><label>${l}</label>${inp("p_" + k, c.prices?.[k], String(d))}</div>`).join("")}
    </div>
    <h3 class="section-title">Rows</h3>
    <div style="display:flex;flex-direction:column;gap:10px">${(rows.length ? rows : Object.keys(c.rows).map((id) => ({ id, label: id, explain: "" }))).map((r) => { const o = c.rows?.[r.id] || {}; return `<div class="card card-pad" data-row="${r.id}" style="display:flex;flex-direction:column;gap:10px">
      <div class="row-flex" style="gap:10px"><b style="font-weight:500">${esc(r.label)}</b><span class="grow"></span><label class="row-flex dim" style="gap:6px;font-size:calc(12px + var(--fs-up, 0px))">Show row <input type="checkbox" class="toggle" name="show" ${o.hidden ? "" : "checked"}></label></div>
      <div style="display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px">
        <div class="field"><label>Row name</label>${inp("label", o.label, r.label)}</div>
        <div class="field"><label>Delivrie</label>${inp("delivrie", o.delivrie, "Default")}</div>
        <div class="field"><label>Resend</label>${inp("resend", o.resend, "Default")}</div>
        <div class="field"><label>Brevo</label>${inp("brevo", o.brevo, "Default")}</div></div>
      <div class="field"><label>Explain note</label><textarea class="textarea" name="explain" rows="3" placeholder="${esc(r.explain)}">${esc(o.explain || "")}</textarea></div></div>`; }).join("")}</div>
    <div class="row-flex" style="justify-content:flex-end;margin-top:14px;position:sticky;bottom:12px"><button class="btn btn-primary" data-save>Save comparison</button></div>`;
  el.querySelector("[data-save]").addEventListener("click", async (e) => {
    const v = (n) => el.querySelector(`[name="${n}"]`).value.trim();
    const next: { prices: Record<string, number>; rows: Record<string, any>; date?: string } = { prices: {}, rows: {} };
    if (v("date")) next.date = v("date");
    for (const [k] of CMP_PRICES) { const x = v("p_" + k); if (x) { if (!(+x >= 0)) return toast("Prices must be numbers", "error"); next.prices[k] = +x; } }
    el.querySelectorAll("[data-row]").forEach((r) => {
      const o: Record<string, any> = {}; ["label", "delivrie", "resend", "brevo", "explain"].forEach((n) => { const x = r.querySelector(`[name="${n}"]`).value.trim(); if (x) o[n] = x; });
      if (!r.querySelector("[name=show]").checked) o.hidden = true;
      if (Object.keys(o).length) next.rows[r.dataset.row] = o;
    });
    e.target.disabled = true; try { await save("compare", next); } catch (err) { errToast(err); } e.target.disabled = false;
  });
}

function siteEditor(el, cfg, save) {
  let path = new URLSearchParams(location.search).get("p") || "/";
  let pending: Record<string, any> = {}, selected = null, frameWin = null;
  el.innerHTML = `<div class="row-flex" style="gap:10px;margin-bottom:12px;flex-wrap:wrap">
      <select class="input" data-path style="width:auto;min-width:200px">${SITE_PAGES.map(([p, n]) => `<option value="${p}" ${p === path ? "selected" : ""}>${esc(n)}  (${p})</option>`).join("")}</select>
      <span class="dim" style="font-size:calc(12.5px + var(--fs-up, 0px))">Click any text on the page to edit it. Links can also change where they go.</span><span class="grow"></span>
      <span class="dim" data-count style="font-size:calc(12.5px + var(--fs-up, 0px))"></span>
      <button class="btn btn-ghost" data-discard>Discard</button><button class="btn btn-primary" data-save>Save changes</button></div>
    <div style="display:grid;grid-template-columns:minmax(0,1fr) 280px;gap:14px;align-items:start">
      <div class="card" style="overflow:hidden;height:calc(100vh - 230px);min-height:520px"><iframe data-frame title="Page editor" style="width:100%;height:100%;border:0;background:#fff"></iframe></div>
      <div class="card card-pad" data-side style="position:sticky;top:12px;display:flex;flex-direction:column;gap:12px;font-size:calc(13px + var(--fs-up, 0px))"></div></div>`;
  const frame = el.querySelector("[data-frame]"), side = el.querySelector("[data-side]");
  const count = () => { const n = Object.keys(pending).length; el.querySelector("[data-count]").textContent = n ? `${n} unsaved change${n === 1 ? "" : "s"}` : ""; };
  const sideIdle = () => {
    const saved = Object.entries<any>(cfg.edits[path] || {});
    side.innerHTML = `<b style="font-weight:500">Edits on this page</b>${saved.length ? `<div style="display:flex;flex-direction:column;gap:8px">${saved.map(([k, v]) => `<div class="row-flex" style="gap:8px;align-items:flex-start"><div style="flex:1;min-width:0"><div class="dim" style="font-size:calc(11.5px + var(--fs-up, 0px));text-decoration:line-through;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(v.orig || "")}</div><div style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(stripTags(v.html))}</div></div><button class="ibtn" title="Undo this edit" data-undo="${esc(k)}">${icon("x", 12)}</button></div>`).join("")}</div>` : `<div class="dim">None yet. Click text on the page to change it.</div>`}
      <div class="dim" style="font-size:calc(11.5px + var(--fs-up, 0px));line-height:1.5">If a page is later rewritten in code, edits to text that no longer exists simply stop applying.</div>`;
  };
  const sideSelected = (k) => {
    const isLink = k.el.tagName === "A";
    side.innerHTML = `<b style="font-weight:500">Editing</b><div class="dim" style="font-size:calc(12px + var(--fs-up, 0px))">Original: ${esc(k.text).slice(0, 160)}</div>
      ${isLink ? fieldHtml({ name: "href", label: "Link goes to", value: k.el.getAttribute("href") || "", placeholder: "/signup" }) : ""}
      <div class="dim" style="font-size:calc(11.5px + var(--fs-up, 0px))">Use Ctrl/⌘ + B or I for bold and italic.</div>
      <div class="row-flex" style="gap:8px"><button class="btn btn-secondary btn-sm" data-revert>Back to original</button><button class="btn btn-ghost btn-sm" data-done>Done</button></div>`;
    side.querySelector("[name=href]")?.addEventListener("input", (e) => { k.el.setAttribute("href", e.target.value.trim()); record(k); });
  };
  const record = (k) => {
    const D = frameWin.DelivrieSite, html = D.clean(k.el.innerHTML).trim(), href = k.el.tagName === "A" ? k.el.getAttribute("href") : undefined;
    const before = k.base;
    if (html === before.html && href === before.href) delete pending[k.key];
    else pending[k.key] = { html, ...(href !== undefined && href !== k.origHref ? { href } : {}), orig: k.text };
    count();
  };
  const load = () => {
    pending = {}; selected = null; count(); sideIdle();
    frame.src = path + (path.includes("?") ? "&" : "?") + "dlv_edit=1";
    history.replaceState(null, "", `/admin/website?s=edit&p=${encodeURIComponent(path)}`);
  };
  frame.addEventListener("load", () => {
    frameWin = frame.contentWindow; const doc = frame.contentDocument, D = frameWin.DelivrieSite;
    if (!D) { side.innerHTML = `<div class="dim">This page can't be edited here.</div>`; return; }
    D.set({ ...cfg, edits: { ...cfg.edits } });
    const st = doc.createElement("style");
    st.textContent = "[data-dlv-ed]{cursor:text}[data-dlv-ed]:hover{outline:1px dashed #fad600;outline-offset:2px}[data-dlv-ed].dlv-sel{outline:2px solid #fad600;outline-offset:2px}[data-dlv-ed].dlv-changed{box-shadow:0 2px 0 #fad600}";
    doc.head.appendChild(st);
    const map = new Map();
    for (const k of D.keyed()) { k.el.setAttribute("data-dlv-ed", ""); k.base = { html: D.clean(k.el.innerHTML).trim(), href: k.el.tagName === "A" ? k.el.getAttribute("href") : undefined }; k.origHref = cfg.edits[path]?.[k.key]?.href ? undefined : k.base.href; map.set(k.el, k); if (cfg.edits[path]?.[k.key]) k.el.classList.add("dlv-changed"); }
    // links and buttons shouldn't navigate while editing
    doc.addEventListener("click", (e) => {
      const t = (e.target as Element).closest<HTMLElement>("[data-dlv-ed]"); if ((e.target as Element).closest<HTMLElement>("a,button,summary")) e.preventDefault();
      if (!t) return;
      const k = map.get(t); if (!k) return;
      if (selected && selected !== k) { selected.el.contentEditable = "false"; selected.el.classList.remove("dlv-sel"); }
      selected = k; t.contentEditable = "true"; t.classList.add("dlv-sel"); t.focus(); sideSelected(k);
    }, true);
    doc.addEventListener("input", (e) => { const k = map.get((e.target as Element).closest<HTMLElement>("[data-dlv-ed]")); if (k) { record(k); k.el.classList.toggle("dlv-changed", !!pending[k.key] || !!cfg.edits[path]?.[k.key]); } });
    doc.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey && selected) { e.preventDefault(); } if (e.key === "Escape" && selected) { selected.el.blur(); } });
    side.onclick = (e) => {
      if ((e.target as Element).closest<HTMLElement>("[data-done]") && selected) { selected.el.contentEditable = "false"; selected.el.classList.remove("dlv-sel"); selected = null; sideIdle(); }
      if ((e.target as Element).closest<HTMLElement>("[data-revert]") && selected) { pending[selected.key] = null; count(); toast("Will go back to the original when you save"); }
      const u = (e.target as Element).closest<HTMLElement>("[data-undo]"); if (u) { pending[u.dataset.undo] = null; count(); u.closest<HTMLElement>(".row-flex").style.opacity = ".4"; }
    };
  });
  el.querySelector("[data-path]").addEventListener("change", (e) => { if (Object.keys(pending).length && !confirm("Discard unsaved changes on this page?")) { e.target.value = path; return; } path = e.target.value; load(); });
  el.querySelector("[data-discard]").addEventListener("click", () => load());
  el.querySelector("[data-save]").addEventListener("click", async (e) => {
    if (!Object.keys(pending).length) return toast("No changes to save");
    const page = { ...(cfg.edits[path] || {}) };
    for (const [k, v] of Object.entries(pending)) { if (v === null) delete page[k]; else page[k] = { ...(page[k] || {}), ...v }; }
    const edits = { ...cfg.edits }; if (Object.keys(page).length) edits[path] = page; else delete edits[path];
    e.target.disabled = true;
    try { await save("edits", edits, "Saved. Visitors see it within a minute."); load(); } catch (err) { errToast(err); }
    e.target.disabled = false;
  });
  window.addEventListener("beforeunload", (e) => { if (Object.keys(pending).length) { e.preventDefault(); e.returnValue = ""; } });
  load();
}
const stripTags = (h) => String(h || "").replace(/<[^>]+>/g, "");

// ---------------------------------------------------------------- support leaderboard
// Everyone in the admin area sees it. The points are spelled out under the table so nobody has to guess.
async function leaderboard(body) {
  let days = 30;
  const mins = (m) => m == null ? "—" : m < 1 ? "under a minute" : m < 60 ? `${Math.round(m)} min` : m < 1440 ? `${(m / 60).toFixed(1).replace(/\.0$/, "")} h` : `${(m / 1440).toFixed(1).replace(/\.0$/, "")} days`;
  const medal = (i) => ["🥇", "🥈", "🥉"][i] || `<span class="dim">${i + 1}</span>`;
  const draw = async () => {
    body.innerHTML = `<div class="card card-pad row-flex"><span class="spinner"></span><span class="muted">Loading…</span></div>`;
    let r;
    try { r = await api("GET", `/support/admin/leaderboard?days=${days}`); } catch (e) { body.innerHTML = `<div class="card">${emptyState({ icon: "alert", title: "Couldn't load", desc: esc(e.message) })}</div>`; return; }
    const t = r.totals;
    const rows = r.data;
    body.innerHTML = `<div class="row-flex" style="margin-bottom:14px"><div><h3 style="margin:0;font-size:max(15px, var(--fs-min, 0px))">Support leaderboard</h3><p class="dim" style="margin:4px 0 0;font-size:calc(12.5px + var(--fs-up, 0px))">Who’s helping customers most effectively, over requests opened in the last ${days} days.</p></div><span class="grow"></span><div class="seg">${[7, 30, 90].map((d) => `<button class="${d === days ? "on" : ""}" data-days="${d}">${d}d</button>`).join("")}</div></div>
      <div class="stat-grid" style="grid-template-columns:repeat(4,1fr)">
        <div class="stat"><div class="k">Requests</div><div class="v">${num(t.requests)}</div></div>
        <div class="stat"><div class="k">Resolved</div><div class="v">${num(t.resolved)}</div></div>
        <div class="stat"><div class="k">Waiting to be accepted</div><div class="v">${num(t.waiting)}</div></div>
        <div class="stat"><div class="k">Median first reply</div><div class="v">${esc(mins(t.median_first_reply_min))}</div></div></div>
      ${rows.length ? `<div class="table-wrap"><table class="t lb"><thead><tr><th style="width:44px"></th><th>Person</th><th class="r">Points</th><th class="r">Accepted</th><th class="r">Resolved</th><th class="r">First reply (median)</th><th class="r">Within an hour</th><th>Ratings</th><th class="r">Replies</th></tr></thead><tbody>${rows.map((x, i) => `<tr class="${x.me ? "me" : ""}">
        <td style="font-size:16px;text-align:center">${x.score > 0 ? medal(i) : `<span class="dim">${i + 1}</span>`}</td>
        <td><div class="cell"><span class="avatar" style="width:26px;height:26px;font-size:calc(10.5px + var(--fs-up, 0px))">${esc(x.initials)}</span><div><div>${esc(x.name)}${x.me ? ' <span class="dim">(you)</span>' : ""}</div><div class="dim" style="font-size:calc(11.5px + var(--fs-up, 0px))">${esc(ROLE_LABEL[x.role] || "Former")}</div></div></div></td>
        <td class="r"><b style="font-weight:600">${num(x.score)}</b></td><td class="r">${num(x.accepted)}</td><td class="r">${num(x.resolved)}</td><td class="r">${esc(mins(x.median_first_reply_min))}</td><td class="r">${num(x.fast)}</td>
        <td>${x.ratings.great || x.ratings.okay || x.ratings.bad ? `${x.ratings.great ? badge(`${x.ratings.great} Great`, "green") : ""} ${x.ratings.okay ? badge(`${x.ratings.okay} Okay`, "yellow") : ""} ${x.ratings.bad ? badge(`${x.ratings.bad} Bad`, "red") : ""}${x.satisfaction != null ? ` <span class="dim">${x.satisfaction}%</span>` : ""}` : '<span class="dim">No ratings yet</span>'}</td>
        <td class="r">${num(x.replies)}</td></tr>`).join("")}</tbody></table></div>`
        : `<div class="card">${emptyState({ icon: "users", title: "No support people yet", desc: "Add people with the Support role in Admins." })}</div>`}
      <p class="dim" style="margin-top:12px;font-size:calc(12px + var(--fs-up, 0px));line-height:1.6">Points: 3 for each conversation resolved, 2 for each Great rating, 1 for each Okay, minus 2 for each Bad, and 1 for each first reply sent within an hour of the request. Ratings count for whoever accepted the conversation. Ties go to the faster median first reply. Satisfaction is Great plus half of Okay, over all ratings.</p>`;
  };
  on(body, "click", "[data-days]", (_e, b) => { days = Number(b.dataset.days); draw(); });
  await draw();
}

// ---------------------------------------------------------------- support chat
// Customers write from Contact support (dashboard and website). Every new request emails the whole support team;
// whoever accepts it takes it, and everyone sees who did.
async function support(body) {
  let filter = "open", threads = [], current = new URLSearchParams(location.search).get("t"), conv = null, timer = null, lastSig = "";
  body.innerHTML = `<div class="row-flex" style="margin-bottom:12px;gap:10px"><span class="dim" style="font-size:calc(12.5px + var(--fs-up, 0px))" data-sum></span><span class="grow"></span><button class="btn btn-secondary btn-sm" data-notify hidden>${icon("bell", 12)} Turn on desktop alerts</button></div>
    <div class="sp"><div class="sp-list"><div class="sp-filter">${[["waiting", "Waiting"], ["mine", "Mine"], ["open", "Open"], ["closed", "Resolved"], ["all", "All"]].map(([k, l]) => `<button class="seg-tab ${k === filter ? "on" : ""}" data-f="${k}" style="display:inline-flex;align-items:center;gap:5px">${l}<span data-fc="${k}"></span></button>`).join("")}</div><div class="sp-items" data-items></div></div>
    <div class="sp-conv" data-conv><div class="sp-empty">Pick a conversation.</div></div></div>`;
  const items = body.querySelector("[data-items]"), convEl = body.querySelector("[data-conv]"), notifyBtn = body.querySelector("[data-notify]");
  if ("Notification" in window && Notification.permission === "default") notifyBtn.hidden = false;
  notifyBtn.addEventListener("click", async () => { await Notification.requestPermission(); notifyBtn.hidden = Notification.permission !== "default"; });

  const RATE = { great: ["Great", "green"], okay: ["Okay", "yellow"], bad: ["Bad", "red"] };
  const listHtml = () => threads.length ? threads.map((t) => `<button class="sp-item ${t.id === current ? "on" : ""} ${t.unread ? "unread" : ""}" data-t="${t.id}"><div class="r1"><b>${esc(t.email || "Unknown")}</b><span class="dim" style="font-size:calc(11.5px + var(--fs-up, 0px))">${ago(t.last_message_at)}</span></div><div class="r2">${t.status === "open" ? (t.accepted ? `<span class="sp-acc ${t.accepted.me ? "me" : ""}" title="Accepted ${esc(ago(t.accepted.at))}">${esc(t.accepted.me ? "You" : t.accepted.name)}</span> ` : `${badge("Waiting", "yellow")} `) : ""}<span class="mono dim">${esc(t.ticket || "")}</span>${t.visitor ? " · visitor" : ""}${t.topic ? ` · ${esc(t.topic)}` : ""}${t.team ? " · " + esc(t.team) : ""}${t.rating ? ` · ${badge(RATE[t.rating][0], RATE[t.rating][1])}` : ""}</div><div class="r2">${t.last_author === "support" ? "You: " : ""}${esc(t.preview || "")}</div></button>`).join("") : `<div class="sp-empty">${{ waiting: "Nothing waiting to be accepted.", mine: "You haven’t accepted any open conversations.", open: "No open conversations.", closed: "No resolved conversations.", all: "No conversations yet." }[filter]}</div>`;
  const loadList = async (alert = false) => {
    const r = await api("GET", `/support/admin/threads?status=${filter}`);
    const before = new Map(threads.map((t) => [t.id, t.last_message_at]));
    if (alert && "Notification" in window && Notification.permission === "granted" && document.visibilityState !== "visible")
      for (const t of r.data) if (t.unread && t.last_author === "customer" && before.get(t.id) !== t.last_message_at) new Notification(`Support: ${t.email || "a customer"}`, { body: t.preview || "", tag: t.id });
    threads = r.data;
    body.querySelector("[data-sum]").textContent = [r.waiting ? `${r.waiting} waiting to be accepted` : "", r.unread_threads ? `${r.unread_threads} with unread messages` : "", r.mine ? `${r.mine} accepted by you` : ""].filter(Boolean).join(" · ") || "You're all caught up";
    body.querySelector('[data-fc="waiting"]').innerHTML = r.waiting ? `<span class="badge yellow">${r.waiting}</span>` : "";
    body.querySelector('[data-fc="mine"]').innerHTML = r.mine ? `<span class="badge gray">${r.mine}</span>` : "";
    document.title = (r.waiting || r.unread_threads ? `(${r.waiting || r.unread_threads}) ` : "") + "Support · Delivrie admin";
    items.innerHTML = listHtml();
  };
  // The customer's side: their messages, what the assistant told them before the handoff, and what they attached.
  const attHtml = (a) => a.type === "email"
    ? `<details class="sp-att"><summary>${icon("mail", 12)} <b>${esc(a.title)}</b> <span class="dim">${esc(a.sub)}</span></summary><pre class="code" style="padding:8px 10px;margin:6px 0 0;white-space:pre-wrap">${esc(a.raw || "")}</pre></details>`
    : `<div class="sp-att">${icon("globe", 12)} <b>${esc(a.title)}</b> <span class="dim" style="white-space:pre">${esc(a.sub)}</span></div>`;
  const msgHtml = (m) => {
    if (m.author === "system") return `<div class="sc-day">${esc(m.body)} · ${fmtDateTime(m.created_at)}</div>`;
    const who = m.author === "support" ? m.author_name : m.author === "bot" ? "Assistant" : (m.author_name || "Customer");
    const att = m.meta?.attachments?.length ? `<div style="display:flex;flex-direction:column;gap:6px;margin-top:6px">${m.meta.topic_label ? `<span class="dim" style="font-size:calc(11.5px + var(--fs-up, 0px))">Topic: ${esc(m.meta.topic_label)}</span>` : ""}${m.meta.attachments.map(attHtml).join("")}</div>` : m.meta?.topic_label ? `<span class="dim" style="font-size:calc(11.5px + var(--fs-up, 0px))">Topic: ${esc(m.meta.topic_label)}</span>` : "";
    const src = m.meta?.sources?.length ? `<div class="dim" style="font-size:calc(11px + var(--fs-up, 0px))">Sources: ${m.meta.sources.map((x) => esc(x.label)).join(", ")}${m.meta.helpful ? " · marked helpful" : ""}</div>` : "";
    return `<div class="sc-m ${m.author === "support" ? "me" : "them"} ${m.author === "bot" ? "bot" : ""}"><div class="sc-who">${esc(who)}</div><div class="sc-b">${esc(m.body)}</div>${src}${att}<div class="sc-t">${fmtDateTime(m.created_at)}</div></div>`;
  };
  const loadConv = async (keepDraft = true) => {
    if (!current) return;
    const r = await api("GET", `/support/admin/threads/${current}`);
    const sig = r.messages.length + ":" + (r.messages.at(-1)?.id || "") + ":" + r.thread.status + ":" + (r.thread.accepted?.name || "");
    if (sig === lastSig && keepDraft && conv) return;
    lastSig = sig; conv = r;
    const draft = convEl.querySelector("textarea")?.value || "";
    const t = r.thread;
    convEl.innerHTML = `<div class="sp-top"><div class="who"><b>${esc(t.email || "Unknown")} <span class="mono dim" style="font-weight:400">${esc(t.ticket || "")}</span></b><div>${t.topic ? `${esc(t.topic)} · ` : ""}${t.team ? `${esc(t.team.name)} · ${esc((t.team.plan_transactional || "free").replace(/^\w/, (c) => c.toUpperCase()))} plan · ` : ""}started ${fmtDate(t.created_at)}${t.customer_seen_at ? ` · last seen ${ago(t.customer_seen_at)}` : ""}${t.rating ? ` · rated ${badge(RATE[t.rating][0], RATE[t.rating][1])}${t.rating_comment ? ` “${esc(t.rating_comment)}”` : ""}` : ""}</div></div>
        ${t.status === "open" ? (!t.accepted ? `<button class="btn btn-primary btn-sm" data-accept>${icon("check", 12)} Accept</button>`
          : t.accepted.me ? `<span class="sp-acc me" title="Accepted ${esc(ago(t.accepted.at))}">${icon("check", 11)} You accepted this</span>`
          : `<span class="sp-acc" title="Accepted ${esc(ago(t.accepted.at))}">Accepted by ${esc(t.accepted.name)}</span><button class="btn btn-ghost btn-sm" data-accept="takeover">Take over</button>`) : ""}
        ${t.email ? `<a class="btn btn-ghost btn-sm" href="mailto:${esc(t.email)}">${icon("mail", 12)} Email</a>` : ""}<button class="btn btn-secondary btn-sm" data-status="${t.status === "open" ? "closed" : "open"}">${t.status === "open" ? `${icon("check", 12)} Mark resolved` : "Reopen"}</button></div>
      <div class="sc-body">${r.messages.map(msgHtml).join("")}</div>
      <form class="sc-form"><textarea rows="2" maxlength="5000" placeholder="Reply to ${esc(t.email || "the customer")}… Enter to send, Shift+Enter for a new line. Use \`\`\` for code, > for quoted headers."></textarea><button class="btn btn-primary" type="submit" aria-label="Send">${icon("send", 14)}</button></form>`;
    const ta = convEl.querySelector("textarea"); ta.value = draft;
    const scroller = convEl.querySelector(".sc-body"); scroller.scrollTop = scroller.scrollHeight;
    ta.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); convEl.querySelector("form").requestSubmit(); } });
    // Lets the customer see "typing…" while someone writes a reply (at most one ping every 3 seconds).
    let lastPing = 0;
    ta.addEventListener("input", () => { if (Date.now() - lastPing > 3000 && ta.value.trim()) { lastPing = Date.now(); api("POST", `/support/admin/threads/${current}/typing`).catch(() => {}); } });
    convEl.querySelector("form").addEventListener("submit", async (e) => {
      e.preventDefault(); const text = ta.value.trim(); if (!text) return;
      const btn = e.target.querySelector("button"); btn.disabled = true;
      try { const res = await api("POST", `/support/admin/threads/${current}/messages`, { body: text }); ta.value = ""; lastSig = ""; await loadConv(false); await loadList(); toast(res.accepted ? "Sent, and you’ve accepted this conversation." : "Sent. If they haven’t read it in 5 minutes, they’ll get it by email."); }
      catch (err) { errToast(err); }
      btn.disabled = false; ta.focus();
    });
  };
  const select = async (id) => {
    current = id; lastSig = ""; conv = null;
    history.replaceState(null, "", `/admin/support?t=${id}`);
    items.querySelectorAll(".sp-item").forEach((b) => b.classList.toggle("on", b.dataset.t === id));
    await loadConv(false); await loadList();
  };
  on(body, "click", "[data-t]", (_e, b) => select(b.dataset.t).catch(errToast));
  on(body, "click", "[data-f]", (_e, b) => { filter = b.dataset.f; body.querySelectorAll("[data-f]").forEach((x) => x.classList.toggle("on", x === b)); loadList().catch(errToast); });
  on(body, "click", "[data-accept]", async (_e, b) => {
    const takeover = b.dataset.accept === "takeover";
    if (takeover && !(await confirmModal({ title: "Take over this conversation", desc: `<b>${esc(conv?.thread?.accepted?.name || "Someone")}</b> accepted it. You’ll take it from here and the customer will see you join. Let them know.`, confirm: "Take over", danger: false }))) return;
    b.disabled = true;
    try { await api("POST", `/support/admin/threads/${current}/accept`, { takeover }); toast(takeover ? "It’s yours now." : "Accepted. Everyone can see it’s yours."); }
    catch (e) { errToast(e); }
    lastSig = ""; await loadConv(false); await loadList();
  });
  on(body, "click", "[data-status]", async (_e, b) => {
    try { await api("PATCH", `/support/admin/threads/${current}`, { status: b.dataset.status }); toast(b.dataset.status === "closed" ? "Marked resolved. They can rate it and reply to reopen." : "Conversation reopened"); lastSig = ""; await loadConv(false); await loadList(); } catch (e) { errToast(e); }
  });
  await loadList();
  if (current) await loadConv(false); else if (threads[0]) await select(threads[0].id);
  const poll = async () => { if (!document.body.contains(body)) return; try { await loadList(true); if (current) await loadConv(true); } catch { /* retry */ } timer = setTimeout(poll, 8000); };
  timer = setTimeout(poll, 8000);
}
