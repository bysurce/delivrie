import { sb, state, api } from "../lib/sb.js";
import { esc, icon, ago, fmtDateTime, toast, errToast, menu, modal, formModal, confirmModal, emptyState, debounce, drawer, codeBlock, badge, on } from "../lib/ui.js";
import { renderBlocks, renderVars } from "../lib/blocks.js";
import { mountEditor, previewModal, stylesPopover } from "./editor.js";
import { LIBRARY, BLANK, CATEGORIES, applyBrand, canBrand, samples } from "../lib/template-library.js";
import { testModal } from "./broadcast-edit.js";

export async function gallery(ctx) {
  ctx.crumb("template", "Templates");
  const root = ctx.root;
  root.innerHTML = `<div class="page wide"><div class="page-head"><h1>Templates</h1><div class="actions"><button class="ibtn boxed" data-api title="API">${icon("code", 14)}</button><button class="btn btn-primary" data-new>${icon("plus", 13)} Create template</button></div></div>
    <div class="tpl-layout"><aside class="tpl-folders" data-folders></aside><div style="min-width:0"><div class="filters"><div class="input-wrap search"><span class="lead">${icon("search", 13)}</span><input class="input" data-q placeholder="Search templates"></div><span class="grow"></span><button class="btn btn-secondary" data-new-folder>${icon("folder", 13)} New folder</button></div><div data-body></div></div></div></div>`;
  const body = root.querySelector("[data-body]");
  let rows = [], folders = [], folder = ctx.query.folder || "all";
  async function load() {
    const [{ data, error }, { data: fs }] = await Promise.all([
      sb.from("templates").select("id,name,alias,status,published_version,subject,content,variables,updated_at,created_at,folder_id").eq("team_id", state.team.id).order("updated_at", { ascending: false }),
      sb.from("template_folders").select("id,name").eq("team_id", state.team.id).order("name"),
    ]);
    if (error) throw error; rows = data; folders = fs || []; draw();
  }
  function drawFolders() {
    const count = (id) => rows.filter((t) => id === "all" ? true : id === "none" ? !t.folder_id : t.folder_id === id).length;
    const item = (id, name, ic) => `<button class="tf ${folder === id ? "on" : ""}" data-folder="${id}">${icon(ic, 13)}<span class="grow ellipsis">${esc(name)}</span><span class="dim">${count(id)}</span>${id !== "all" && id !== "none" ? `<span class="ibtn tf-more" data-folder-menu="${id}">${icon("more", 13)}</span>` : ""}</button>`;
    root.querySelector("[data-folders]").innerHTML = `<div class="tf-h">Folders</div>${item("all", "All templates", "template")}${folders.map((f) => item(f.id, f.name, "folder")).join("")}${folders.length ? item("none", "Not in a folder", "inbox") : ""}`;
  }
  function draw() {
    drawFolders();
    const q = root.querySelector("[data-q]").value.toLowerCase();
    const r = rows.filter((t) => (folder === "all" || (folder === "none" ? !t.folder_id : t.folder_id === folder)) && (!q || `${t.name} ${t.alias || ""}`.toLowerCase().includes(q)));
    if (!rows.length) { body.innerHTML = emptyState({ icon: "template", title: "No templates yet", desc: "Design transactional emails once, then send them from your code with variables.", action: `<button class="btn btn-primary" data-new>${icon("plus", 13)} Create template</button>` }); return; }
    if (!r.length) { body.innerHTML = emptyState({ icon: folder === "all" ? "search" : "folder", title: folder !== "all" && !root.querySelector("[data-q]").value ? "This folder is empty" : "No templates match", desc: folder !== "all" ? "Move templates here from their ⋯ menu." : "Try a different search." }); return; }
    body.innerHTML = `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:16px">${r.map((t) => `<div class="card clickable tpl-card" data-id="${t.id}" style="overflow:hidden;cursor:pointer">
      <div style="height:170px;overflow:hidden;background:#fff;position:relative;pointer-events:none"><iframe sandbox data-thumb="${t.id}" style="width:640px;height:720px;border:0;transform:scale(.4);transform-origin:0 0;position:absolute;left:calc(50% - 128px);top:0"></iframe></div>
      <div style="padding:12px 14px;display:flex;align-items:center;gap:8px;border-top:1px solid var(--border)"><div class="grow"><div class="ellipsis" style="font-weight:500">${esc(t.name)}</div><div class="dim" style="font-size:calc(12px + var(--fs-up, 0px))">${t.status === "published" ? `v${t.published_version} · ` : "Draft · "}${ago(t.updated_at)}</div></div><button class="ibtn" data-row="${t.id}">${icon("more")}</button></div></div>`).join("")}</div>`;
    r.forEach((t) => { const f = body.querySelector(`[data-thumb="${t.id}"]`); if (f) f.srcdoc = renderVars(renderBlocks(t.content || { blocks: [] }, { subject: t.subject }), Object.fromEntries((t.variables || []).map((v) => [v.name, v.sample || v.fallback || ""])), t.variables || []); });
  }
  root.querySelector("[data-q]").addEventListener("input", draw);
  const folderModal = (f?: any) => formModal({ title: f ? "Rename folder" : "New folder", fields: [{ name: "name", label: "Name", value: f?.name || "", placeholder: "Payments" }], submit: f ? "Save" : "Create folder", validate: (v) => v.name && v.name.length <= 60,
    async onSubmit(v) {
      const q = f ? sb.from("template_folders").update({ name: v.name }).eq("id", f.id) : sb.from("template_folders").insert({ team_id: state.team.id, name: v.name });
      const { error } = await q; if (error) throw new Error(/duplicate/.test(error.message) ? "A folder with that name already exists" : error.message);
      toast(f ? "Folder renamed" : `Folder “${v.name}” created`); await load();
    } });
  on(root, "click", "[data-new-folder]", () => folderModal());
  on(root, "click", "[data-folder]", (e, b) => { if ((e.target as Element).closest<HTMLElement>("[data-folder-menu]")) return; folder = b.dataset.folder; history.replaceState({}, "", folder === "all" ? "/templates" : `/templates?folder=${folder}`); draw(); });
  on(root, "click", "[data-folder-menu]", (e, b) => {
    e.stopPropagation(); const f = folders.find((x) => x.id === b.dataset.folderMenu);
    menu(b, [{ label: "Rename", icon: "edit", onClick: () => folderModal(f) }, { label: "Delete folder", icon: "trash", danger: true, onClick: async () => {
      if (!(await confirmModal({ title: "Delete folder", desc: `Templates in “${esc(f.name)}” move to Not in a folder. No templates are deleted.`, confirm: "Delete folder" }))) return;
      const { error } = await sb.from("template_folders").delete().eq("id", f.id); if (error) return errToast(error);
      if (folder === f.id) folder = "all"; toast("Folder deleted"); await load(); } }], { align: "right" });
  });
  on(root, "click", "[data-new]", () => createModal(ctx.navigate));
  on(root, "click", "[data-api]", () => drawer({ title: "Send with a template", wide: true, body: `<p class="muted">Publish a template, then reference it by ID or alias. Variables fill <span class="mono">{{{name}}}</span> placeholders.</p>${codeBlock(`curl -X POST ${location.origin}/api/emails \\\n  -H "Authorization: Bearer dlv_xxxxxxxxx" \\\n  -H "Content-Type: application/json" \\\n  -d '{\n    "from": "Acme <hello@acme.com>",\n    "to": ["ada@example.com"],\n    "template": {\n      "id": "welcome",\n      "variables": { "first_name": "Ada" }\n    }\n  }'`, { lang: "sh" })}` }));
  on(root, "click", ".tpl-card", (e, c) => { if (!(e.target as Element).closest<HTMLElement>("[data-row]")) ctx.navigate(`/templates/${c.dataset.id}`); });
  on(root, "click", "[data-row]", (e, btn) => {
    e.stopPropagation(); const t = rows.find((x) => x.id === btn.dataset.row);
    menu(btn, [
      { label: "Edit", icon: "edit", onClick: () => ctx.navigate(`/templates/${t.id}`) },
      { label: "Rename", icon: "edit", onClick: () => formModal({ title: "Rename template", fields: [{ name: "name", label: "Name", value: t.name }], validate: (v) => v.name, async onSubmit(v) { const { error } = await sb.from("templates").update({ name: v.name }).eq("id", t.id); if (error) throw error; toast("Renamed"); load(); } }) },
      { label: "Duplicate", icon: "copy", onClick: async () => { const { data: full } = await sb.from("templates").select("*").eq("id", t.id).single(); const { error } = await sb.from("templates").insert({ team_id: full.team_id, name: full.name + " (copy)", from: full.from, reply_to: full.reply_to, subject: full.subject, content: full.content, variables: full.variables, status: "draft", created_by: state.user.id }); if (error) return errToast(error); toast("Template duplicated"); load(); } },
      { label: "Copy ID", icon: "copy", onClick: () => navigator.clipboard.writeText(t.id).then(() => toast("ID copied")) },
      ...(folders.length ? [{ header: "Move to folder" }, ...folders.map((f) => ({ label: f.name, icon: "folder", checked: t.folder_id === f.id, onClick: async () => { const { error } = await sb.from("templates").update({ folder_id: f.id }).eq("id", t.id); if (error) return errToast(error); t.folder_id = f.id; draw(); toast(`Moved “${t.name}” to ${f.name}`); } })), ...(t.folder_id ? [{ label: "Remove from folder", icon: "x", onClick: async () => { await sb.from("templates").update({ folder_id: null }).eq("id", t.id); t.folder_id = null; draw(); toast("Removed from folder"); } }] : [])] : [{ label: "Move to a new folder…", icon: "folder", onClick: () => folderModal() }]),
      { sep: true },
      { label: "Delete", icon: "trash", danger: true, onClick: async () => { if (!(await confirmModal({ title: "Delete template", desc: `Emails sent with “${esc(t.name)}” stay in your logs, but API calls that reference it will fail.`, confirm: "Delete", typed: t.name }))) return; const { error } = await sb.from("templates").delete().eq("id", t.id); if (error) return errToast(error); toast("Template deleted"); load(); } },
    ], { align: "right" });
  });
  if (ctx.query.new) { history.replaceState({}, "", "/templates"); createModal(ctx.navigate); }
  await load();
}

