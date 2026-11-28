// /integrations/vercel: where Vercel sends a team after it adds the Delivrie integration. Pick Vercel projects,
// and Delivrie creates an API key and sets DELIVRIE_API_KEY on them.
import { state, api } from "../lib/sb.js";
import { esc, icon, toast, errToast, emptyState, selectHtml, bindSelects } from "../lib/ui.js";

export async function vercel(ctx) {
  const q = ctx.query, root = ctx.root;
  document.title = "Connect Vercel · Delivrie";
  const shell = (inner) => { root.innerHTML = `<div class="consent-wrap"><div class="consent card" style="max-width:560px">${inner}</div></div>`; };
  const fail = (title, desc) => shell(emptyState({ icon: "alert", title, desc, action: `<a class="btn btn-secondary" href="/settings/integrations">Back to integrations</a>` }));
  if (!q.code) return fail("Start from Vercel", "Add the Delivrie integration from Vercel’s integration page, and it brings you back here to choose projects.");
  shell(`<p class="dim"><span class="spinner"></span> Connecting to Vercel…</p>`);
  let conn;
  try { conn = await api("POST", "/dashboard/vercel/exchange", { code: q.code, configuration_id: q.configurationId }); }
  catch (e) { return fail("Couldn’t connect to Vercel", esc((e as Error).message)); }
  // Clear the one-time code from the address bar.
  history.replaceState({}, "", "/integrations/vercel" + (q.next ? `?next=${encodeURIComponent(q.next)}` : ""));
  const projects = conn.available_projects || [];
  shell(`<div class="row-flex" style="gap:10px;margin-bottom:6px"><span class="avatar sq" style="width:30px;height:30px">▲</span><h2 style="margin:0;font-size:18px;font-weight:600">Connect Vercel to ${esc(state.team?.name || "Delivrie")}</h2></div>
    <p class="muted" style="margin:6px 0 16px">Delivrie creates an API key and adds it as <code>DELIVRIE_API_KEY</code> to the projects you choose, for production, preview and development. Redeploy to use it.</p>
    ${projects.length ? `<div class="field"><label>Projects</label><div class="vc-projects" style="display:flex;flex-direction:column;gap:6px;max-height:280px;overflow:auto;border:1px solid var(--border);border-radius:8px;padding:8px 10px">${projects.map((p, i) => `<label class="row-flex" style="gap:8px"><input type="checkbox" class="checkbox" data-p="${i}" ${projects.length === 1 ? "checked" : ""}><span class="grow">${esc(p.name)}</span>${p.framework ? `<span class="dim mono" style="font-size:12px">${esc(p.framework)}</span>` : ""}</label>`).join("")}</div></div>` : `<p class="muted">No projects found on this Vercel account. Create one, then add the integration again.</p>`}
    <div class="field"><label>Access</label>${selectHtml("permission", [{ value: "sending", label: "Sending only (recommended)" }, { value: "full", label: "Full access" }], "sending")}<div class="hint">Sending-only keys can send email but can’t read or change your account.</div></div>
    <div class="row-flex" style="justify-content:flex-end;gap:8px;margin-top:16px"><a class="btn btn-ghost" href="${esc(q.next && /^https:\/\/vercel\.com\//.test(q.next) ? q.next : "/settings/integrations")}">Cancel</a><button class="btn btn-primary" data-go ${projects.length ? "" : "disabled"}>Connect</button></div>`);
  let permission = "sending";
  bindSelects(root, (_n, v) => { permission = v; });
  (root.querySelector("[data-go]") as HTMLButtonElement | null)?.addEventListener("click", async (e) => {
    const btn = e.currentTarget as HTMLButtonElement;
    const chosen = ([...root.querySelectorAll("[data-p]")] as HTMLInputElement[]).filter((x) => x.checked).map((x) => projects[+x.dataset.p!]);
    if (!chosen.length) return toast("Choose at least one project", "err");
    btn.disabled = true; btn.innerHTML = `<span class="spinner"></span>`;
    try {
      const r = await api("POST", `/dashboard/vercel/${conn.id}/connect`, { projects: chosen.map((p) => ({ id: p.id, name: p.name })), permission, next: q.next });
      if (r.failed?.length) toast(`Couldn’t update ${r.failed.map((f) => f.name).join(", ")}`, "err", 6000);
      shell(emptyState({ icon: "check-circle", title: "Vercel is connected", desc: `DELIVRIE_API_KEY is set on ${r.projects.map((p) => esc(p.name)).join(", ")}. Redeploy to use it.`, action: r.next ? `<a class="btn btn-primary" href="${esc(r.next)}">Back to Vercel</a>` : `<a class="btn btn-primary" href="/settings/integrations">Done</a>` }));
      if (r.next) setTimeout(() => { location.href = r.next; }, 2500);
    } catch (err) { errToast(err); btn.disabled = false; btn.textContent = "Connect"; }
  });
}
