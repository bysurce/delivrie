// AI writing in the email editor (Broadcasts and Templates): write an email from a URL or a brief in the team's
// brand voice, rewrite selected blocks, suggest subject lines, and see an agent's edits arrive live.
import { sb, state, api } from "./sb.js";
import { esc, icon, menu, modal, popover, toast, errToast, el, selectHtml, bindSelects } from "./ui.js";
import { blocksToText } from "./blocks.js";

type Kind = "broadcast" | "template";
interface Meta { subject?: string | null; preview_text?: string | null }
interface Opts {
  ed: any; kind: Kind;
  getMeta: () => Meta;
  /** persist false: show the values without saving them (they came from the server) */
  setMeta: (m: Meta, persist?: boolean) => void;
  /** variable names the email can use ({{first_name}} …) */
  vars?: () => string[];
}

// ------------------------------------------------------------ undo bar
let undoEl: HTMLElement | null = null;
function offerUndo(msg: string, undo: () => void, note?: string | null) {
  undoEl?.remove();
  const bar = el(`<div class="ai-undo" role="status">${icon("sparkle", 14)}<span class="grow">${esc(msg)}${note ? `<span class="dim"> · ${esc(note)}</span>` : ""}</span><button class="btn btn-ghost btn-sm" data-undo>Undo</button><button class="ibtn" data-x aria-label="Dismiss">${icon("x", 13)}</button></div>`) as HTMLElement;
  document.body.appendChild(bar); undoEl = bar;
  const close = () => { bar.remove(); if (undoEl === bar) undoEl = null; };
  bar.querySelector<HTMLElement>("[data-undo]")!.onclick = () => { undo(); close(); toast("Undone"); };
  bar.querySelector<HTMLElement>("[data-x]")!.onclick = close;
  setTimeout(close, note ? 30_000 : 15_000);
}

const busyHtml = (label: string) => `<span class="spinner"></span> ${esc(label)}`;
const brandFill = () => state.team?.brand?.primary && /^#[0-9a-f]{6}$/i.test(state.team.brand.primary) ? { fill: state.team.brand.primary, color: state.team.brand.button_text || "#FFFFFF" } : null;

/** Puts new blocks into the current document: keeps logo blocks at the top and the existing footer at the end. */
function mergeDraft(current: any, blocks: any[], kind: Kind) {
  const keepTop = (current.blocks || []).filter((b) => b.type === "logo" || b.zone === "header");
  const oldFooter = (current.blocks || []).find((b) => b.type === "footer");
  let body = blocks.filter((b) => b.type !== "logo");
  if (kind === "broadcast" && oldFooter) body = [...body.filter((b) => b.type !== "footer"), oldFooter];
  const fill = brandFill();
  if (fill) body = body.map((b) => b.type === "button" ? { ...b, ...fill } : b);
  if (current.page?.layout === "card") body = body.map((b) => b.type === "footer" ? { ...b, zone: b.zone || "footer" } : b);
  return { ...current, blocks: [...keepTop, ...body] };
}