// The team's brand kit when its plan includes one; otherwise templates use neutral styling with the team name.
export const teamBrand = () => (canBrand(state.team?.plan_transactional) ? state.team?.brand || {} : {});
const fillBrand = (str) => String(str || "").replace(/%BRAND%/g, teamBrand().name || state.team?.name || "Your company");

function createModal(navigate) {
  const all = [BLANK, ...LIBRARY];
  let cat = "All", pick = null;
  const branded = canBrand(state.team?.plan_transactional) && Object.keys(state.team?.brand || {}).length;
  modal({ title: "Create template", size: "tpl-gallery", body: `<div class="tg-top"><div class="seg-tabs" style="margin:0">${["All", ...CATEGORIES].map((c) => `<button class="seg-tab ${c === "All" ? "on" : ""}" data-cat="${c}">${c}</button>`).join("")}</div><span class="grow"></span><span class="dim tg-note">${branded ? `${icon("check", 12)} Styled with your brand kit` : canBrand(state.team?.plan_transactional) ? `<a href="/settings/brand">Set up your brand kit</a> to style these with your logo and colours` : `Add your logo and colours with a brand kit on <a href="/billing">Starter</a>`}</span></div><div class="tg-grid" data-grid></div>`,
    foot: `<span class="dim grow" data-picked style="font-size:calc(12.5px + var(--fs-up, 0px))">Choose a template</span><button class="btn btn-ghost" data-cancel>Cancel</button><button class="btn btn-primary" data-ok disabled>Use template</button>`,
    onMount(m, close) {
      const grid = m.querySelector("[data-grid]");
      const draw = () => {
        const list = all.filter((t) => cat === "All" || t.category === cat);
        grid.innerHTML = list.map((t) => `<button class="tg-card ${pick === t.id ? "on" : ""}" data-pick="${t.id}"><div class="tg-thumb"><iframe sandbox tabindex="-1" data-thumb="${t.id}"></iframe></div><div class="tg-meta"><div class="tg-name">${esc(t.name)}</div><div class="tg-desc">${esc(t.desc)}</div></div></button>`).join("");
        list.forEach((t) => { grid.querySelector(`[data-thumb="${t.id}"]`).srcdoc = renderVars(renderBlocks(applyBrand(t.content, teamBrand(), state.team?.name), {}), samples(t), t.variables); });
      };
      draw();
      on(m, "click", "[data-cat]", (_e, b) => { cat = b.dataset.cat; m.querySelectorAll("[data-cat]").forEach((x) => x.classList.toggle("on", x === b)); draw(); });
      const create = async () => {
        const t = all.find((x) => x.id === pick); if (!t) return;
        const ok = m.querySelector("[data-ok]"); ok.disabled = true;
        const { data, error } = await sb.from("templates").insert({ team_id: state.team.id, name: t.id === "blank" ? "Untitled template" : t.name, subject: fillBrand(t.subject) || null, content: applyBrand(t.content, teamBrand(), state.team?.name), variables: (t.variables || []).map(({ name, type, fallback, sample }) => ({ name, type, fallback, sample })), status: "draft", created_by: state.user.id }).select("id").single();
        if (error) { ok.disabled = false; return errToast(error); }
        close(true); navigate(`/templates/${data.id}`);
      };
      on(m, "click", "[data-pick]", (e, b) => {
        pick = b.dataset.pick; m.querySelectorAll("[data-pick]").forEach((x) => x.classList.toggle("on", x === b));
        m.querySelector("[data-ok]").disabled = false; m.querySelector("[data-picked]").textContent = all.find((x) => x.id === pick).name;
        if (e.detail === 2) create();
      });
      m.querySelector("[data-ok]").onclick = create;
    } });
}

