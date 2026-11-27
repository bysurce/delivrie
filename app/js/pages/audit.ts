// Settings → Audit log (Enterprise). Who changed what in the team: members and access, API keys, domains, webhooks,
// single sign-on, connected apps, billing and sign-ins. Entries are written by the API, by database triggers for
// changes the dashboard makes directly, and on every sign-in; nobody can edit or delete them.
import { sb, state } from "../lib/sb.js";
import { esc, icon, fmtDateTime, ago, num, emptyState, badge, on, csv, download, toast } from "../lib/ui.js";

const LABELS = {
  "user.signed_in": "Signed in",
  "member.added": "Added a member", "member.removed": "Removed a member", "member.role_changed": "Changed a member's role",
  "invite.sent": "Sent an invite", "invite.revoked": "Revoked an invite", "invite.updated": "Updated an invite", "invite.created": "Sent an invite", "invite.deleted": "Revoked an invite",
  "api_key.created": "Created an API key", "api_key.updated": "Updated an API key", "api_key.deleted": "Deleted an API key",
  "domain.created": "Added a domain", "domain.updated": "Changed domain settings", "domain.deleted": "Removed a domain", "domain.verify": "Checked domain DNS", "domain.cloudflare": "Set up DNS on Cloudflare",
  "webhook.created": "Added a webhook", "webhook.updated": "Changed a webhook", "webhook.deleted": "Deleted a webhook", "webhook.test": "Sent a test webhook",
  "sso.created": "Set up single sign-on", "sso.updated": "Changed single sign-on",
  "connected_app.authorized": "Connected an app", "connected_app.revoked": "Disconnected an app",
  "team.updated": "Changed team settings",
  "template.created": "Created a template", "template.updated": "Edited a template", "template.publish": "Published a template", "template.deleted": "Deleted a template",
  "broadcast.created": "Created a broadcast", "broadcast.send": "Sent a broadcast", "broadcast.schedule": "Scheduled a broadcast", "broadcast.cancel": "Canceled a broadcast", "broadcast.deleted": "Deleted a broadcast",
  "automation.created": "Created an automation", "automation.live": "Published an automation", "automation.publish": "Published an automation", "automation.paused": "Paused an automation", "automation.pause": "Paused an automation", "automation.resume": "Resumed an automation", "automation.deleted": "Deleted an automation",
  "suppression.created": "Suppressed an address", "suppression.removed": "Removed a suppression", "suppression.deleted": "Removed a suppression",
  "contact.deleted": "Deleted a contact", "contact.updated": "Updated a contact",
  "segment.created": "Created a segment", "segment.deleted": "Deleted a segment",
  "billing.plan_changed": "Plan changed", "billing.plan_cancelled": "Cancelled the plan", "billing.settings_updated": "Changed billing settings", "billing.spending_cap_set": "Set the spending cap", "billing.details_updated": "Changed billing details",
};
const label = (a) => LABELS[a] || a.replace(/[._]/g, " ").replace(/^\w/, (c) => c.toUpperCase());
const FILTERS = [["", "All activity"], ["user.", "Sign-ins"], ["member.|invite.|sso.|connected_app.", "Members & access"], ["api_key.", "API keys"], ["domain.", "Domains"], ["webhook.", "Webhooks"], ["billing.", "Billing"], ["template.|broadcast.|automation.", "Content & sending"]];
const ACTOR = { user: ["Person", "gray"], api_key: ["API key", "blue"], app: ["Connected app", "yellow"], system: ["System", "gray"] };
const PAGE = 50;
// Spreadsheet apps run a cell starting with = + - @ as a formula; names and labels come from users, so neutralise it.
const safeCell = (v) => (typeof v === "string" && /^[=+\-@\t\r]/.test(v) ? `'${v}` : v);

function details(r) {
  const m = r.metadata || {};
  const bits = [];
  if (m.from || m.to) bits.push(`${esc(m.from ?? "—")} → ${esc(m.to ?? "—")}`);
  if (m.role && !m.from) bits.push(`role ${esc(m.role)}`);
  if (m.permission) bits.push(esc(m.permission === "full" ? "full access" : "sending only"));
  if (Array.isArray(m.changed) && m.changed.length) bits.push(`changed ${m.changed.map(esc).join(", ")}`);
  if (Array.isArray(m.fields) && m.fields.length) bits.push(`fields ${m.fields.map(esc).join(", ")}`);
  if (m.provider && r.action === "user.signed_in") bits.push(`with ${esc(m.provider)}`);
  if (m.amount !== undefined) bits.push(m.amount ? `amount ${num(m.amount / 100)}` : "no cap");
  return bits.join(" · ");
}