// ------------------------------------------------------------ write from a URL or a brief
export function draftModal(o: Opts, start: "url" | "brief" = "url") {
  const cur = o.ed.getDoc();
  const empty = !blocksToText(cur).trim();
  return modal({
    title: "Write with AI", size: "lg",
    body: `<p class="desc">Delivrie writes a first draft in your brand voice. You can edit everything afterwards${empty ? "" : ", and undo it"}.</p>
      <div class="field"><label for="aiurl">Write from a page <span class="dim">Optional</span></label><input class="input" id="aiurl" placeholder="https://acme.com/blog/november-update" ${start === "url" ? "autofocus" : ""}><div class="hint">A blog post, changelog, product or event page. Delivrie reads it and uses its facts, links and images.</div></div>
      <div class="field"><label for="aibrief">What’s the email for?${start === "url" ? ` <span class="dim">Optional</span>` : ""}</label><textarea class="textarea" id="aibrief" rows="4" placeholder="${o.kind === "broadcast" ? "Announce the new dashboard to all customers. Mention the 30-day free trial of Pro, and link to the changelog." : "A welcome email after sign-up: confirm the account, link to the quickstart, and say where to get help."}" ${start === "brief" ? "autofocus" : ""}></textarea></div>
      <div class="row-flex" style="gap:12px;align-items:flex-start"><div class="field grow"><label>Length</label>${selectHtml("length", [{ value: "short", label: "Short" }, { value: "medium", label: "Medium" }, { value: "long", label: "Long" }], "medium")}</div><div class="field grow"><label for="aitone">Tone <span class="dim">Optional</span></label><input class="input" id="aitone" placeholder="Your brand voice"></div></div>
      ${empty ? "" : `<p class="hint" style="display:flex;gap:6px;align-items:center">${icon("info", 12)} This replaces the content of this ${o.kind}${o.kind === "broadcast" ? ", keeping your logo and unsubscribe footer" : ", keeping your logo"}.</p>`}
      <p class="hint" data-voice style="display:flex;gap:6px;align-items:center"></p>`,
    foot: `<button class="btn btn-ghost" data-cancel>Cancel</button><button class="btn btn-primary" data-go>${icon("sparkle", 13)} Write it</button>`,
    onMount(m, close) {
      let length = "medium";
      bindSelects(m, (_n, v) => { length = v; });
      api("GET", "/ai/voice").then((v) => { const h = m.querySelector("[data-voice]"); if (h) h.innerHTML = v.voice ? `${icon("check", 12)} Uses your brand voice. <a href="/settings/brand-voice">Edit it</a>` : `No brand voice yet. <a href="/settings/brand-voice">Set one up</a> so drafts sound like you.`; }).catch(() => {});
      const go = m.querySelector("[data-go]") as HTMLButtonElement;
      go.onclick = async () => {
        const url = (m.querySelector("#aiurl") as HTMLInputElement).value.trim();
        const brief = (m.querySelector("#aibrief") as HTMLTextAreaElement).value.trim();
        const tone = (m.querySelector("#aitone") as HTMLInputElement).value.trim();
        if (!url && !brief) return toast("Add a page to write from, or say what the email is for", "err");
        go.disabled = true; go.innerHTML = busyHtml(url ? "Reading the page…" : "Writing…");
        const slow = setTimeout(() => { go.innerHTML = busyHtml("Writing…"); }, 4000);
        try {
          const r = await api("POST", "/ai/draft", { url: url || undefined, brief: brief || undefined, tone: tone || undefined, length, kind: o.kind, variables: o.vars?.() });
          const before = o.ed.getDoc(), meta = o.getMeta();
          o.ed.setDoc(mergeDraft(before, r.content.blocks, o.kind));
          o.setMeta({ subject: r.subject || meta.subject, ...(o.kind === "broadcast" ? { preview_text: r.preview_text || meta.preview_text } : {}) });
          (o.ed as any).changedNow?.();
          close(true);
          offerUndo(r.source ? `Written from ${r.source.title || r.source.url}` : "Draft written", () => { o.ed.setDoc(before); o.setMeta(meta); (o.ed as any).changedNow?.(); }, r.notes);
        } catch (e) { errToast(e); go.disabled = false; go.innerHTML = `${icon("sparkle", 13)} Write it`; }
        finally { clearTimeout(slow); }
      };
    },
  });
}

