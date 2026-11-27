// In-app alerts for the support team (owners, admins and support people), anywhere in the dashboard: a card for
// every new support request with an Accept button, and a note when a teammate accepts one, so everyone knows who
// has it. Desktop notifications too, if allowed. Polls every 20 seconds while the tab is visible.
import { api } from "./sb.js";
import { esc, icon, toast, errToast } from "./ui.js";

let started = false, since = null, host = null;
const seen = new Set();
const KEY = "dlv_support_pulse";

export function startSupportAlerts(role) {
  if (started || !["owner", "admin", "support"].includes(role)) return;
  started = true;
  try { since = localStorage.getItem(KEY); } catch { /* private mode */ }
  if (!since || Date.now() - Date.parse(since) > 3600e3) since = new Date().toISOString(); // don't replay old requests on first load
  host = document.createElement("div");
  host.className = "sa";
  host.setAttribute("aria-live", "polite");
  document.body.appendChild(host);
  host.addEventListener("click", onClick);
  tick();
  setInterval(() => { if (document.visibilityState === "visible") tick(); }, 20000);
}

async function tick() {
  let r;
  try { r = await api("GET", `/support/admin/pulse?since=${encodeURIComponent(since)}`); } catch { return; }
  since = r.now;
  try { localStorage.setItem(KEY, since); } catch { /* private mode */ }
  for (const t of r.new || []) {
    if (seen.has("n" + t.id)) continue;
    seen.add("n" + t.id);
    card(t);
    desktop(`New support request ${t.ticket}`, `${t.who}${t.topic ? ` · ${t.topic}` : ""}: ${t.preview || ""}`, t.id);
  }
  for (const a of r.accepted || []) {
    if (seen.has("a" + a.id + a.at)) continue;
    seen.add("a" + a.id + a.at);
    host.querySelector(`[data-sa="${a.id}"]`)?.remove();
    if (!location.pathname.startsWith("/admin/support")) toast(`${a.by} accepted ${a.ticket}`, "info");
  }
}
function card(t) {
  if (location.pathname.startsWith("/admin/support")) return; // the support page shows it already
  const el = document.createElement("div");
  el.className = "sa-card";
  el.dataset.sa = t.id;
  el.innerHTML = `<div class="sa-h">${icon("inbox", 14)}<b>New support request</b><span class="mono dim">${esc(t.ticket)}</span><button class="ibtn" data-sa-x aria-label="Dismiss">${icon("x", 13)}</button></div>
    <div class="sa-who">${esc(t.who)}${t.visitor ? ' <span class="dim">· website visitor</span>' : ""}${t.topic ? ` <span class="dim">· ${esc(t.topic)}</span>` : ""}</div>
    <p>${esc(t.preview || "")}</p>
    <div class="row-flex" style="gap:6px"><button class="btn btn-primary btn-sm" data-sa-accept="${t.id}">${icon("check", 12)} Accept</button><a class="btn btn-secondary btn-sm" href="/admin/support?t=${t.id}">Open</a></div>`;
  host.prepend(el);
  while (host.children.length > 3) host.lastElementChild.remove();
}
async function onClick(e) {
  const x = e.target.closest("[data-sa-x]");
  if (x) { x.closest(".sa-card").remove(); return; }
  const b = e.target.closest("[data-sa-accept]");
  if (!b) return;
  b.disabled = true;
  try {
    await api("POST", `/support/admin/threads/${b.dataset.saAccept}/accept`, {});
    toast("Accepted. Everyone can see it’s yours.");
    location.assign(`/admin/support?t=${b.dataset.saAccept}`);
  } catch (err) { errToast(err); b.closest(".sa-card")?.remove(); }
}
function desktop(title, body, tag) {
  if (!("Notification" in window) || Notification.permission !== "granted" || document.visibilityState === "visible") return;
  try { const n = new Notification(title, { body, tag }); n.onclick = () => { window.focus(); location.assign(`/admin/support?t=${tag}`); }; } catch { /* some browsers need a service worker */ }
}
