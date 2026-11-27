// Support chat (Figma: App · 10 Help & feedback → 10.6 Support chat). Docked bottom-right on every app screen.
// Home → ask the assistant (answers from the docs and the account, with sources) → "Talk to a person" (pick a topic,
// context attached automatically) → a numbered ticket the team answers from Admin → Support → resolved and rated.
// When the panel is closed and the team replies, the tab shows an unread count and a short preview.
// Shortcut: "?" opens it. A one-time nudge appears after a failed action.
// The same widget runs on the marketing site (site-config.js loads it on click): signed-in visitors get the full chat,
// everyone else gets the assistant (docs only) and leaves an email address when they ask for a person.
import { api as appApi, state, loadSession, loadTeams } from "./sb.js";
import { esc, icon, errToast, toast } from "./ui.js";
// The docs index is big (about 150 KB), so it loads only when the Help tab needs it, or quietly once the chat is open.
let docsMod = null;
const loadDocs = () => (docsMod ||= import("./docs.js").catch((e) => { docsMod = null; throw e; }));
// Phones: don't pop the keyboard the moment the panel opens.
const finePointer = () => { try { return matchMedia("(hover: hover) and (pointer: fine)").matches; } catch { return true; } };

const MARK_PATHS = '<path d="M45.621 15.8308C47.0004 16.948 47.0004 19.052 45.621 20.1692L33.6 29.9049C31.775 31.3829 29.0518 30.0841 29.0518 27.7357L29.0518 8.26426C29.0518 5.91588 31.775 4.61707 33.6 6.09507L45.621 15.8308Z" fill="#FAD600"/><path d="M27.7507 14.2163C29.6239 16.391 29.624 19.609 27.7507 21.7837L19.8975 30.9006C17.5846 33.5857 13.4253 33.5857 11.1125 30.9006L3.25923 21.7837C1.386 19.609 1.386 16.391 3.25923 14.2163L11.1124 5.09937C13.4253 2.41433 17.5846 2.41432 19.8975 5.09937L27.7507 14.2163Z" fill="#FAD600"/>';
const mark = (w) => `<svg width="${w}" height="${(w * 0.75).toFixed(2)}" viewBox="0 0 48 36" fill="none" aria-hidden="true">${MARK_PATHS}</svg>`;
const botAv = (s = 24) => `<span class="sc-av-d" style="width:${s}px;height:${s}px">${mark(s * 0.58)}</span>`;
const TINTS = ["#e8e4de", "#fff7d1", "#e4f5ea", "#e5edfb", "#f6e6f0"];
const tint = (s) => TINTS[[...String(s)].reduce((n, ch) => n + ch.charCodeAt(0), 0) % TINTS.length];
const personAv = (ini, s = 24) => `<span class="sc-av-p" style="width:${s}px;height:${s}px;font-size:${(s * 0.38).toFixed(2)}px;--t:${tint(ini)}">${esc(ini)}</span>`;
const initials = (n) => { const w = String(n || "").trim().split(/\s+/).filter(Boolean); return (w.length > 1 ? w[0][0] + w[1][0] : (w[0] || "D").slice(0, 2)).toUpperCase(); };
const time = (iso) => new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
const ago = (iso) => { const s = (Date.now() - new Date(iso).getTime()) / 1000; return s < 60 ? "just now" : s < 3600 ? `${Math.floor(s / 60)} min ago` : s < 86400 ? `${Math.floor(s / 3600)} h ago` : new Date(iso).toLocaleDateString([], { day: "numeric", month: "short" }); };
const ls = { get: (k) => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* private mode */ } } };