// ------------------------------------------------------------ rewrite selected blocks
const QUICK = [["Shorter", "Make it shorter and tighter without losing information."], ["Clearer", "Make it clearer and simpler to read."], ["Friendlier", "Make it warmer and friendlier."], ["More formal", "Make it more formal and professional."], ["Punchier", "Make it punchier and more direct."], ["Fix grammar", "Fix spelling, grammar and punctuation only. Change nothing else."]];
export function rewritePopover(o: Opts, anchor: Element, ids?: string[]) {
  const pick = ids?.length ? ids : o.ed.selectedIds();
  const doc = o.ed.getDoc();
  const blocks = pick.length ? doc.blocks.filter((b) => pick.includes(b.id)) : doc.blocks.filter((b) => !["footer", "logo", "spacer", "divider", "html"].includes(b.type));
  if (!blocks.length) return toast("Select a block to rewrite", "err");
  const label = pick.length ? (pick.length === 1 ? "this block" : `these ${pick.length} blocks`) : "the whole email";
  popover(anchor, `<div style="padding:10px"><div class="dim" style="font-size:calc(12px + var(--fs-up, 0px));margin-bottom:8px">Rewrite ${label}</div>
    <div class="chip-row" style="margin-bottom:8px">${QUICK.map(([l], i) => `<button class="pill" data-q="${i}">${esc(l)}</button>`).join("")}</div>
    <div class="row-flex" style="gap:6px"><input class="input" data-ins placeholder="Or say how: “add a line about the free trial”" style="height:32px"><button class="btn btn-primary btn-sm" data-go>${icon("sparkle", 12)}</button></div>
    <div class="hint" style="margin-top:6px">Shift-click blocks to rewrite several at once.</div></div>`, { width: 380, onMount(p, close) {
    const inp = p.querySelector("[data-ins]") as HTMLInputElement; inp.focus();
    const run = async (instruction: string, btn: HTMLElement) => {
      p.querySelectorAll("button").forEach((b) => ((b as HTMLButtonElement).disabled = true));
      const was = btn.innerHTML; btn.innerHTML = `<span class="spinner"></span>`;
      try {
        const rest = blocksToText({ ...doc, blocks: doc.blocks.filter((b) => !blocks.includes(b)) });
        const r = await api("POST", "/ai/rewrite", { blocks, instruction, kind: o.kind, subject: o.getMeta().subject, context: rest.slice(0, 5000) });
        const before = o.ed.getDoc();
        o.ed.replaceBlocks(blocks.map((b) => b.id), r.blocks);
        close();
        offerUndo(`Rewrote ${label}`, () => { o.ed.setDoc(before); (o.ed as any).changedNow?.(); });
      } catch (e) { errToast(e); p.querySelectorAll("button").forEach((b) => ((b as HTMLButtonElement).disabled = false)); btn.innerHTML = was; }
    };
    p.addEventListener("click", (e) => {
      const q = (e.target as Element).closest<HTMLElement>("[data-q]"); if (q) return run(QUICK[+q.dataset.q!][1], q);
      const g = (e.target as Element).closest<HTMLElement>("[data-go]"); if (g && inp.value.trim()) run(inp.value.trim(), g);
    });
    inp.addEventListener("keydown", (e) => { if (e.key === "Enter" && inp.value.trim()) run(inp.value.trim(), p.querySelector("[data-go]") as HTMLElement); });
  } });
}

// ------------------------------------------------------------ subject lines
export function subjectsModal(o: Opts) {
  const text = blocksToText(o.ed.getDoc()).trim();
  if (text.length < 20) return toast("Write some of the email first, then ask for subject lines", "err");
  return modal({ title: "Subject line ideas", body: `<div data-list><p class="dim"><span class="spinner"></span> Thinking of subject lines…</p></div>`, foot: `<button class="btn btn-ghost" data-cancel>Close</button>`, onMount(m, close) {
    api("POST", "/ai/subjects", { text: text.slice(0, 7000), current: o.getMeta().subject || undefined }).then((r) => {
      m.querySelector("[data-list]")!.innerHTML = `<div class="ai-ideas">${r.data.map((x, i) => `<button class="ai-idea" data-i="${i}"><b>${esc(x.subject)}</b>${x.preview_text && o.kind === "broadcast" ? `<span class="dim">${esc(x.preview_text)}</span>` : ""}</button>`).join("")}</div><p class="hint">Click one to use it.</p>`;
      m.addEventListener("click", (e) => { const b = (e.target as Element).closest<HTMLElement>("[data-i]"); if (!b) return; const x = r.data[+b.dataset.i!]; const meta = o.getMeta(); o.setMeta({ subject: x.subject, ...(o.kind === "broadcast" && x.preview_text ? { preview_text: x.preview_text } : {}) }); close(true); offerUndo("Subject updated", () => o.setMeta(meta)); });
    }).catch((e) => { errToast(e); close(); });
  } });
}

// ------------------------------------------------------------ the AI menu in the editor's top bar
export function aiButtonHtml() { return `<button class="btn btn-ghost btn-sm" data-ai>${icon("sparkle", 13)} AI</button>`; }
export function mountAi(root: Element, o: Opts) {
  const btn = root.querySelector<HTMLElement>("[data-ai]");
  if (!btn) return;
  btn.onclick = () => {
    const sel = o.ed.selectedIds();
    menu(btn, [
      { header: "Write with AI" },
      { label: "Write from a page…", icon: "globe", onClick: () => draftModal(o, "url") },
      { label: "Write from a brief…", icon: "edit", onClick: () => draftModal(o, "brief") },
      { label: sel.length ? `Rewrite ${sel.length === 1 ? "selected block" : `${sel.length} selected blocks`}…` : "Rewrite the email…", icon: "sparkle", onClick: () => rewritePopover(o, btn) },
      { label: "Suggest subject lines", icon: "mail", onClick: () => subjectsModal(o) },
      { sep: true },
      { label: "Brand voice", icon: "settings", onClick: () => { location.href = "/settings/brand-voice"; } },
      { label: "Let an agent edit this…", icon: "terminal", onClick: () => agentHelp(o) },
    ], { width: 250 });
  };
}