export async function editor(ctx) {
  const id = ctx.params.id;
  const [{ data: t, error }, { data: domains }, { data: versions }] = await Promise.all([
    sb.from("templates").select("*").eq("id", id).maybeSingle(),
    sb.from("domains").select("name,status").eq("team_id", state.team.id).eq("status", "verified"),
    sb.from("template_versions").select("id,version,created_at,created_by_name,snapshot").eq("template_id", id).order("version", { ascending: false }),
  ]);
  if (error) throw error;
  if (!t) { toast("Template not found", "err"); return ctx.navigate("/templates", { replace: true }); }
  document.title = `${t.name} · Delivrie`;
  t.variables ||= [];
  const root = ctx.root;
  const latest = versions?.[0];
  const dirty = () => !latest || new Date(t.updated_at) > new Date(latest.created_at);
  root.innerHTML = `<div class="editor-shell">
    <div class="editor-top"><a class="ibtn" href="/templates">${icon("arrow-left", 15)}</a><span class="dim">Templates</span><span class="dim">/</span><input class="name-input" data-name value="${esc(t.name)}" size="${Math.max(8, t.name.length)}"><span data-state></span><span class="dim" data-saved style="font-size:calc(12px + var(--fs-up, 0px))"></span>
      <span class="grow"></span><button class="btn btn-ghost btn-sm" data-vars>${icon("code", 13)} Variables</button><button class="btn btn-ghost btn-sm" data-history>${icon("clock", 13)} History</button><button class="btn btn-ghost btn-sm" data-styles>${icon("sparkle", 13)} Styles</button><button class="btn btn-ghost btn-sm" data-preview>${icon("eye", 13)} Preview</button><button class="btn btn-secondary btn-sm" data-test>${icon("send", 13)} Test</button><button class="btn btn-primary btn-sm" data-publish>Publish</button></div>
    <div class="editor-main"><div class="editor-canvas"><div class="editor-doc">
      <div class="hdr-fields">
        <div class="hdr-row"><span>From</span><input data-f="from" placeholder="Acme <hello@${esc(domains?.[0]?.name || "yourdomain.com")}>" value="${esc(t.from || "")}"></div>
        <div class="hdr-row"><span>Reply-to</span><input data-f="reply_to" placeholder="Optional" value="${esc(t.reply_to || "")}"></div>
        <div class="hdr-row"><span>Alias</span><input data-f="alias" class="mono" placeholder="welcome-email — reference the template by this in the API" value="${esc(t.alias || "")}"></div>
      </div>
      <input class="doc-subject" data-f="subject" placeholder="Subject — type {{ to insert a variable" value="${esc(t.subject || "")}">
      <div data-editor></div></div></div><aside class="inspector hidden" data-insp></aside></div></div>`;
  const stateEl = root.querySelector("[data-state]"), saved = root.querySelector("[data-saved]");
  const drawState = () => { stateEl.innerHTML = t.status === "published" ? (dirty() ? badge("Unpublished changes", "yellow") : badge(`Published v${t.published_version}`, "green")) : badge("Draft", "gray"); };
  drawState();
  let patch = {};
  const flush = async () => {
    const p = patch; patch = {}; if (!Object.keys(p).length) return;
    saved.textContent = "Saving…";
    const now = new Date().toISOString();
    const { error: e } = await sb.from("templates").update({ ...p, updated_at: now }).eq("id", id);
    if (e) { saved.textContent = "Not saved"; errToast(e.message.includes("duplicate") ? new Error("That alias is already used by another template") : e); return; }
    t.updated_at = now; saved.textContent = "Saved"; drawState();
  };
  const saveSoon = debounce(flush, 700);
  const set = (k, v) => { t[k] = v; patch[k] = v; saved.textContent = "Editing…"; saveSoon(); };
  const createVariable = () => variableModal().then((v) => { if (!v) return null; t.variables = [...t.variables.filter((x) => x.name !== v.name), v]; set("variables", t.variables); return v; });
  const ed = mountEditor(root.querySelector("[data-editor]"), { doc: t.content, mode: "template", vars: () => t.variables.map((v) => ({ name: v.name, label: v.name, type: v.type })), createVariable, inspectorHost: root.querySelector("[data-insp]"), onChange: (doc) => set("content", doc) });
  root.querySelector("[data-name]").addEventListener("input", (e) => { e.target.size = Math.max(8, e.target.value.length); set("name", e.target.value || "Untitled"); });
  root.querySelectorAll("[data-f]").forEach((inp) => inp.addEventListener("input", () => {
    let v = inp.value.trim();
    if (inp.dataset.f === "alias") { v = v.toLowerCase().replace(/[^a-z0-9_-]+/g, "-"); }
    set(inp.dataset.f, v || null);
  }));
  // {{ in subject
  const subj = root.querySelector('[data-f="subject"]');
  subj.addEventListener("input", () => {
    if (!subj.value.slice(0, subj.selectionStart).endsWith("{{")) return;
    menu(subj, [{ header: "Variables" }, ...t.variables.map((v) => ({ label: v.name, icon: "code", right: v.type, onClick: () => ins(v.name) })), { sep: true }, { label: "Create variable", icon: "plus", onClick: async () => { const v = await createVariable(); if (v) ins(v.name); } }], { width: 240 });
    function ins(name) { const p = subj.selectionStart; subj.value = subj.value.slice(0, p - 2) + `{{{${name}}}}` + subj.value.slice(p); set("subject", subj.value); subj.focus(); }
  });
  root.querySelector("[data-styles]").onclick = (e) => stylesPopover(e.currentTarget, ed, (d) => set("content", d), ctx.navigate);
  root.querySelector("[data-preview]").onclick = () => { const sample = Object.fromEntries(t.variables.map((v) => [v.name, v.sample || v.fallback || `{${v.name}}`])); previewModal(ed.getDoc(), { subject: renderVars(t.subject || "", sample, t.variables), transform: (h) => renderVars(h, sample, t.variables) }); };
  root.querySelector("[data-test]").onclick = async () => { await flush(); testModal(id, "template"); };
  root.querySelector("[data-vars]").onclick = () => variablesDrawer(t, set);
  root.querySelector("[data-history]").onclick = () => historyDrawer(t, versions || [], async (snap, v) => {
    if (!(await confirmModal({ title: `Restore version ${v}`, desc: "This replaces the current draft with that version. Publish afterwards to make it live.", confirm: "Restore", danger: false }))) return;
    Object.assign(patch, { subject: snap.subject, from: snap.from, reply_to: snap.reply_to, content: snap.content, variables: snap.variables || [] });
    Object.assign(t, patch); await flush(); ctx.navigate(`/templates/${id}`, { replace: true }); toast(`Restored version ${v}`);
  });
  root.querySelector("[data-publish]").onclick = async () => {
    await flush();
    const issues = [];
    if (!t.subject) issues.push("Add a subject");
    const used = new Set([...(JSON.stringify(t.content) + (t.subject || "")).matchAll(/\{\{\{?\s*([a-zA-Z_][\w]*)/g)].map((m) => m[1]));
    const undefinedVars = [...used].filter((n) => !t.variables.some((v) => v.name === n) && !["unsubscribe_url", "preferences_url"].includes(n));
    modal({ title: "Publish template", body: `<p class="desc">Publishing creates version ${(latest?.version || 0) + 1}. API calls that use ${t.alias ? `<span class="mono">${esc(t.alias)}</span>` : "this template"} switch to it immediately.</p>
      ${issues.length ? `<div class="banner warn">${icon("alert", 13)} ${issues.join(", ")}</div>` : ""}
      ${undefinedVars.length ? `<div class="banner warn">${icon("alert", 13)} Variables with no definition: ${undefinedVars.map((n) => `<span class="mono">${esc(n)}</span>`).join(", ")}. They’ll render empty unless you pass them.</div>` : ""}
      <div class="kv"><span class="k">Subject</span><span>${esc(t.subject || "—")}</span><span class="k">Variables</span><span>${t.variables.length ? t.variables.map((v) => `<span class="mono">${esc(v.name)}</span>`).join(", ") : "None"}</span></div>`,
      foot: `<button class="btn btn-ghost" data-cancel>Cancel</button><button class="btn btn-primary" data-ok ${issues.length ? "disabled" : ""}>Publish</button>`,
      onMount(m, close) { m.querySelector("[data-ok]").onclick = async (e) => { e.currentTarget.disabled = true; try { const r = await api("POST", `/templates/${id}/publish`); toast(`Published version ${r.version}`); close(true); ctx.navigate(`/templates/${id}`, { replace: true }); } catch (err) { errToast(err); e.currentTarget.disabled = false; } }; } });
  };
  document.addEventListener("keydown", function k(e) {
    if (!document.body.contains(root.querySelector("[data-editor]"))) { document.removeEventListener("keydown", k); ed.destroy(); return; }
    if ((e.metaKey || e.ctrlKey) && e.key === "s") { e.preventDefault(); flush(); }
  });
}

function variableModal(v: { name?: string; type?: string; fallback?: string; [k: string]: any } = {}) {
  return formModal({ title: v.name ? "Edit variable" : "Create variable", fields: [
    { name: "name", label: "Name", value: v.name, placeholder: "first_name", mono: true, hint: "Letters, numbers and underscores. Used as {{{name}}}." },
    { name: "type", label: "Type", type: "select", value: v.type || "string", options: [{ value: "string", label: "String" }, { value: "number", label: "Number" }] },
    { name: "fallback", label: "Fallback value", value: v.fallback, optional: true, placeholder: "Used when the variable isn’t passed" },
  ], submit: v.name ? "Save" : "Create", validate: (x) => /^[a-zA-Z_][\w]*$/.test(x.name), onSubmit: async (x) => x });
}
function variablesDrawer(t, set) {
  drawer({ title: "Variables", body: `<div data-list></div><button class="btn btn-secondary" data-add>${icon("plus", 13)} Create variable</button>`, onMount(d) {
    const draw = () => { d.querySelector("[data-list]").innerHTML = t.variables.length ? `<div class="table-wrap"><table class="t"><thead><tr><th>Name</th><th>Type</th><th>Fallback</th><th></th></tr></thead><tbody>${t.variables.map((v, i) => `<tr><td class="mono">${esc(v.name)}</td><td class="muted">${esc(v.type)}</td><td class="muted">${esc(v.fallback || "—")}</td><td class="act"><button class="ibtn" data-ed="${i}">${icon("edit")}</button><button class="ibtn" data-del="${i}">${icon("trash")}</button></td></tr>`).join("")}</tbody></table></div>` : `<p class="muted">No variables yet. Type <span class="mono">{{</span> in the editor to insert one.</p>`; };
    draw();
    d.querySelector("[data-add]").onclick = async () => { const v = await variableModal(); if (v && v !== true) { t.variables = [...t.variables.filter((x) => x.name !== v.name), v]; set("variables", t.variables); draw(); } };
    on(d, "click", "[data-del]", (_e, b) => { t.variables.splice(+b.dataset.del, 1); set("variables", [...t.variables]); draw(); });
    on(d, "click", "[data-ed]", async (_e, b) => { const i = +b.dataset.ed; const v = await variableModal(t.variables[i]); if (v && v !== true) { t.variables[i] = v; set("variables", [...t.variables]); draw(); } });
  } });
}
function historyDrawer(t, versions, onRestore) {
  drawer({ title: "Version history", body: versions.length ? `<div class="vtl">${versions.map((v) => `<div class="vtl-item"><span class="dot" style="background:${v.version === t.published_version ? "var(--green-2)" : "var(--fg-3)"};width:8px;height:8px;margin-left:5px"></span><div><div>Version ${v.version}${v.version === t.published_version ? ` ${badge("Live", "green")}` : ""}</div><div class="t">${esc(v.created_by_name || "")} · ${fmtDateTime(v.created_at)}</div></div><div class="row-flex"><button class="btn btn-ghost btn-sm" data-view="${v.version}">View</button>${v.version !== t.published_version || new Date(t.updated_at) > new Date(v.created_at) ? `<button class="btn btn-secondary btn-sm" data-restore="${v.version}">Restore</button>` : ""}</div></div>`).join("")}</div>` : `<p class="muted">Nothing published yet. Each publish saves a version you can come back to.</p>`,
    onMount(d, close) {
      on(d, "click", "[data-view]", (_e, b) => { const v = versions.find((x) => x.version === +b.dataset.view); previewModal(v.snapshot.content || { blocks: [] }, { subject: v.snapshot.subject }); });
      on(d, "click", "[data-restore]", (_e, b) => { const v = versions.find((x) => x.version === +b.dataset.restore); close(); onRestore(v.snapshot, v.version); });
    } });
}