export async function auditLog(body) {
  if (state.role !== "admin") { body.innerHTML = `<div class="card">${emptyState({ icon: "lock", title: "Admins only", desc: "Ask a team admin to show you the audit log." })}</div>`; return; }
  if ((state.team?.plan_transactional || "free") !== "enterprise") {
    body.innerHTML = `<div class="card card-pad" style="max-width:640px"><div class="row-flex" style="gap:8px">${icon("shield", 15)}<h3 style="margin:0">Audit log</h3>${badge("Enterprise", "blue")}</div>
      <p class="muted" style="margin:10px 0">See who changed what in your team and when: sign-ins, members and roles, API keys, domains, webhooks, single sign-on, connected apps, billing and published content. Entries can't be edited or deleted, and you can export them for reviews.</p>
      <p class="dim" style="margin:0 0 14px;font-size:calc(12.5px + var(--fs-up, 0px))">Your team's activity is already being recorded, so the full history is there when you upgrade.</p>
      <a class="btn btn-primary btn-sm" href="/contact-sales" target="_blank" data-native>Talk to sales</a></div>`;
    return;
  }
  let filter = "", rows = [], done = false, loading = false;

  async function load(more) {
    if (loading) return; loading = true;
    let q = sb.from("audit_logs").select("id,created_at,actor_type,actor_label,action,target_type,target_label,metadata,ip,user_agent").eq("team_id", state.team.id).order("id", { ascending: false }).limit(PAGE);
    if (more && rows.length) q = q.lt("id", rows[rows.length - 1].id);
    if (filter) q = q.or(filter.split("|").map((p) => `action.like.${p}*`).join(","));
    const { data, error } = await q;
    loading = false;
    if (error) { toast(error.message, "err"); return; }
    rows = more ? rows.concat(data) : data;
    done = data.length < PAGE;
    draw();
  }

  function draw() {
    body.innerHTML = `<div class="row-flex" style="gap:8px;margin-bottom:14px;flex-wrap:wrap">
        <select class="input" data-filter style="width:auto;min-width:180px">${FILTERS.map(([v, l]) => `<option value="${esc(v)}" ${v === filter ? "selected" : ""}>${esc(l)}</option>`).join("")}</select>
        <span class="grow"></span><button class="btn btn-secondary btn-sm" data-export ${rows.length ? "" : "disabled"}>${icon("download", 12)} Export CSV</button></div>
      ${rows.length ? `<div class="table-wrap"><table class="t"><thead><tr><th>When</th><th>Who</th><th>What</th><th>Details</th></tr></thead><tbody>${rows.map((r) => {
        const [aName, aColor] = ACTOR[r.actor_type] || ACTOR.system;
        return `<tr><td class="muted" title="${esc(fmtDateTime(r.created_at))}" style="white-space:nowrap">${esc(ago(r.created_at))}</td>
          <td><div>${esc(r.actor_label || aName)}</div><div class="dim" style="font-size:calc(11.5px + var(--fs-up, 0px))">${badge(aName, aColor)}${r.ip ? ` <span class="mono">${esc(r.ip)}</span>` : ""}</div></td>
          <td><div>${esc(label(r.action))}</div>${r.target_label ? `<div class="dim mono" style="font-size:calc(12px + var(--fs-up, 0px));overflow-wrap:anywhere">${esc(r.target_label)}</div>` : ""}</td>
          <td class="dim" style="font-size:calc(12.5px + var(--fs-up, 0px))">${details(r) || "—"}</td></tr>`;
      }).join("")}</tbody></table></div>
      ${done ? "" : `<div style="text-align:center;margin-top:14px"><button class="btn btn-secondary btn-sm" data-more>Load older</button></div>`}`
        : `<div class="card">${emptyState({ icon: "shield", title: "Nothing here yet", desc: filter ? "No activity of this kind yet." : "Changes to your team will appear here." })}</div>`}`;
  }

  on(body, "change", "[data-filter]", (_e, s) => { filter = s.value; rows = []; load(false); });
  on(body, "click", "[data-more]", () => load(true));
  on(body, "click", "[data-export]", () => {
    const out = [["time", "actor_type", "actor", "action", "description", "target_type", "target", "details", "ip", "user_agent"],
      ...rows.map((r) => [r.created_at, r.actor_type, r.actor_label || "", r.action, label(r.action), r.target_type || "", r.target_label || "", JSON.stringify(r.metadata || {}), r.ip || "", r.user_agent || ""].map(safeCell))];
    download(`delivrie-audit-log-${new Date().toISOString().slice(0, 10)}.csv`, csv(out), "text/csv");
  });
  await load(false);
}