// Message text: paragraphs, numbered lines, ``` code (with Copy), > quoted headers, `inline code` and links.
function richText(body) {
  const out = [];
  const parts = String(body || "").split(/```[a-z]*\n?([\s\S]*?)```/g);
  parts.forEach((part, i) => {
    if (i % 2) { out.push(`<div class="sc-code"><pre>${esc(part.replace(/\n$/, ""))}</pre></div>`); return; }
    for (const para of part.split(/\n{2,}/)) {
      const t = para.trim();
      if (!t) continue;
      if (t.split("\n").every((l) => l.startsWith(">"))) { out.push(`<div class="sc-quote">${t.split("\n").map((l) => flag(esc(l.replace(/^>\s?/, "")))).join("<br>")}</div>`); continue; }
      for (const line of t.split("\n")) out.push(`<p>${inline(line)}</p>`);
    }
  });
  return out.join("");
}
const flag = (s) => s.replace(/\b([\w-]+=(?:none|fail|softfail|permerror|missing))\b/gi, '<span class="bad">$1</span>');
const inline = (s) => esc(s).replace(/`([^`]+)`/g, "<code>$1</code>").replace(/https?:\/\/[^\s<]+/g, (u) => `<a href="${u}" target="_blank" rel="noopener">${u}</a>`);

// How the widget talks to the API: as the signed-in user (dashboard API), or as a visitor (public API with a token).
let T = { api: (m, p, b) => appApi(m, p, b), guest: false, name: "", email: "" };
function guestToken() {
  let t = ls.get("dlv_support_guest");
  if (!t || !/^[A-Za-z0-9_-]{32,}$/.test(t)) { const a = crypto.getRandomValues(new Uint8Array(32)); t = btoa(String.fromCharCode(...a)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); ls.set("dlv_support_guest", t); }
  return t;
}
async function guestApi(method, path, body) {
  const res = await fetch("/api/public" + path, { method, headers: { "content-type": "application/json", "x-support-token": guestToken() }, body: method === "GET" ? undefined : JSON.stringify(body || {}) });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j?.message || `Request failed (${res.status})`);
  return j;
}
const api = (m, p, b) => T.api(m, p, b);
let tReady = Promise.resolve();
let mounted = false;
const S = { open: false, view: "home", threadId: null, home: null, list: null, thread: null, msgs: [], typing: false, seen: false, promise: null, sending: false, topic: null, keep: null, expanded: {}, helpQ: "", poll: null, unread: 0, preview: null, nudged: false, menu: false, statusOk: null };
let root, tab, panel, nudgeEl, previewEl;

export function mountChat(opts = {}) {
  if (mounted) return;
  if (!opts.site) {
    if (!state.user) return;
    T = { api: (m, p, b) => appApi(m, p, b), guest: false, name: state.profile?.full_name || "", email: state.user.email };
  }
  mounted = true;
  root = opts.root || document.createElement("div");
  root.className = opts.site ? "sc site" : "sc";
  root.innerHTML = `<div class="sc-nudge" hidden role="status"></div><div class="sc-preview" hidden role="status"></div>
    <section class="sc-panel" role="dialog" aria-label="Delivrie support" hidden></section>
    <button class="sc-tab" aria-label="Contact support" aria-expanded="false"></button>`;
  if (!root.isConnected) document.body.appendChild(root);
  tab = root.querySelector(".sc-tab"); panel = root.querySelector(".sc-panel"); nudgeEl = root.querySelector(".sc-nudge"); previewEl = root.querySelector(".sc-preview");
  // The dashboard is a single-page app; hide the tab on admin pages, where the team answers instead.
  const place = () => { root.hidden = !opts.site && location.pathname.startsWith("/admin"); };
  place(); setInterval(place, 800);
  drawTab();
  tab.addEventListener("click", () => setOpen(!S.open));
  root.addEventListener("click", onClick);
  root.addEventListener("submit", onSubmit);
  root.addEventListener("keydown", onKey);
  root.addEventListener("input", (e) => { if (e.target.matches("[data-guest-email]")) { S.guestEmail = e.target.value; e.target.classList.remove("bad"); } if (e.target.matches("[data-guest-name]")) S.guestName = e.target.value; if (e.target.matches(".sc-input textarea")) grow(e.target); if (e.target.matches("[data-help-q]")) { S.helpQ = e.target.value; drawHelpResults(); } });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && S.open) { if (S.menu) { S.menu = false; draw(); } else setOpen(false); }
    if (e.key === "?" && !S.open && !e.metaKey && !e.ctrlKey && !/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || "") && !document.activeElement?.isContentEditable) { e.preventDefault(); setOpen(true); }
  });
  window.addEventListener("dlv:failed", () => showNudge());
  const qs = new URLSearchParams(location.search), q = qs.get("support");
  if (q) {
    history.replaceState(history.state, "", location.pathname + location.hash); // keep the resume key out of the address bar
    if (q !== "1") { S.view = "thread"; S.threadId = q; }
    const key = qs.get("key");
    const claim = q !== "1" && key ? tReady.then(() => (T.guest ? api("POST", "/support/claim", { thread_id: q, key }) : null)).catch(() => null) : Promise.resolve();
    claim.then(() => setOpen(true));
  } else if (!opts.open) checkUnread();
  if (opts.open && !q) setOpen(true);
  schedule();
}

// The marketing site: signed-in visitors use their session, everyone else is a visitor. Called by site-config.js.
export function mountSite({ root: el, open = false } = {}) {
  // Draw and open straight away; the sign-in check runs alongside, and the first request waits for it.
  const guestT = { api: guestApi, guest: true, name: "", email: "" };
  tReady = (async () => {
    try { await loadSession(); if (state.user) { await loadTeams(); if (state.team) return { api: (m, p, b) => appApi(m, p, b), guest: false, name: state.profile?.full_name || "", email: state.user.email }; } } catch { /* treat as a visitor */ }
    return guestT;
  })().then((t) => { T = t; if (S.open && S.view === "home") draw(); });
  T = { api: async (m, p, b) => { await tReady; return T.api(m, p, b); }, guest: true, name: "", email: "" };
  mountChat({ site: true, root: el, open });
  return { open: () => setOpen(true) };
}

// Lets other pages (Help, error states) open the chat, optionally on a question or straight into "Talk to a person".
export function openChat(opts = {}) {
  if (!mounted) mountChat();
  setOpen(true);
  if (opts.question) ask(opts.question);
  else if (opts.person) handoff();
}
export function nudgeChat() { showNudge(); }

// ------------------------------------------------------------ open / close, tab, nudge, preview
async function setOpen(v) {
  S.open = v; S.menu = false;
  panel.hidden = !v; tab.setAttribute("aria-expanded", String(v));
  root.classList.toggle("on", v);
  document.documentElement.classList.toggle("sc-open", v);
  nudgeEl.hidden = true; previewEl.hidden = true;
  drawTab();
  if (v) {
    setTimeout(() => loadDocs().catch(() => {}), 1200);
    if (S.view === "thread" && S.threadId) await loadThread(); else { S.view = S.view === "thread" ? "home" : S.view; await loadHome(); }
    focusInput();
  }
  schedule();
}
function drawTab() {
  if (S.open) { tab.className = "sc-tab open"; tab.innerHTML = icon("x", 20); tab.setAttribute("aria-label", "Close support"); return; }
  tab.className = "sc-tab";
  tab.setAttribute("aria-label", S.unread ? `Contact support, ${S.unread} unread` : "Contact support");
  tab.innerHTML = `<span class="sc-tab-av">${mark(19.84)}</span><span>Contact support</span>${S.unread ? `<span class="sc-badge">${S.unread > 9 ? "9+" : S.unread}</span>` : ""}`;
}
function showNudge() {
  if (S.open || S.nudged || root.hidden) return;
  const day = new Date().toDateString();
  if (ls.get("dlv_chat_nudge") === day) return;
  S.nudged = true; ls.set("dlv_chat_nudge", day);
  nudgeEl.innerHTML = `<button class="sc-nudge-main" data-act="nudge-open">${botAv(28)}<span><b>Stuck on something?</b><span>Ask the assistant or reach the team.</span></span></button><button class="sc-ib" data-act="nudge-x" aria-label="Dismiss">${icon("x", 16)}</button>`;
  nudgeEl.hidden = false;
  setTimeout(() => { nudgeEl.hidden = true; }, 15000);
}
async function checkUnread() {
  try {
    const r = await api("GET", "/support/unread");
    S.unread = r.unread || 0;
    if (S.unread) ls.set("dlv_support_active", "1");
    drawTab();
    const l = r.latest;
    if (!S.open && l && S.unread && ls.get("dlv_chat_preview") !== l.at) {
      S.preview = l;
      previewEl.innerHTML = `<div class="sc-pv-head">${personAv(l.initials, 28)}<div><b>${esc(l.name)}</b><span>${esc(l.ticket ? l.ticket + " · " : "")}${esc(ago(l.at))}</span></div><button class="sc-ib" data-act="pv-x" aria-label="Dismiss">${icon("x", 16)}</button></div>
        <p>${esc(l.preview || "")}</p><div class="sc-row"><button class="sc-btn dark" data-act="pv-open">Open chat</button><button class="sc-btn" data-act="pv-x">Later</button></div>`;
      previewEl.hidden = false;
    }
  } catch { /* offline: next tick */ }
}
function schedule() {
  clearTimeout(S.poll);
  const live = S.open && S.view === "thread" && S.thread && S.thread.status !== "bot";
  S.poll = setTimeout(async () => {
    if (document.visibilityState === "visible" && !root.hidden) {
      if (live) await loadThread(true); else if (!S.open) await checkUnread();
    }
    schedule();
  }, live ? 4000 : S.open ? 30000 : 45000);
}

// ------------------------------------------------------------ data
async function loadHome() {
  draw();
  try {
    const [h, st] = await Promise.all([api("GET", `/support/home?page=${encodeURIComponent(location.pathname)}`), S.statusOk === null ? fetchStatus() : null]);
    S.home = h; S.unread = h.unread || 0;
    if (st !== null) S.statusOk = st;
  } catch (e) { S.home = S.home || { error: e.message }; }
  draw();
}
async function fetchStatus() {
  try { const r = await fetch("/api/public/status").then((x) => x.json()); return r.status ? r.status === "operational" : !!r.sending; } catch { return null; }
}
async function loadList() {
  try { S.list = (await api("GET", "/support/threads")).data; } catch (e) { errToast(e); S.list = S.list || []; }
  draw();
}
async function loadThread(quiet = false) {
  if (!S.threadId) return;
  if (!quiet) { S.thread = S.thread?.id === S.threadId ? S.thread : null; draw(); }
  try {
    const r = await api("GET", `/support/threads/${S.threadId}`);
    const sig = (x) => `${x.thread.status}|${x.messages.length}|${x.messages.at(-1)?.id}|${x.typing}|${x.seen}|${x.thread.rating}`;
    const changed = !S.thread || sig(r) !== sig({ thread: S.thread, messages: S.msgs, typing: S.typing, seen: S.seen });
    S.thread = r.thread; S.msgs = r.messages; S.typing = r.typing; S.seen = r.seen; S.promise = r.promise;
    const ho = handoffPending();
    if (ho && !S.keep) { S.topic = ho.meta.suggested || null; S.keep = new Set((ho.meta.attachments || []).map((a) => `${a.type}:${a.id}`)); }
    if (changed) { const keep = draftOf(); draw(); restoreDraft(keep); }
    S.unread = 0; drawTab();
  } catch (e) { if (!quiet) { errToast(e); S.view = "home"; S.threadId = null; loadHome(); } }
}
function draftOf() { const ta = panel.querySelector(".sc-input textarea"); return ta ? { v: ta.value, f: document.activeElement === ta } : null; }
function restoreDraft(d) { const ta = panel.querySelector(".sc-input textarea"); if (ta && d) { ta.value = d.v; grow(ta); if (d.f) ta.focus(); } }

// ------------------------------------------------------------ actions
async function ask(text) {
  text = String(text || "").trim();
  if (!text || S.sending) return;
  const pendingHandoff = handoffPending();
  if (pendingHandoff) return escalate(text);
  S.sending = true;
  if (S.view !== "thread" || !S.thread) { S.view = "thread"; S.threadId = null; S.thread = { id: null, status: "bot" }; S.msgs = []; }
  const temp = { id: "tmp" + Date.now(), author: "customer", body: text, created_at: new Date().toISOString(), meta: {}, pending: true };
  S.msgs = [...S.msgs, temp];
  const thinking = S.thread.status === "bot";
  draw({ thinking });
  try {
    const r = await api("POST", "/support/messages", { thread_id: S.thread.id || undefined, body: text });
    S.thread = r.thread; S.threadId = r.thread.id;
    S.msgs = [...S.msgs.filter((m) => m !== temp), ...r.messages];
  } catch (e) { S.msgs = S.msgs.filter((m) => m !== temp); errToast(e); draw(); restoreDraft({ v: text, f: true }); S.sending = false; return; }
  S.sending = false;
  draw(); focusInput(); schedule();
}
function handoffPending() {
  if (!S.thread || S.thread.status !== "bot") return null;
  const last = [...S.msgs].reverse().find((m) => m.author === "bot");
  return last?.meta?.kind === "topics" ? last : null;
}
async function handoff() {
  if (S.sending) return;
  S.sending = true;
  if (S.view !== "thread" || !S.thread) { S.view = "thread"; S.threadId = null; S.thread = { id: null, status: "bot" }; S.msgs = []; }
  draw({ thinking: true });
  try {
    const r = await api("POST", "/support/handoff", { thread_id: S.thread.id || undefined });
    S.thread = r.thread; S.threadId = r.thread.id; S.msgs = [...S.msgs, ...r.messages];
    const t = r.messages.find((m) => m.meta?.kind === "topics");
    S.topic = t?.meta?.suggested || null; S.keep = new Set((t?.meta?.attachments || []).map((a) => `${a.type}:${a.id}`)); S.expanded = {};
  } catch (e) { errToast(e); }
  S.sending = false;
  draw(); focusInput();
}
async function escalate(text) {
  const t = handoffPending();
  if (!t) return;
  if (!S.topic) { toast("Pick what it’s about first", "err"); restoreDraft({ v: text, f: true }); return; }
  if (t.meta.ask_email) {
    S.guestEmail = (panel.querySelector("[data-guest-email]")?.value || S.guestEmail || "").trim();
    S.guestName = (panel.querySelector("[data-guest-name]")?.value || S.guestName || "").trim();
    if (!/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(S.guestEmail)) { const i = panel.querySelector("[data-guest-email]"); i?.classList.add("bad"); i?.focus(); toast("Add the email we should reply to", "err"); restoreDraft({ v: text, f: false }); return; }
  }
  S.sending = true;
  const attachments = (t.meta.attachments || []).filter((a) => S.keep?.has(`${a.type}:${a.id}`)).map((a) => ({ type: a.type, id: a.id }));
  try {
    const r = await api("POST", `/support/threads/${S.thread.id}/escalate`, { topic: S.topic, body: text, attachments, email: S.guestEmail, name: S.guestName });
    S.thread = r.thread; S.promise = r.promise; S.msgs = [...S.msgs, ...r.messages];
    ls.set("dlv_support_active", "1");
  } catch (e) { errToast(e); restoreDraft({ v: text, f: true }); }
  S.sending = false;
  draw(); schedule();
}
async function openThread(id) { S.view = "thread"; S.threadId = id; S.thread = null; S.msgs = []; await loadThread(); focusInput(); schedule(); }
function newConversation() { S.view = "home"; S.threadId = null; S.thread = null; S.msgs = []; loadHome().then(focusInput); schedule(); }

async function onClick(e) {
  const b = e.target.closest("[data-act]");
  if (!b) { if (S.menu && !e.target.closest(".sc-menu")) { S.menu = false; draw(); } return; }
  const act = b.dataset.act;
  if (act === "close") return setOpen(false);
  if (act === "nudge-open") { nudgeEl.hidden = true; return setOpen(true); }
  if (act === "nudge-x") { nudgeEl.hidden = true; return; }
  if (act === "pv-open") { ls.set("dlv_chat_preview", S.preview?.at || ""); previewEl.hidden = true; S.view = "thread"; S.threadId = S.preview?.thread_id; return setOpen(true); }
  if (act === "pv-x") { ls.set("dlv_chat_preview", S.preview?.at || ""); previewEl.hidden = true; return; }
  if (act === "tab") { S.view = b.dataset.v; S.menu = false; if (S.view === "home") loadHome(); else if (S.view === "messages") { S.list = S.list || null; draw(); loadList(); } else { draw(); panel.querySelector("[data-help-q]")?.focus(); } schedule(); return; }
  if (act === "back") { S.view = S.thread && S.thread.status !== "bot" ? "messages" : "home"; S.threadId = null; S.thread = null; if (S.view === "home") loadHome(); else loadList(); schedule(); return; }
  if (act === "menu") { S.menu = !S.menu; draw(); return; }
  if (act === "suggest") return ask(b.dataset.q);
  if (act === "open-thread") return openThread(b.dataset.id);
  if (act === "person") { S.menu = false; return handoff(); }
  if (act === "new") { S.menu = false; return newConversation(); }
  if (act === "helpful") {
    try { const r = await api("POST", `/support/messages/${b.dataset.id}/feedback`, { helpful: true }); const m = S.msgs.find((x) => x.id === b.dataset.id); if (m) m.meta = r.meta; draw(); } catch (err) { errToast(err); }
    return;
  }
  if (act === "topic") { S.topic = b.dataset.id; draw(); focusInput(); return; }
  if (act === "unattach") { S.keep?.delete(b.dataset.key); draw(); return; }
  if (act === "expand") { S.expanded[b.dataset.key] = !S.expanded[b.dataset.key]; draw(); return; }
  if (act === "copy") {
    const txt = b.dataset.copy ?? b.closest(".sc-bubble, .sc-att")?.querySelector("pre")?.textContent ?? "";
    try { await navigator.clipboard.writeText(txt); toast("Copied"); } catch { toast("Couldn’t copy", "err"); }
    return;
  }
  if (act === "action") {
    if (S.sending) return;
    S.sending = true; b.disabled = true;
    try { const r = await api("POST", `/support/threads/${S.thread.id}/action`, { action: b.dataset.id, domain_id: b.dataset.domain }); S.msgs = [...S.msgs, ...r.messages]; } catch (err) { errToast(err); }
    S.sending = false; draw(); return;
  }
  if (act === "rate") { S.rating = b.dataset.r; draw(); panel.querySelector("[data-rate-comment]")?.focus(); return; }
  if (act === "send-rating") {
    if (!S.rating) return toast("Pick Bad, Okay or Great", "err");
    const comment = panel.querySelector("[data-rate-comment]")?.value || "";
    try { const r = await api("POST", `/support/threads/${S.thread.id}/rate`, { rating: S.rating, comment }); S.thread = r.thread; S.rating = null; draw(); } catch (err) { errToast(err); }
    return;
  }
  if (act === "link") { setOpen(false); }
}
function onSubmit(e) {
  const f = e.target.closest("form");
  if (!f) return;
  e.preventDefault();
  if (f.matches("[data-help-form]")) { const q = f.querySelector("input").value.trim(); if (q) ask(q); return; }
  const ta = f.querySelector("textarea, input");
  const text = ta.value.trim();
  if (!text) return;
  ta.value = ""; if (ta.tagName === "TEXTAREA") grow(ta);
  ask(text);
}
function onKey(e) {
  if (e.target.matches(".sc-input textarea") && e.key === "Enter" && !e.shiftKey) { e.preventDefault(); e.target.closest("form").requestSubmit(); }
}
function grow(ta) { ta.style.height = "auto"; ta.style.height = Math.min(ta.scrollHeight, 120) + "px"; const s = ta.closest("form")?.querySelector(".sc-send"); if (s) s.classList.toggle("ready", !!ta.value.trim()); }
function focusInput() { if (!finePointer()) return; requestAnimationFrame(() => panel.querySelector(".sc-input textarea, .sc-ask input")?.focus({ preventScroll: true })); }

// ------------------------------------------------------------ drawing
function draw(opt = {}) {
  if (!S.open) return;
  const v = S.view;
  panel.className = `sc-panel v-${v}`;
  if (v === "home") panel.innerHTML = homeHtml() + tabsHtml();
  else if (v === "messages") panel.innerHTML = listHtml() + tabsHtml();
  else if (v === "help") { panel.innerHTML = helpHtml() + tabsHtml(); drawHelpResults(); }
  else panel.innerHTML = threadHtml(opt);
  const sc = panel.querySelector(".sc-scroll.bottom");
  if (sc) sc.scrollTop = sc.scrollHeight;
}
const ib = (act, name, label) => `<button class="sc-ib" data-act="${act}" aria-label="${label}">${icon(name, 16)}</button>`;
function tabsHtml() {
  const t = (v, ic, label) => `<button class="${S.view === v || (v === "messages" && S.view === "thread") ? "on" : ""}" data-act="tab" data-v="${v}">${icon(ic, 18)}<span>${label}</span>${v === "messages" && S.unread ? '<i class="sc-dot"></i>' : ""}</button>`;
  return `<nav class="sc-tabs">${t("home", "home", "Home")}${t("messages", "inbox", "Messages")}${t("help", "book", "Help")}</nav>`;
}
function menuHtml() {
  if (!S.menu) return "";
  const bot = S.thread?.status === "bot";
  return `<div class="sc-menu" role="menu">${bot || !S.thread ? `<button data-act="person" role="menuitem">${icon("users", 14)} Talk to a person</button>` : ""}<button data-act="new" role="menuitem">${icon("plus", 14)} New conversation</button><a href="/help" data-act="link" role="menuitem">${icon("book", 14)} Help center</a><a href="/status" target="_blank" rel="noopener" role="menuitem">${icon("arrow-up-right", 14)} System status</a></div>`;
}

function homeHtml() {
  const h = S.home || {};
  const name = h.name || (T.name || "").split(" ")[0];
  const team = (h.team || []).slice(0, 3);
  const rows = (h.suggestions || []).map((s) => `<button class="sc-sg" data-act="suggest" data-q="${esc(s.q)}"><span class="sc-sg-ic">${icon(s.icon || "help", 15)}</span><span class="sc-sg-t"><b>${esc(s.title)}</b><span>${esc(s.sub || "")}</span></span>${icon("chevron-right", 15)}</button>`).join("");
  const r = h.recent;
  return `<header class="sc-hero"><div class="sc-hero-top"><div class="sc-brand"><span class="sc-av-d big">${mark(19.84)}</span><b>Delivrie support</b></div><div class="sc-acts">${ib("menu", "more", "More")}${ib("close", "x", "Close")}</div>${menuHtml()}</div>
      <h2>${name ? `Hi ${esc(name)}. ` : ""}How can we help?</h2>
      <div class="sc-team">${team.length ? `<span class="sc-stack">${team.map((p) => personAv(p.initials, 26)).join("")}</span>` : ""}<span>AI answers now · team replies in 1 business day</span></div></header>
    <div class="sc-scroll sc-home">
      <form class="sc-ask"><input placeholder="Ask a question" aria-label="Ask a question" maxlength="5000" autocomplete="off"><button class="sc-send ready" aria-label="Ask">${icon("arrow-up", 16)}</button></form>
      ${h.error ? `<p class="sc-muted">${esc(h.error)}</p>` : `<p class="sc-label">Suggested for you</p><div class="sc-card sc-sgs">${rows || '<div class="sc-skel"></div><div class="sc-skel"></div><div class="sc-skel"></div>'}</div>`}
      ${r ? `<div class="sc-card sc-recent"><p class="sc-label">Recent conversation</p><button class="sc-rc" data-act="open-thread" data-id="${r.id}">${r.assignee ? personAv(r.assignee, 28) : botAv(28)}<span class="sc-sg-t"><b>${esc(r.title)}</b><span>${esc(r.sub)}${r.status === "closed" ? " · Resolved" : ""}</span></span>${r.unread ? '<i class="sc-dot"></i>' : ""}${icon("chevron-right", 15)}</button></div>` : ""}
      ${S.statusOk === null ? "" : `<a class="sc-status" href="/status" target="_blank" rel="noopener"><i class="${S.statusOk ? "ok" : "warn"}"></i>${S.statusOk ? "All systems operational" : "Some systems are degraded"}${icon("arrow-up-right", 13)}</a>`}
    </div>`;
}
function listHtml() {
  const rows = S.list;
  const head = `<header class="sc-head plain"><b class="grow">Messages</b>${ib("close", "x", "Close")}</header>`;
  if (!rows) return `${head}<div class="sc-scroll"><div class="sc-skel"></div><div class="sc-skel"></div></div>`;
  const item = (t) => `<button class="sc-li" data-act="open-thread" data-id="${t.id}">${t.assignee ? personAv(t.assignee.initials, 32) : botAv(32)}<span class="sc-sg-t"><b>${esc(t.subject || t.topic_label || "Conversation")}</b><span>${esc(t.ticket ? t.ticket + " · " : t.status === "bot" ? "Assistant · " : "")}${esc(t.preview || "")}</span></span><span class="sc-li-r"><span>${esc(ago(t.last_message_at))}</span>${t.unread ? `<i class="sc-badge sm">${t.unread}</i>` : t.status === "closed" ? '<span class="sc-tag">Resolved</span>' : ""}</span></button>`;
  return `${head}<div class="sc-scroll">${rows.length ? `<div class="sc-card sc-list">${rows.map(item).join("")}</div>` : `<div class="sc-empty">${icon("inbox", 22)}<b>No conversations yet</b><span>Ask the assistant a question, or talk to a person.</span></div>`}
    <div class="sc-center"><button class="sc-btn" data-act="new">${icon("plus", 15)} Start a new conversation</button></div></div>`;
}
const POPULAR = ["deliverability", "domain-not-verifying", "dmarc", "send-email", "errors", "email-status"];
function helpHtml() {
  return `<header class="sc-head plain"><b class="grow">Help</b>${ib("close", "x", "Close")}</header>
    <div class="sc-scroll"><form class="sc-ask" data-help-form><input data-help-q placeholder="Search the docs" aria-label="Search the docs" value="${esc(S.helpQ)}" autocomplete="off"><button class="sc-send ready" aria-label="Ask the assistant">${icon("arrow-up", 16)}</button></form>
      <p class="sc-label" data-help-label>Popular articles</p><div class="sc-card sc-sgs" data-help-results></div>
      <div class="sc-center"><button class="sc-btn" data-act="person">${icon("users", 15)} Talk to a person</button></div></div>`;
}
function drawHelpResults() {
  const box = panel.querySelector("[data-help-results]");
  if (!box) return;
  const q = S.helpQ.trim();
  if (!docsMod?.done) {
    if (!box.innerHTML) box.innerHTML = '<div class="sc-skel"></div><div class="sc-skel"></div><div class="sc-skel"></div>';
    loadDocs().then((m) => { docsMod.done = m; drawHelpResults(); }).catch(() => { box.innerHTML = '<p class="sc-muted">Couldn’t load the docs. <a href="/docs">Open them here</a>.</p>'; });
    return;
  }
  const { DOCS, searchDocs } = docsMod.done;
  const docs = q ? searchDocs(q, 6) : POPULAR.map((id) => DOCS.find((d) => d.id === id)).filter(Boolean);
  panel.querySelector("[data-help-label]").textContent = q ? (docs.length ? "Articles" : "No articles match. Press Enter to ask the assistant.") : "Popular articles";
  box.hidden = !docs.length;
  box.innerHTML = docs.map((d) => `<a class="sc-sg" href="/docs#${esc(d.id)}" data-act="link"><span class="sc-sg-ic">${icon("book", 15)}</span><span class="sc-sg-t"><b>${esc(d.title)}</b><span>${esc(String(d.body).replace(/[#`*]/g, "").slice(0, 60))}…</span></span>${icon("chevron-right", 15)}</a>`).join("");
}

function threadHtml(opt) {
  const t = S.thread || { status: "bot" };
  const bot = t.status === "bot";
  const pending = handoffPending();
  const person = t.assignee;
  let avatar = botAv(30), title = "Delivrie assistant", sub = pending ? "AI · handing you to the team" : "AI · answers from docs and your account";
  if (!bot) {
    if (person) { avatar = personAv(person.initials, 30); title = `${person.name} from Support`; sub = t.status === "closed" ? "Conversation resolved" : S.typing ? "typing…" : `${t.topic_label || "Support"} · ${t.ticket}`; }
    else { title = "Delivrie support"; sub = t.status === "closed" ? "Conversation resolved" : "Team · replies within 1 business day"; }
  }
  const placeholder = pending ? (pending.meta?.ask_email ? "What can we help with?" : "Describe the problem") : bot ? (S.msgs.length ? "Ask a follow-up" : "Ask a question") : t.status === "closed" ? "Reply to reopen" : person ? `Reply to ${person.name}` : "Add more detail";
  const foot = !bot && person ? "You’re talking to a person. Replies also go to your email." : "AI can make mistakes. A person can step in at any time.";
  const closed = t.status === "closed";
  return `<header class="sc-head">${ib("back", "chevron-left", "Back")}${avatar}<div class="sc-title"><b>${esc(title)}</b><span>${esc(sub)}</span></div><div class="sc-acts">${ib("menu", "more", "More")}${ib("close", "x", "Close")}</div>${menuHtml()}</header>
    <div class="sc-scroll bottom sc-msgs" aria-live="polite">${!S.thread || (S.thread.id && !S.msgs.length && !opt.thinking) ? '<div class="sc-skel"></div><div class="sc-skel"></div>' : messagesHtml(opt)}</div>
    <form class="sc-composer"><div class="sc-input ${pending ? "strong" : ""}"><textarea rows="1" maxlength="5000" placeholder="${esc(placeholder)}" aria-label="${esc(placeholder)}"></textarea><button class="sc-send" aria-label="Send">${icon("arrow-up", 16)}</button></div><p>${esc(foot)}</p></form>
    ${closed ? tabsHtml() : ""}`;
}
function messagesHtml(opt) {
  const t = S.thread;
  const msgs = S.msgs;
  const lastBot = [...msgs].reverse().find((m) => m.author === "bot");
  const lastMine = [...msgs].reverse().find((m) => m.author === "customer");
  const firstName = (T.name || "").split(" ")[0] || "You";
  const out = [];
  for (const m of msgs) {
    if (m.author === "system") {
      out.push(`<div class="sc-sys"><i></i>${icon(m.meta?.icon || "check-circle", 13)}<span>${esc(m.body)}${m.meta?.kind === "joined" ? ` · ${time(m.created_at)}` : ""}</span><i></i></div>`);
      if (m.meta?.kind === "opened" && S.promise && t.status !== "bot") out.push(promiseHtml());
      continue;
    }
    if (m.author === "customer") {
      const att = m.meta?.attachments?.length;
      const note = m.pending ? "Sending…" : m.meta?.topic_label ? `${m.meta.topic_label}${att ? ` · ${att} item${att === 1 ? "" : "s"} attached` : ""}` : m === lastMine && S.seen ? "Seen" : t.status === "bot" && m.meta?.kind !== "handoff" ? `${firstName} · ${time(m.created_at)}` : "";
      out.push(`<div class="sc-me"><div class="sc-bubble me">${richText(m.body)}</div>${note ? `<span class="sc-note">${esc(note)}</span>` : ""}</div>`);
      continue;
    }
    if (m.author === "support") {
      out.push(`<div class="sc-them">${personAv(m.meta?.initials || initials(m.author_name), 24)}<div class="sc-col"><span class="sc-who">${esc(m.author_name || "Delivrie")}</span><div class="sc-bubble">${richText(m.body)}${codeActions(m)}</div></div></div>`);
      continue;
    }
    // the assistant
    const meta = m.meta || {};
    const chips = (meta.sources || []).map((s) => `<a class="sc-chip" href="${esc(s.href)}" data-act="link">${icon({ domain: "globe", doc: "book", broadcast: "send", email: "mail" }[s.kind] || "link", 13)}${esc(s.label)}</a>`).join("");
    const live = m === lastBot && t.status === "bot";
    let extra = "";
    if (meta.kind === "topics") extra = topicsHtml(m, live);
    else if (meta.feedback && live && meta.helpful === undefined) extra = `<div class="sc-row sc-fb"><span>Did this help?</span><button class="sc-btn" data-act="helpful" data-id="${m.id}">${icon("check", 15)} Yes</button><button class="sc-btn dark" data-act="person">${icon("users", 15)} Talk to a person</button></div>`;
    else if (meta.feedback && live && meta.helpful) extra = `<div class="sc-row sc-fb"><span>Glad it helped.</span><button class="sc-btn" data-act="person">${icon("users", 15)} Talk to a person</button></div>`;
    const acts = (meta.actions || []).map((a) => a.href ? `<a class="sc-btn" href="${esc(a.href)}" data-act="link">${icon(a.icon || "external", 15)} ${esc(a.label)}</a>` : `<button class="sc-btn" data-act="action" data-id="${esc(a.id)}" data-domain="${esc(a.domain_id || "")}">${icon(a.icon || "sparkle", 15)} ${esc(a.label)}</button>`).join("");
    const hasCode = /```/.test(m.body);
    out.push(`<div class="sc-them">${botAv(24)}<div class="sc-col"><div class="sc-bubble">${richText(m.body)}${hasCode ? `<div class="sc-row">${copyBtn(m)}${acts}</div>` : ""}</div>${chips ? `<div class="sc-chips">${chips}</div>` : ""}${!hasCode && acts ? `<div class="sc-row">${acts}</div>` : ""}${extra}</div></div>`);
  }
  if (opt.thinking || (S.typing && t.status !== "bot")) {
    const who = t.status === "bot" || !t.assignee ? botAv(24) : personAv(t.assignee.initials, 24);
    out.push(`<div class="sc-them sc-typing">${who}<span class="sc-dots"><i></i><i></i><i></i></span></div>`);
  }
  if (t.status === "closed") out.push(ratingHtml());
  return out.join("");
}
const copyBtn = (m) => { const code = (String(m.body).match(/```[a-z]*\n?([\s\S]*?)```/) || [])[1] || ""; return `<button class="sc-btn" data-act="copy" data-copy="${esc(code.trim())}">${icon("copy", 15)} Copy</button>`; };
const codeActions = (m) => (/```/.test(m.body) ? `<div class="sc-row">${copyBtn(m)}</div>` : "");
function topicsHtml(m, live) {
  const meta = m.meta;
  const ics = { deliverability: "mail", domains: "globe", billing: "card", api: "code" };
  const topics = (meta.topics || []).map((x) => `<button class="sc-chip ${S.topic === x.id && live ? "on" : ""}" data-act="topic" data-id="${x.id}" ${live ? "" : "disabled"}>${ics[x.id] ? icon(ics[x.id], 13) : ""}${esc(x.label)}</button>`).join("");
  const atts = (meta.attachments || []).filter((a) => !live || S.keep?.has(`${a.type}:${a.id}`));
  const card = meta.ask_email ? `<div class="sc-card sc-email"><p class="sc-label">Your email</p><input type="email" data-guest-email placeholder="you@company.com" value="${esc(S.guestEmail || "")}" autocomplete="email" aria-label="Your email"><input data-guest-name placeholder="Your name (optional)" value="${esc(S.guestName || "")}" autocomplete="name" aria-label="Your name"></div>`
    : atts.length ? `<div class="sc-card sc-ctx"><p class="sc-label">Attached automatically</p>${atts.map((a) => attHtml(a, live)).join("")}</div>` : "";
  return `<div class="sc-chips">${topics}</div>${live ? card : ""}`;
}
function attHtml(a, live) {
  const key = `${a.type}:${a.id}`;
  if (a.type === "domain") return `<div class="sc-att-row">${icon("globe", 14)}<span class="sc-sg-t"><b>${esc(a.title)}</b><span>${esc(a.sub)}</span></span>${live ? `<button class="sc-x" data-act="unattach" data-key="${key}" aria-label="Don’t attach ${esc(a.title)}">${icon("x", 13)}</button>` : ""}</div>`;
  const open = S.expanded[key] !== false; // headers open by default, like the design
  const rows = (a.headers || []).map(([k, v]) => `<div><span>${esc(k)}</span><span>${flag(esc(v))}</span></div>`).join("");
  return `<div class="sc-att"><div class="sc-att-row">${icon("mail", 14)}<span class="sc-sg-t"><b>${esc(a.title)}</b><span>${esc(a.sub)}</span></span><button class="sc-x" data-act="expand" data-key="${key}" aria-label="${open ? "Hide" : "Show"} headers" aria-expanded="${open}">${icon(open ? "chevron-down" : "chevron-right", 14)}</button>${live ? `<button class="sc-x" data-act="unattach" data-key="${key}" aria-label="Don’t attach this email">${icon("x", 13)}</button>` : ""}</div>
    ${open ? `<div class="sc-hdrs">${rows}</div><button class="sc-link" data-act="copy" data-copy="${esc(a.raw || "")}">${icon("copy", 13)} Copy raw headers${a.more ? `<span> · ${a.more} more line${a.more === 1 ? "" : "s"}</span>` : ""}</button>` : ""}</div>`;
}
function promiseHtml() {
  const p = S.promise;
  const team = S.home?.team || [];
  const email = S.thread?.email || T.email;
  return `<div class="sc-ticket"><div class="sc-ticket-h">${icon("clock", 16)}<b>${esc(p.head)}</b></div><p>${p.guest ? `${email ? `We’ll reply to ${esc(email)}. ` : ""}${esc(p.sub)}` : `${esc(p.sub)}${email ? ` We’ll also email ${esc(email)}, so you can close this.` : ""}`}</p>${team.length ? `<div class="sc-team">${`<span class="sc-stack">${team.map((x) => personAv(x.initials, 22)).join("")}</span>`}<span>${S.home?.on_shift ? `${S.home.on_shift} on shift now` : "The team is offline right now"}</span></div>` : ""}</div>`;
}
function ratingHtml() {
  const t = S.thread;
  if (t.rated_at) return `<div class="sc-card sc-rate done">${icon("check-circle", 18)}<b>Thanks for rating this conversation.</b><span>Reply any time to reopen it.</span></div><div class="sc-center"><button class="sc-btn" data-act="new">${icon("plus", 15)} Start a new conversation</button></div>`;
  const opt = (r, ic, label) => `<button class="sc-opt ${S.rating === r ? "on" : ""}" data-act="rate" data-r="${r}" aria-pressed="${S.rating === r}">${icon(ic, 20)}<span>${label}</span></button>`;
  return `<div class="sc-card sc-rate"><b>How was your support?</b><div class="sc-row">${opt("bad", "x-circle", "Bad")}${opt("okay", "info", "Okay")}${opt("great", "check-circle", "Great")}</div>
    <textarea data-rate-comment rows="1" maxlength="1000" placeholder="Anything to add? (optional)" aria-label="Comment"></textarea><button class="sc-btn dark" data-act="send-rating">Send rating</button></div>
    <div class="sc-center"><button class="sc-btn" data-act="new">${icon("plus", 15)} Start a new conversation</button></div>`;
}
