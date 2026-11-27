// Dedicated IPs: Settings → Dedicated IPs for teams (request, status, remove) and Admin → Dedicated IPs for
// platform admins (approve, decline, retry, remove). The API creates Amazon SES managed dedicated IP pools.
import { state, api } from "../lib/sb.js";
import { esc, icon, ago, fmtDate, num, toast, errToast, formModal, confirmModal, emptyState, badge, on, type El } from "../lib/ui.js";

const STATUS: Record<string, [string, string]> = { requested: ["Requested", "yellow"], provisioning: ["Setting up", "blue"], active: ["Active", "green"], removing: ["Removing", "orange"], off: ["Off", "gray"], declined: ["Declined", "gray"], failed: ["Needs attention", "red"] };
const statusBadge = (s: string) => badge(...(STATUS[s] || [s, "gray"]));
const REGION: Record<string, string> = { "eu-west-1": "Ireland", "us-east-1": "N. Virginia", "sa-east-1": "São Paulo", "ap-northeast-1": "Tokyo" };
const regionName = (r: string) => `${REGION[r] || r} <span class="dim mono">${esc(r)}</span>`;

/** Settings → Dedicated IPs */
export async function dedicatedIps(body: El) {
  const admin = state.role === "admin";
  const draw = async () => {
    const d = await api("GET", "/dedicated-ips");
    const low = d.daily_average < d.recommended_daily_minimum;
    const intro = `<p class="muted" style="margin:0 0 16px;max-width:720px">A dedicated IP gives your mail its own sending address, so your reputation depends only on what you send. Amazon SES warms the IPs up with each mailbox provider and adds more as your volume grows. During warm-up, which takes a few weeks, some of your mail still goes out through Delivrie's shared IPs.</p>`;
    const usage = `<p class="muted" style="margin:0">Your volume: <b style="color:var(--fg);font-weight:500">${num(d.daily_average)} emails a day</b>, averaged over the last 14 days.</p>`;
    let card: string;
    if (d.status === "active" || d.status === "provisioning" || d.status === "removing" || d.status === "failed") {
      card = `<div class="card card-pad"><div class="row-flex" style="gap:10px;margin-bottom:12px"><h3 style="margin:0;font-size:15px;font-weight:500">Dedicated IPs</h3>${statusBadge(d.status)}<span class="grow"></span>${d.activated_at ? `<span class="dim">On since ${fmtDate(d.activated_at)}</span>` : ""}</div>
        ${d.pools.length ? `<div class="table-wrap"><table class="t"><thead><tr><th>Region</th><th>Pool</th></tr></thead><tbody>${d.pools.map((p) => `<tr><td>${regionName(p.region)}</td><td>${statusBadge(p.status)}</td></tr>`).join("")}</tbody></table></div>` : ""}
        ${d.error ? `<p class="ib-agent-err" style="margin-top:10px">${esc(d.error)}</p>` : ""}
        ${d.status === "active" ? `<p class="hint" style="margin-top:12px">Domains you add later in a new region get a pool there too. Keep bounce and complaint rates low: on a dedicated IP, they affect only you.</p>` : ""}
        ${admin && (d.status === "active" || d.status === "failed") ? `<div class="row-flex" style="justify-content:flex-end;margin-top:14px"><button class="btn btn-ghost btn-sm" data-remove style="color:var(--red)">${icon("trash", 12)} Turn off dedicated IPs</button></div>` : ""}</div>`;
    } else if (d.status === "requested") {
      card = `<div class="card card-pad"><div class="row-flex" style="gap:10px"><h3 style="margin:0;font-size:15px;font-weight:500">Request received</h3>${statusBadge("requested")}<span class="grow"></span><span class="dim">${ago(d.requested_at)}</span></div>
        <p class="muted" style="margin:10px 0 0">We review requests within one business day and email your team's admins when your dedicated IPs are on.</p>${d.note ? `<p class="hint">Your note: ${esc(d.note)}</p>` : ""}
        ${admin ? `<div class="row-flex" style="justify-content:flex-end;margin-top:12px"><button class="btn btn-ghost btn-sm" data-cancel>Withdraw request</button></div>` : ""}</div>`;
    } else if (!d.eligible) {
      card = `<div class="card">${emptyState({ icon: "shield", title: "Available on Scale and Enterprise", desc: "Dedicated IPs suit senders with steady volume, usually 3,000 emails a day or more. Below that, Delivrie's shared IPs give you a better reputation.", action: `<a class="btn btn-primary" href="/billing?upgrade=scale">See Scale</a>` })}</div>`;
    } else {
      card = `<div class="card card-pad">${d.status === "declined" ? `<p class="ib-banner" style="margin:0 0 12px">${icon("info", 13)} Your last request was declined${d.decision_note ? `: ${esc(d.decision_note)}` : "."} You can ask again.</p>` : ""}
        <h3 style="margin:0 0 6px;font-size:15px;font-weight:500">Get dedicated IPs</h3>
        <p class="muted" style="margin:0 0 12px">We set them up for every region your domains send from, and your sending doesn't change: same API, same domains.</p>
        ${low ? `<p class="ib-banner" style="margin:0 0 12px">${icon("alert", 13)} You're sending about ${num(d.daily_average)} emails a day. Dedicated IPs work best from ${num(d.recommended_daily_minimum)} a day; below that, Amazon may move your mail back to shared IPs.</p>` : ""}
        ${admin ? `<button class="btn btn-primary" data-request>${icon("shield", 13)} Request dedicated IPs</button>` : `<p class="hint">Ask a team admin to request them.</p>`}</div>`;
    }
    body.innerHTML = intro + `<div style="max-width:720px;display:flex;flex-direction:column;gap:14px">${usage}${card}</div>`;
  };
  on(body, "click", "[data-request]", () => formModal({ title: "Request dedicated IPs", desc: "Tell us about your sending so we can size it right. We'll reply within one business day.", fields: [{ name: "note", label: "Expected volume and use", type: "textarea", placeholder: "About 20,000 receipts and password resets a day, growing to 50,000 by March.", optional: true }], submit: "Send request",
    async onSubmit(v) { await api("POST", "/dedicated-ips/request", { note: v.note || undefined }); toast("Request sent"); await draw(); } }));
  on(body, "click", "[data-cancel]", async () => { try { await api("POST", "/dedicated-ips/cancel"); toast("Request withdrawn"); await draw(); } catch (e) { errToast(e); } });
  on(body, "click", "[data-remove]", async () => {
    if (!(await confirmModal({ title: "Turn off dedicated IPs", desc: "Your domains go back to Delivrie's shared IPs straight away and the dedicated IPs are released. If you want them again later, they need warming up again.", confirm: "Turn off" }))) return;
    try { await api("POST", "/dedicated-ips/cancel"); toast("Dedicated IPs turned off"); await draw(); } catch (e) { errToast(e); }
  });
  await draw();
}

/** Admin → Dedicated IPs */
export async function adminDedicated(body: El, canWrite: boolean) {
  const draw = async () => {
    const { data } = await api("GET", "/admin/dedicated-ips");
    const pending = data.filter((r) => r.status === "requested");
    body.innerHTML = `<p class="muted" style="margin:0 0 14px;max-width:760px">Approving creates an Amazon SES managed dedicated IP pool for the team in each region it sends from and moves its domains onto it. Amazon bills the Delivrie AWS account for managed dedicated IPs: $15 a month for the account plus $0.08 per 1,000 emails sent through them (Amazon SES pricing). Removing the last pool stops the charges.</p>
      ${data.length ? `<div class="table-wrap"><table class="t"><thead><tr><th>Team</th><th>Plan</th><th class="r">Emails a day</th><th>Status</th><th>Regions</th><th>Requested</th><th></th></tr></thead><tbody>${data.map((r) => `<tr>
        <td><b style="font-weight:500">${esc(r.team)}</b>${r.note ? `<div class="dim" style="max-width:280px;white-space:normal">${esc(r.note)}</div>` : ""}${r.error ? `<div class="ib-agent-err" style="max-width:280px;white-space:normal">${esc(r.error)}</div>` : ""}</td>
        <td>${badge(r.plan, "gray")}</td><td class="r">${num(r.daily_average)}${r.daily_average < 3000 ? ` <span title="Below 3,000 a day, SES may move mail back to shared IPs">${icon("alert", 12)}</span>` : ""}</td><td>${statusBadge(r.status)}</td>
        <td>${(r.pools || []).map((p) => `<span class="mono" title="${esc(p.error || p.status)}">${esc(p.region)}</span>`).join(", ") || `<span class="dim">—</span>`}</td><td class="muted">${ago(r.requested_at)}</td>
        <td style="text-align:right;white-space:nowrap">${!canWrite ? "" : r.status === "requested" ? `<button class="btn btn-ghost btn-sm" data-act="decline" data-team="${r.team_id}">Decline</button> <button class="btn btn-primary btn-sm" data-act="approve" data-team="${r.team_id}">Approve</button>` : r.status === "failed" ? `<button class="btn btn-secondary btn-sm" data-act="retry" data-team="${r.team_id}">Retry</button> <button class="btn btn-ghost btn-sm" data-act="remove" data-team="${r.team_id}">Remove</button>` : r.status === "active" ? `<button class="btn btn-ghost btn-sm" data-act="remove" data-team="${r.team_id}">Remove</button>` : r.status === "declined" ? `<button class="btn btn-ghost btn-sm" data-act="approve" data-team="${r.team_id}">Approve anyway</button>` : ""}</td></tr>`).join("")}</tbody></table></div>`
        : `<div class="card">${emptyState({ icon: "shield", title: "No dedicated IP requests", desc: "Teams on Scale and Enterprise can request dedicated IPs in Settings → Dedicated IPs. Requests show up here and are emailed to platform owners and admins." })}</div>`}`;
    const tab = document.querySelector('a.ul-tab[href="/admin/dedicated-ips"]');
    if (tab) tab.innerHTML = `Dedicated IPs${pending.length ? ` <span class="badge yellow" style="margin-left:4px">${pending.length}</span>` : ""}`;
  };
  on(body, "click", "[data-act]", async (_e, b) => {
    const act = b.dataset.act, team = b.dataset.team;
    if (act === "decline") {
      return formModal({ title: "Decline request", fields: [{ name: "note", label: "Reason for the team", type: "textarea", placeholder: "Your volume is still low for a dedicated IP. Shared IPs will serve you better for now.", optional: true }], submit: "Decline", danger: true,
        async onSubmit(v) { await api("POST", `/admin/dedicated-ips/${team}/decline`, { note: v.note || undefined }); toast("Declined · the team was emailed"); await draw(); } });
    }
    if (act === "remove" && !(await confirmModal({ title: "Remove dedicated IPs", desc: "The team's domains go back to the shared pool and its dedicated pools are deleted. The IPs are released.", confirm: "Remove" }))) return;
    b.disabled = true; b.innerHTML = `<span class="spinner"></span>`;
    try {
      const r = await api("POST", `/admin/dedicated-ips/${team}/${act}`);
      toast(r.status === "active" ? "Dedicated IPs are on · the team was emailed" : r.status === "off" ? "Removed" : `Status: ${r.status}${r.error ? ` · ${r.error}` : ""}`, r.status === "failed" ? "err" : "ok", 6000);
    } catch (e) { errToast(e); }
    await draw();
  });
  await draw();
}