function agentHelp(o: Opts) {
  const id = (o as any).id || "";
  const prompt = `Open the Delivrie ${o.kind} ${id} with get_email_content, then improve it with edit_email_content: ...`;
  modal({ title: "Let an agent edit this email", body: `<p class="desc">Connect Claude, Cursor, Codex or any MCP client to <a href="/docs/mcp">Delivrie’s MCP server</a>. When it changes this ${o.kind} with <code>edit_email_content</code>, the edits show up here while you watch, and you can undo them.</p>
    <div class="field"><label>Example prompt</label><textarea class="textarea mono" rows="3" readonly>${esc(prompt)}</textarea></div>
    <p class="hint">The ${o.kind} id is <code>${esc(id)}</code>. Agents can also call the API: <code>POST /${o.kind}s/${esc(id)}/content</code>.</p>`, foot: `<button class="btn btn-primary" data-cancel>Done</button>` });
}

// ------------------------------------------------------------ live edits from agents
/**
 * Polls the row's agent_edit stamp while the editor is open. When an agent changes the email, its edit is applied
 * straight away if there are no unsaved local changes; otherwise a banner offers to load it.
 */
export function watchAgentEdits(root: Element, o: Opts & { id: string; table: "templates" | "broadcasts"; initial: any; hasPending: () => boolean; onApplied: (row: any) => void }) {
  let rev = Number(o.initial?.rev) || 0;
  let pendingRow: any = null;
  const pill = el(`<span class="ai-live hidden">${icon("sparkle", 12)}<span data-who></span></span>`) as HTMLElement;
  root.querySelector(".editor-top [data-saved]")?.after(pill);
  const apply = (row: any) => {
    const before = o.ed.getDoc(), meta = o.getMeta();
    const prevIds = new Map(before.blocks.map((b) => [b.id, JSON.stringify(b)]));
    const changed = (row.content?.blocks || []).filter((b) => prevIds.get(b.id) !== JSON.stringify(b)).map((b) => b.id);
    o.ed.applyRemote({ ...row.content, changed });
    o.setMeta({ subject: row.subject, ...(o.kind === "broadcast" ? { preview_text: row.preview_text } : {}) }, false);
    o.onApplied(row);
    pill.classList.remove("hidden"); pill.querySelector("[data-who]")!.textContent = `${row.agent_edit.by} edited this`;
    clearTimeout((pill as any)._t); (pill as any)._t = setTimeout(() => pill.classList.add("hidden"), 20_000);
    offerUndo(`${row.agent_edit.by}${row.agent_edit.summary ? `: ${row.agent_edit.summary}` : " edited this email"}`, () => { o.ed.setDoc(before); o.setMeta(meta); (o.ed as any).changedNow?.(); });
  };
  const banner = el(`<div class="ai-remote hidden">${icon("sparkle", 13)}<span class="grow" data-msg></span><button class="btn btn-secondary btn-sm" data-load>Load their changes</button><button class="btn btn-ghost btn-sm" data-keep>Keep mine</button></div>`) as HTMLElement;
  root.querySelector(".editor-doc")?.prepend(banner);
  banner.querySelector<HTMLElement>("[data-load]")!.onclick = () => { if (pendingRow) apply(pendingRow); pendingRow = null; banner.classList.add("hidden"); };
  banner.querySelector<HTMLElement>("[data-keep]")!.onclick = () => { pendingRow = null; banner.classList.add("hidden"); };
  let stopped = false;
  const tick = async () => {
    if (stopped) return;
    if (!document.body.contains(root) || !root.querySelector("[data-editor]")) { stopped = true; return; }
    if (document.visibilityState === "visible") {
      const { data } = await sb.from(o.table).select("agent_edit").eq("id", o.id).maybeSingle();
      const r = Number(data?.agent_edit?.rev) || 0;
      if (r > rev) {
        rev = r;
        const { data: row } = await sb.from(o.table).select(o.table === "broadcasts" ? "content,subject,preview_text,agent_edit,updated_at" : "content,subject,agent_edit,updated_at").eq("id", o.id).maybeSingle();
        if (row) {
          if (o.hasPending()) { pendingRow = row; banner.querySelector("[data-msg]")!.textContent = `${row.agent_edit.by} changed this email while you were editing.`; banner.classList.remove("hidden"); }
          else apply(row);
        }
      }
    }
    setTimeout(tick, 3000);
  };
  setTimeout(tick, 3000);
  return { stop() { stopped = true; } };
}
