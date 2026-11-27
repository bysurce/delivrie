// Inbox (Figma 12.3): inboxes for people and agents on top of receiving. Named inboxes with an agent each, threads,
// labels, assignment, internal notes, shared drafts (the agent's included), spam and trash, and Gmail-style search.
import { attAttr } from "../lib/attachments.js";
import { sb, state, api } from "../lib/sb.js";
import { esc, icon, ago, fmtDateTime, num, toast, errToast, menu, formModal, confirmModal, emptyState, initials, on, debounce, drawer, EMAIL_RE, type El } from "../lib/ui.js";

const COLORS = ["#4c8df6", "#3fa672", "#e2b400", "#f2994a", "#a774f2", "#e5484d", "#8a8f98"];
const FOLDERS = [["all", "All mail", "inbox"], ["unread", "Unread", "mail"], ["needs", "Needs reply", "reply"], ["mine", "Assigned to me", "users"], ["drafts", "Drafts", "edit"], ["sent", "Sent", "send"], ["archived", "Archived", "archive"], ["spam", "Spam", "alert"], ["trash", "Trash", "trash"]];
const AGENT_ACTIONS: [string, string, string][] = [
  ["draft_reply", "Draft replies", "Writes a reply for someone to review and send. It never sends on its own."],
  ["add_labels", "Add labels", "Sorts conversations with your labels, creating new ones when needed."],
  ["mark_spam", "Mark spam", "Moves scams, phishing and bulk mail to Spam."],
  ["archive", "Archive", "Files mail that needs no reply, like receipts and notifications."],
  ["assign", "Assign", "Hands the conversation to the right person on your team."],
  ["add_note", "Add notes", "Leaves internal notes for the team. Notes are never emailed."],
  ["forward", "Forward", "Forwards mail, but only to the addresses you list below."],
];
const RUN_LABEL = { draft_reply: "Drafted a reply", add_labels: "Labelled", archive: "Archived", mark_spam: "Marked spam", assign: "Assigned", add_note: "Added a note", forward: "Forwarded" };
const needsReply = (t) => t.status === "open" && t.last_inbound_at && (!t.last_outbound_at || new Date(t.last_inbound_at) > new Date(t.last_outbound_at));
const reSubject = (s) => /^re:/i.test(s) ? s : `Re: ${s}`;

/** Gmail-style search, the same syntax the API takes. */
function parseQuery(q: string) {
  const out = { text: [] as string[], from: [] as string[], to: [] as string[], subject: [] as string[], label: [] as string[], is: new Set<string>(), in: null as string | null, has: new Set<string>(), before: null as number | null, after: null as number | null };
  const re = /(\w+):(?:"([^"]*)"|(\S+))|"([^"]*)"|(\S+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(q))) {
    if (m[1]) {
      const k = m[1].toLowerCase(), v = (m[2] ?? m[3] ?? "").trim().toLowerCase();
      if (!v) continue;
      if (k === "from" || k === "to" || k === "subject" || k === "label") out[k].push(v);
      else if (k === "is") out.is.add(v.replace(/_/g, "-"));
      else if (k === "in") out.in = v;
      else if (k === "has") out.has.add(v.replace(/s$/, ""));
      else if ((k === "before" || k === "after") && !isNaN(Date.parse(v))) out[k] = Date.parse(v);
      else out.text.push(`${k}:${v}`);
    } else out.text.push((m[4] ?? m[5]).toLowerCase());
  }
  return out;
}
const IN_STATUS = { inbox: "open", open: "open", archive: "archived", archived: "archived", spam: "spam", trash: "trash", anywhere: "all", all: "all" };

export default async function inbox(ctx) {
  ctx.crumb("inbox", "Inbox");
  const T = state.team.id, root = ctx.root, me = state.user.id, admin = state.role === "admin";
  let threads = [], labels = [], inboxes = [], drafts = [], members = [], withAttachments: Set<string> | null = null;
  let sel: string | null = null, folder = ctx.query.folder || "all", labelF = null, q = "", openId = ctx.params.id || null, msgs = [], notes = [], runs = [];
  let pref: { inbox?: string | null; [k: string]: any } = {}; try { pref = JSON.parse(localStorage.getItem("dlv_inbox") || "{}"); } catch {}
  const save = () => { try { localStorage.setItem("dlv_inbox", JSON.stringify(pref)); } catch {} };

  const { data: doms } = await sb.from("domains").select("id,name,status,receiving_enabled,receiving_subdomain").eq("team_id", T);
  const receiving = (doms || []).filter((d) => d.receiving_enabled);
  if (!receiving.length) {
    root.innerHTML = `<div class="page"><div class="page-head"><h1>Inbox</h1></div><div class="card inbox-empty">${emptyState({ icon: "inbox", title: "Receive email to use the Inbox", desc: "Turn on receiving for a domain and add one MX record. Every email sent to an inbox address lands here as a thread you and your agent can label, draft replies to and answer, and your app gets an email.received webhook.", action: `<a class="btn btn-primary" href="/emails?tab=receiving&setup=1">${icon("globe", 13)} Set up receiving</a> <a class="btn btn-secondary" href="/docs/inbox">Read the guide</a>` })}
      <div class="inbox-steps">${[["globe", "Add an MX record", "Use a subdomain like in.yourdomain.com so your existing mail keeps working."], ["sparkle", "Give each inbox an agent", "It drafts replies, labels, assigns and filters spam. You review and send."], ["reply", "Reply in threads", "Answer from here with correct Message-ID threading."]].map(([i, t, d]) => `<div>${icon(i, 15)}<b>${t}</b><span class="muted">${d}</span></div>`).join("")}</div></div></div>`;
    return;
  }
  const hostFor = (d) => d.receiving_subdomain ? `${d.receiving_subdomain}.${d.name}` : d.name;

  root.innerHTML = `<div class="inbox">
    <aside class="ib-side"><button class="ib-mbox" data-mbox>${icon("inbox", 14)}<span class="grow ellipsis" data-mbox-name>All inboxes</span>${icon("chevron-down", 12, "dim")}</button>
      <nav data-folders></nav><div class="ib-h"><span>Labels</span><button class="ibtn" data-new-label title="New label">${icon("plus", 12)}</button></div><nav data-labels></nav></aside>
    <section class="ib-list"><div class="ib-search"><span class="lead">${icon("search", 13)}</span><input class="input" data-q placeholder="Search · from: label: is:unread has:attachment" title="Words, &quot;phrases&quot;, from: to: subject: label: is:unread|read|assigned|unassigned|needs-reply in:archive|spam|trash|anywhere has:attachment|draft before: after:"><button class="ibtn" data-refresh title="Refresh">${icon("refresh", 13)}</button></div><div data-threads class="ib-threads"></div></section>
    <section class="ib-view" data-view></section></div>`;
  const $ = (s): El => root.querySelector(s);

  const load = async () => {
    const [{ data: th, error }, { data: lb }, { data: ib }, { data: dr }] = await Promise.all([
      sb.from("inbox_threads").select("*").eq("team_id", T).order("last_at", { ascending: false }).limit(500),
      sb.from("inbox_labels").select("*").eq("team_id", T).order("name"),
      sb.from("inboxes").select("*").eq("team_id", T).order("name"),
      sb.from("inbox_drafts").select("id,thread_id,source,updated_at").eq("team_id", T).eq("status", "draft"),
    ]);
    if (error) throw error;
    threads = th || []; labels = lb || []; inboxes = ib || []; drafts = dr || []; withAttachments = null;
    drawSide(); drawList();
  };
  const loadMembers = async () => {
    const { data: mem } = await sb.from("team_members").select("user_id").eq("team_id", T);
    const { data: pr } = await sb.from("profiles").select("id,email,full_name").in("id", (mem || []).map((m) => m.user_id));
    members = (pr || []).map((p) => ({ id: p.id, email: p.email, name: p.full_name || p.email }));
  };
  const memberName = (id) => { const m = members.find((x) => x.id === id); return m ? (m.id === me ? "You" : m.name) : "Someone"; };
  const hasDraft = (t) => drafts.some((d) => d.thread_id === t.id);
  const inSel = () => threads.filter((t) => !sel || (sel === "other" ? !t.inbox_id : t.inbox_id === sel));
  const inFolder = (t, f, status = null) => {
    const st = status || (f === "archived" || f === "spam" || f === "trash" ? f : f === "sent" || f === "drafts" ? null : "open");
    if (status === "all") return true;
    if (st ? t.status !== st : t.status === "spam" || t.status === "trash") return false;
    if (f === "unread" && !t.unread) return false;
    if (f === "needs" && !needsReply(t)) return false;
    if (f === "mine" && t.assignee_id !== me) return false;
    if (f === "sent" && !t.last_outbound_at) return false;
    if (f === "drafts" && !hasDraft(t)) return false;
    return true;
  };
  const visible = () => {
    const Q = parseQuery(q);
    const status = Q.in ? IN_STATUS[Q.in] : ["archived", "spam", "trash"].find((s) => Q.is.has(s)) || null;
    return inSel().filter((t) => {
      if (!inFolder(t, status ? "all" : folder, status)) return false;
      if (labelF && !t.labels.includes(labelF)) return false;
      const hay = `${t.subject} ${t.contact} ${t.contact_name || ""} ${t.snippet}`.toLowerCase();
      if (Q.text.some((w) => !hay.includes(w))) return false;
      if (Q.from.some((w) => !`${t.contact} ${t.contact_name || ""}`.toLowerCase().includes(w))) return false;
      if (Q.to.some((w) => !t.mailbox.includes(w))) return false;
      if (Q.subject.some((w) => !t.subject.toLowerCase().includes(w))) return false;
      if (Q.label.some((w) => !t.labels.some((id) => labels.find((l) => l.id === id)?.name.toLowerCase() === w))) return false;
      if (Q.is.has("unread") && !t.unread) return false;
      if (Q.is.has("read") && t.unread) return false;
      if (Q.is.has("assigned") && !t.assignee_id) return false;
      if (Q.is.has("unassigned") && t.assignee_id) return false;
      if (Q.is.has("needs-reply") && !needsReply(t)) return false;
      if (Q.has.has("draft") && !hasDraft(t)) return false;
      if (Q.has.has("attachment") && withAttachments && !withAttachments.has(t.id)) return false;
      if (Q.before && new Date(t.last_at).getTime() >= Q.before) return false;
      if (Q.after && new Date(t.last_at).getTime() < Q.after) return false;
      return true;
    });
  };
  const labelChip = (id) => { const l = labels.find((x) => x.id === id); return l ? `<span class="ib-label" style="--c:${l.color}"><i></i>${esc(l.name)}</span>` : ""; };
  const curInbox = () => inboxes.find((i) => i.id === sel) || null;

  function drawSide() {
    const ci = curInbox();
    $("[data-mbox-name]").textContent = ci ? ci.name : sel === "other" ? "Other mail" : inboxes.length === 1 ? inboxes[0].name : "All inboxes";
    const box = inSel();
    const count = Object.fromEntries(FOLDERS.map(([k]) => [k, box.filter((t) => inFolder(t, k)).length]));
    $("[data-folders]").innerHTML = FOLDERS.map(([k, l, i]) => `<button class="ib-f ${folder === k && !labelF ? "on" : ""}" data-folder="${k}">${icon(i, 14)}<span class="grow">${l}</span>${["all", "unread", "needs", "mine", "drafts"].includes(k) && count[k] ? `<span class="${k === "unread" ? "ib-n" : "dim"}">${num(count[k])}</span>` : ""}</button>`).join("");
    $("[data-labels]").innerHTML = labels.length ? labels.map((l) => `<button class="ib-f ${labelF === l.id ? "on" : ""}" data-label="${l.id}"><i class="ib-dot" style="background:${l.color}"></i><span class="grow ellipsis">${esc(l.name)}</span><span class="dim">${box.filter((t) => t.labels.includes(l.id) && t.status !== "trash").length || ""}</span></button>`).join("") : `<p class="dim" style="font-size:calc(12px + var(--fs-up, 0px));padding:4px 10px">No labels yet</p>`;
  }
  function drawList() {
    const list = visible();
    $("[data-threads]").innerHTML = list.length ? list.map((t) => `<button class="ib-t ${t.id === openId ? "on" : ""} ${t.unread ? "unread" : ""}" data-thread="${t.id}">
        <div class="row-flex"><span class="who ellipsis">${esc(t.contact_name || t.contact)}</span>${t.message_count > 1 ? `<span class="dim">${t.message_count}</span>` : ""}<span class="grow"></span><span class="dim when">${ago(t.last_at)}</span></div>
        <div class="subj ellipsis">${esc(t.subject)}</div><div class="snip ellipsis">${esc(t.snippet)}</div>
        ${t.labels.length || needsReply(t) || t.assignee_id || hasDraft(t) ? `<div class="row-flex" style="gap:4px;margin-top:6px;flex-wrap:wrap">${hasDraft(t) ? `<span class="ib-draft-chip">${icon("edit", 10)} Draft</span>` : ""}${t.labels.map(labelChip).join("")}${needsReply(t) && folder !== "needs" ? `<span class="ib-needs">Needs reply</span>` : ""}${t.assignee_id ? `<span class="ib-who" title="Assigned to ${esc(memberName(t.assignee_id))}">${esc(initials(memberName(t.assignee_id)))}</span>` : ""}</div>` : ""}</button>`).join("")
      : `<div class="ib-none">${emptyState({ icon: folder === "spam" ? "alert" : folder === "trash" ? "trash" : "inbox", title: q ? "No matching mail" : folder === "needs" ? "All caught up" : folder === "spam" ? "No spam" : folder === "drafts" ? "No drafts" : "Nothing here", desc: q ? "Try another search." : folder === "needs" ? "Every thread has a reply." : folder === "drafts" ? "Replies you start, and the ones your agent writes, wait here until they're sent." : "New mail shows up here as it arrives." })}</div>`;
  }

  async function openThread(id, push = true) {
    openId = id;
    if (push) history.replaceState({}, "", `/inbox${id ? `/${id}` : ""}${location.search}`);
    drawList();
    const t = threads.find((x) => x.id === id);
    if (!t) { $("[data-view]").innerHTML = `<div class="ib-none">${emptyState({ icon: "mail", title: "Select a conversation", desc: "Pick a thread on the left to read and reply." })}</div>`; return; }
    $("[data-view]").innerHTML = `<div class="ib-load"><span class="spinner"></span></div>`;
    const [{ data, error }, { data: nt }, { data: rn }, { data: dr }] = await Promise.all([
      sb.from("emails").select("id,direction,from,to,cc,subject,html,text,headers,attachments,created_at,status").eq("thread_id", id).order("created_at"),
      sb.from("inbox_notes").select("*").eq("thread_id", id).order("created_at"),
      sb.from("inbox_agent_runs").select("id,status,actions,summary,error,created_at").eq("thread_id", id).order("created_at", { ascending: false }).limit(1),
      sb.from("inbox_drafts").select("*").eq("thread_id", id).eq("status", "draft").order("updated_at", { ascending: false }).limit(1),
    ]);
    if (error) return errToast(error);
    if (openId !== id) return;
    msgs = data || []; notes = nt || []; runs = rn || [];
    if (t.unread) { t.unread = false; sb.from("inbox_threads").update({ unread: false }).eq("id", id).then(() => {}); drawSide(); drawList(); }
    drawThread(t, (dr || [])[0] || null);
  }

  function agentBanner(t) {
    const r = runs[0]; if (!r) return "";
    const ok = (r.actions || []).filter((a) => a.ok);
    const what = ok.length ? ok.map((a) => `${RUN_LABEL[a.type] || a.type}${a.labels ? ` ${a.labels.map(esc).join(", ")}` : a.member ? ` to ${esc(a.member)}` : a.to ? ` to ${esc(a.to)}` : ""}`).join(" · ") : r.status === "done" ? "No action needed" : "";
    const err = r.status === "failed" || r.status === "skipped" ? r.error : (r.actions || []).filter((a) => !a.ok).map((a) => `${a.type}: ${a.error}`).join("; ");
    return `<div class="ib-agent ${r.status === "failed" ? "err" : ""}">${icon("sparkle", 13)}<div class="grow"><b>Agent</b> <span>${esc(what || (r.status === "running" ? "Working on it…" : r.status === "skipped" ? "Didn't run" : r.status === "failed" ? "Couldn't finish" : ""))}</span>${r.summary ? `<div class="dim">${esc(r.summary)}</div>` : ""}${err ? `<div class="ib-agent-err">${esc(err)}</div>` : ""}</div><span class="dim" title="${esc(fmtDateTime(r.created_at))}">${ago(r.created_at)}</span>${t.inbox_id ? `<button class="btn btn-ghost btn-sm" data-act="agent">Run again</button>` : ""}</div>`;
  }
  function drawThread(t, draft) {
    const last = [...msgs].reverse().find((m) => m.direction === "inbound");
    const ci = inboxes.find((i) => i.id === t.inbox_id);
    const items = [...msgs.map((m) => ({ at: m.created_at, html: msgHtml(m) })), ...notes.map((n) => ({ at: n.created_at, html: noteHtml(n) }))].sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
    const folderNote = t.status === "spam" ? `<div class="ib-banner">${icon("alert", 13)} This conversation is in Spam. <button class="btn btn-ghost btn-sm" data-act="notspam">Not spam</button></div>` : t.status === "trash" ? `<div class="ib-banner">${icon("trash", 13)} This conversation is in Trash. <button class="btn btn-ghost btn-sm" data-act="restore">Restore</button></div>` : "";
    $("[data-view]").innerHTML = `<div class="ib-head"><div class="grow" style="min-width:0"><h2 class="ellipsis">${esc(t.subject)}</h2><div class="row-flex" style="gap:6px;margin-top:6px;flex-wrap:wrap">${t.labels.map(labelChip).join("")}${t.assignee_id ? `<span class="ib-label" style="--c:var(--fg-3)">${icon("users", 10)} ${esc(memberName(t.assignee_id))}</span>` : ""}<span class="dim" style="font-size:calc(12px + var(--fs-up, 0px))">${num(msgs.length)} message${msgs.length === 1 ? "" : "s"} · ${esc(ci ? `${ci.name} <${ci.address}>` : t.mailbox)}</span></div></div>
        <button class="ibtn" data-act="label" title="Labels">${icon("tag", 14)}</button><button class="ibtn" data-act="assign" title="Assign">${icon("users", 14)}</button><button class="ibtn" data-act="unread" title="Mark as unread">${icon("mail", 14)}</button><button class="ibtn" data-act="archive" title="${t.status === "archived" ? "Move to inbox" : "Archive"}">${icon("archive", 14)}</button><button class="ibtn" data-act="more" title="More">${icon("more", 14)}</button></div>
      ${folderNote}${agentBanner(t)}
      <div class="ib-msgs">${items.map((x) => x.html).join("")}</div>
      <div class="ib-reply"><div class="row-flex" style="gap:6px"><div class="ib-tabs"><button class="on" data-mode="reply">${icon("reply", 12)} Reply</button><button data-mode="note">${icon("edit", 12)} Note</button></div><span class="grow"></span><span class="dim" data-replyinfo style="font-size:calc(12px + var(--fs-up, 0px))">to ${esc(t.contact_name || t.contact)} from <span class="mono" style="color:var(--fg-2)">${esc(t.mailbox)}</span></span></div>
        <div data-draftinfo></div>
        <textarea class="textarea" data-reply rows="5" placeholder="Write a reply…"></textarea>
        <div class="row-flex"><span class="dim" data-hint style="font-size:calc(12px + var(--fs-up, 0px))">Drafts save as you type, so your team can pick them up.</span><span class="grow"></span><button class="btn btn-ghost btn-sm" data-discard hidden>Discard</button><span class="kbd dim">⌘ Enter</span><button class="btn btn-primary btn-sm" data-send disabled>${icon("send", 12)} Send</button></div></div>`;
    const ta = $("[data-reply]"), send = $("[data-send]"), discard = $("[data-discard]");
    let mode = "reply", draftId = draft?.id || null, saving = null;
    const showDraft = (d) => {
      $("[data-draftinfo]").innerHTML = d ? `<div class="ib-draftnote">${icon(d.source === "agent" ? "sparkle" : "edit", 12)}<span class="grow">${d.source === "agent" ? `<b>Drafted by the agent.</b> ${esc(d.note || "Review it, edit if needed, then send.")}` : `Draft saved ${ago(d.updated_at)}`}</span></div>` : "";
      discard.hidden = !d;
    };
    if (draft) { ta.value = draft.text || ""; showDraft(draft); }
    send.disabled = !ta.value.trim();
    if (ctx.query.reply) { ta.focus(); ctx.query.reply = ""; }
    const persist = debounce(async () => {
      if (mode !== "reply") return;
      const text = ta.value;
      saving = (async () => {
        if (draftId) { await sb.from("inbox_drafts").update({ text, html: null }).eq("id", draftId); return; }
        if (!text.trim()) return;
        const { data } = await sb.from("inbox_drafts").insert({ team_id: T, thread_id: t.id, inbox_id: t.inbox_id, from: t.mailbox, to: [t.contact], subject: reSubject(t.subject), text, created_by: me }).select().single();
        if (data) { draftId = data.id; drafts.push({ id: data.id, thread_id: t.id, source: "user", updated_at: data.updated_at }); showDraft(data); drawList(); drawSide(); }
      })().catch(() => {});
    }, 800);
    ta.addEventListener("input", () => { send.disabled = !ta.value.trim(); persist(); });
    ta.addEventListener("keydown", (e) => { if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && !send.disabled) send.click(); });
    root.querySelectorAll("[data-mode]").forEach((b) => b.addEventListener("click", () => {
      mode = b.dataset.mode;
      root.querySelectorAll("[data-mode]").forEach((x) => x.classList.toggle("on", x === b));
      ta.value = mode === "note" ? "" : (draftId ? ta.value : "");
      if (mode === "reply" && draftId) sb.from("inbox_drafts").select("text").eq("id", draftId).single().then(({ data }) => { if (data && mode === "reply") { ta.value = data.text; send.disabled = !ta.value.trim(); } });
      ta.placeholder = mode === "note" ? "Write an internal note. Notes are only seen by your team." : "Write a reply…";
      ta.classList.toggle("ib-notearea", mode === "note");
      send.innerHTML = mode === "note" ? `${icon("check", 12)} Add note` : `${icon("send", 12)} Send`;
      $("[data-hint]").textContent = mode === "note" ? "Notes stay inside Delivrie and are never emailed." : "Drafts save as you type, so your team can pick them up.";
      $("[data-replyinfo]").hidden = mode === "note";
      $("[data-draftinfo]").hidden = mode === "note"; discard.hidden = mode === "note" || !draftId;
      send.disabled = !ta.value.trim(); ta.focus();
    }));
    discard.onclick = async () => {
      if (!draftId) return;
      await saving;
      const { error } = await sb.from("inbox_drafts").update({ status: "discarded" }).eq("id", draftId);
      if (error) return errToast(error);
      drafts = drafts.filter((d) => d.id !== draftId); draftId = null; ta.value = ""; showDraft(null); send.disabled = true; drawList(); drawSide(); toast("Draft discarded");
    };
    send.onclick = async () => {
      const text = ta.value.trim(); if (!text) return;
      send.disabled = true; const label = send.innerHTML; send.innerHTML = `<span class="spinner"></span>`;
      try {
        if (mode === "note") {
          const { error } = await sb.from("inbox_notes").insert({ team_id: T, thread_id: t.id, author_id: me, body: text });
          if (error) throw error;
          toast("Note added");
        } else {
          await saving;
          await api("POST", `/inbox/threads/${t.id}/reply`, { text, ...(draftId ? { draft_id: draftId } : {}) });
          if (draftId) { drafts = drafts.filter((d) => d.id !== draftId); }
          toast("Reply sent · threaded with Message-ID");
          await load();
        }
        await openThread(t.id, false);
      } catch (e) { errToast(e); send.disabled = false; send.innerHTML = label; }
    };
    root.querySelectorAll("iframe[data-body]").forEach((f: El) => { f.addEventListener("load", () => { try { f.style.height = Math.min(900, f.contentDocument.body.scrollHeight + 24) + "px"; } catch {} }); });
  }
  function msgHtml(m) {
    const out = m.direction !== "inbound";
    const name = out ? "You" : (m.from.replace(/<.*>/, "").replace(/"/g, "").trim() || m.from);
    const atts = (m.attachments || []).filter((a) => a.filename);
    const body = m.html ? `<iframe sandbox="allow-popups" data-body srcdoc="${esc(`<base target="_blank"><style>body{margin:0;font:14px/1.6 -apple-system,Segoe UI,sans-serif;color:#211f20;background:#fff;padding:14px;word-wrap:break-word}img{max-width:100%}</style>${m.html}`)}"></iframe>` : `<div class="ib-text">${esc(m.text || "(no content)")}</div>`;
    return `<article class="ib-m ${out ? "out" : ""}"><div class="row-flex"><span class="avatar" style="width:28px;height:28px;font-size:calc(11px + var(--fs-up, 0px))">${esc(initials(name))}</span><div class="grow" style="min-width:0"><b>${esc(name)}</b> <span class="dim" style="font-size:calc(12px + var(--fs-up, 0px))">${esc(out ? `to ${(m.to || []).join(", ")}` : m.from.match(/<(.+)>/)?.[1] || "")}</span></div><span class="dim" style="font-size:calc(12px + var(--fs-up, 0px))" title="${esc(fmtDateTime(m.created_at))}">${ago(m.created_at)}</span>${out ? `<span class="badge ${m.status === "delivered" || m.status === "opened" || m.status === "clicked" ? "green" : m.status === "bounced" || m.status === "failed" ? "red" : "gray"}" style="margin-left:6px">${esc(m.status)}</span>` : ""}</div>
      <div class="ib-body">${m.html == null && m.text == null && !out ? `<div class="ib-text dim">Content removed after your plan’s retention window.</div>` : body}</div>
      ${atts.length ? `<div class="ib-atts">${atts.map((a, i) => `<span class="ib-att" ${attAttr(m.id, a, i, m.direction === "inbound")}>${icon("paperclip", 12)}<span class="ellipsis">${esc(a.filename)}</span><span class="dim">${a.size ? `${Math.max(1, Math.round(a.size / 1024))} KB` : ""}</span></span>`).join("")}</div>` : ""}</article>`;
  }
  function noteHtml(n) {
    const who = n.author_kind === "agent" ? "Agent" : memberName(n.author_id);
    return `<article class="ib-note"><div class="row-flex">${icon(n.author_kind === "agent" ? "sparkle" : "edit", 12)}<b>${esc(who)}</b><span class="dim">· internal note</span><span class="grow"></span><span class="dim" title="${esc(fmtDateTime(n.created_at))}">${ago(n.created_at)}</span>${n.author_id === me ? `<button class="ibtn" data-del-note="${n.id}" title="Delete note">${icon("x", 12)}</button>` : ""}</div><div class="ib-text">${esc(n.body)}</div></article>`;
  }

  const updateThread = async (t, patch: Record<string, any>, msg?: string) => {
    try { await api("PATCH", `/inbox/threads/${t.id}`, patch); } catch (e) { return errToast(e); }
    if (patch.assignee !== undefined) { t.assignee_id = patch.assignee ? members.find((m) => m.email === patch.assignee)?.id || null : null; delete patch.assignee; }
    if (patch.labels) delete patch.labels;
    Object.assign(t, patch); drawSide(); drawList(); if (openId === t.id) openThread(t.id, false); if (msg) toast(msg);
  };
  const setLabels = async (t, ids) => { const { error } = await sb.from("inbox_threads").update({ labels: ids }).eq("id", t.id); if (error) return errToast(error); t.labels = ids; drawSide(); drawList(); if (openId === t.id) openThread(t.id, false); };
  const labelMenu = (anchor, t) => menu(anchor, [
    { header: "Labels" },
    ...labels.map((l) => ({ html: `<span class="row-flex"><i class="ib-dot" style="background:${l.color}"></i>${esc(l.name)}</span>`, checked: t.labels.includes(l.id), onClick: () => setLabels(t, t.labels.includes(l.id) ? t.labels.filter((x) => x !== l.id) : [...t.labels, l.id]) })),
    { sep: true }, { label: "New label", icon: "plus", onClick: () => newLabel(t) },
  ], { align: "right", width: 220 });
  const assignMenu = async (anchor, t) => {
    if (!members.length) await loadMembers();
    menu(anchor, [{ header: "Assign to" }, ...members.map((m) => ({ label: m.id === me ? `${m.name} (you)` : m.name, icon: "users", checked: t.assignee_id === m.id, onClick: () => updateThread(t, { assignee: m.email }, `Assigned to ${m.id === me ? "you" : m.name}`) })), { sep: true }, { label: "Unassign", icon: "x", disabled: !t.assignee_id, onClick: () => updateThread(t, { assignee: null }, "Unassigned") }], { align: "right", width: 240 });
  };
  const newLabel = (t) => formModal({ title: "New label", fields: [{ name: "name", label: "Name", placeholder: "Refunds" }], submit: "Create label", validate: (v) => v.name && v.name.length <= 40,
    async onSubmit(v) {
      const { data, error } = await sb.from("inbox_labels").insert({ team_id: T, name: v.name, color: COLORS[labels.length % COLORS.length] }).select().single();
      if (error) throw new Error(/duplicate/.test(error.message) ? "That label already exists" : error.message);
      labels.push(data); labels.sort((a, b) => a.name.localeCompare(b.name));
      if (t) await setLabels(t, [...t.labels, data.id]); else drawSide();
      toast(`Label “${v.name}” created`);
    } });
  const forward = (t) => {
    const m = [...msgs].reverse().find((x) => x.direction === "inbound") || msgs[msgs.length - 1];
    formModal({ title: "Forward email", fields: [{ name: "to", label: "To", placeholder: "ops@yourcompany.com", type: "email" }, { name: "note", label: "Note", type: "textarea", placeholder: "Optional" }], desc: "Sends the latest message as a new email from this inbox. Attachments aren’t included.", submit: "Forward", validate: (v) => EMAIL_RE.test(v.to),
      async onSubmit(v) {
        const quoted = `<p>${esc(v.note || "").replace(/\n/g, "<br>")}</p><hr><p style="color:#666;font-size:13px">Forwarded message<br>From: ${esc(m.from)}<br>Subject: ${esc(m.subject)}<br>Date: ${esc(new Date(m.created_at).toUTCString())}</p>${m.html || `<pre style="white-space:pre-wrap;font:inherit">${esc(m.text || "")}</pre>`}`;
        await api("POST", "/emails", { from: t.mailbox, to: [v.to], subject: `Fwd: ${m.subject}`, html: quoted });
        toast(`Forwarded to ${v.to}`);
      } });
  };
  const runAgentNow = async (t, btn?) => {
    if (btn) { btn.disabled = true; btn.innerHTML = `<span class="spinner"></span>`; }
    try {
      const r = await api("POST", `/inbox/threads/${t.id}/agent`, {});
      toast(r.status === "done" ? "Agent finished" : r.status === "failed" ? `Agent couldn't finish: ${r.error || "unknown error"}` : `Agent didn't run: ${r.error || "nothing to do"}`, r.status === "done" ? "ok" : "info", 5000);
      await load(); await openThread(t.id, false);
    } catch (e) { errToast(e); if (btn) { btn.disabled = false; btn.textContent = "Run again"; } }
  };

  // ------------------------------------------------------------ inboxes: create and settings (agent setup)
  const newInbox = () => {
    if (!admin) return toast("Only team admins can create inboxes", "info");
    const hosts = receiving.map(hostFor);
    formModal({ title: "New inbox", desc: `An inbox is an address on a receiving domain. Mail to it lands here, and it can have its own agent. Receiving on: ${hosts.map((h) => `<span class="mono">${esc(h)}</span>`).join(", ")}.`,
      fields: [{ name: "address", label: "Address", placeholder: `support@${hosts[0]}`, mono: true }, { name: "name", label: "Name", placeholder: "Support", optional: true }],
      submit: "Create inbox", validate: (v) => EMAIL_RE.test(v.address || ""),
      async onSubmit(v) {
        const i = await api("POST", "/inboxes", { address: v.address, name: v.name || undefined });
        await load(); sel = i.id; pref.inbox = i.id; save(); drawSide(); drawList();
        toast(`Inbox ${i.name} created`);
        inboxSettings(i.id);
      } });
  };
  function inboxSettings(id) {
    const i = inboxes.find((x) => x.id === id); if (!i) return;
    const a = { enabled: false, instructions: "", tone: "friendly", actions: ["draft_reply", "add_labels", "mark_spam"], forward_to: [], signature: "", ...(i.agent || {}) };
    const tones = ["friendly", "professional", "concise"];
    const dis = admin ? "" : "disabled";
    drawer({ title: esc(i.name), wide: true, body: `
      ${admin ? "" : `<p class="ib-banner">${icon("lock", 13)} Only team admins can change inbox settings.</p>`}
      <div class="field"><label>Name</label><input class="input" name="name" value="${esc(i.name)}" ${dis}></div>
      <div class="field"><label>Address</label><input class="input mono" value="${esc(i.address)}" disabled><div class="hint">Mail to this address lands in this inbox.</div></div>
      <div class="field"><label>Description <span class="dim">Optional</span></label><input class="input" name="description" value="${esc(i.description || "")}" placeholder="What this inbox is for" ${dis}></div>
      <h3 class="section-title" style="display:flex;align-items:center;gap:8px">${icon("sparkle", 14)} Agent</h3>
      <label class="row-flex ib-agent-toggle" style="justify-content:space-between"><span><b>Run the agent on new mail</b><span class="hint" style="display:block">It reads each new email and acts within what you allow. It never sends replies itself: they wait as drafts for someone to review.</span></span><input type="checkbox" class="toggle" name="enabled" ${a.enabled ? "checked" : ""} ${dis}></label>
      <div class="field"><label>Instructions</label><textarea class="textarea" name="instructions" rows="6" placeholder="Who we are, what this inbox handles, how to answer common questions, when to hand over to a person, and what never to promise." ${dis}>${esc(a.instructions)}</textarea><div class="hint">Plain language works best. Include your refund policy, opening hours, links you want shared, and who handles what.</div></div>
      <div class="field"><label>Tone</label><div class="row-flex" style="gap:6px;flex-wrap:wrap">${tones.map((t) => `<label class="ib-chip"><input type="radio" name="tone" value="${t}" ${a.tone === t ? "checked" : ""} ${dis}>${t[0].toUpperCase() + t.slice(1)}</label>`).join("")}<label class="ib-chip"><input type="radio" name="tone" value="custom" ${tones.includes(a.tone) ? "" : "checked"} ${dis}>Custom</label><input class="input" name="tone_custom" placeholder="e.g. warm and plain-spoken" value="${tones.includes(a.tone) ? "" : esc(a.tone)}" style="flex:1;min-width:180px" ${dis}></div></div>
      <div class="field"><label>What the agent may do</label><div class="ib-actions">${AGENT_ACTIONS.map(([k, l, d]) => `<label class="ib-action"><input type="checkbox" name="act" value="${k}" ${a.actions.includes(k) ? "checked" : ""} ${dis}><span><b>${l}</b><span class="hint">${d}</span></span></label>`).join("")}</div></div>
      <div class="field"><label>Addresses it may forward to</label><input class="input mono" name="forward_to" value="${esc(a.forward_to.join(", "))}" placeholder="billing@yourcompany.com, oncall@yourcompany.com" ${dis}><div class="hint">Up to 5. The agent can't forward anywhere else, even if an email asks it to.</div></div>
      <div class="field"><label>Signature <span class="dim">Optional</span></label><textarea class="textarea" name="signature" rows="2" placeholder="The Acme team" ${dis}>${esc(a.signature)}</textarea></div>
      ${admin ? `<div class="row-flex" style="justify-content:space-between;margin-top:8px"><button class="btn btn-ghost" data-del-inbox style="color:var(--red)">${icon("trash", 13)} Delete inbox</button><button class="btn btn-primary" data-save-inbox>Save</button></div>` : ""}
      <h3 class="section-title">Recent agent activity</h3><div data-runs><div class="ib-load" style="height:80px"><span class="spinner"></span></div></div>`,
      onMount(d, close) {
        const f = (n) => d.querySelector(`[name="${n}"]`);
        api("GET", `/inboxes/${i.id}/agent-runs?limit=15`).then((r) => {
          const plan = state.team?.plan_transactional || "free", cap = r.limits?.runs_per_month?.[plan];
          d.querySelector("[data-runs]").innerHTML = (cap ? `<p class="dim" style="margin:0 0 8px;font-size:calc(12.5px + var(--fs-up, 0px))">Your plan includes ${num(cap)} agent runs a month across all inboxes.</p>` : "") + ((r.data || []).length ? `<div class="ib-runs">${r.data.map((x) => `<div class="ib-run"><span class="badge ${x.status === "done" ? "green" : x.status === "failed" ? "red" : "gray"}">${esc(x.status)}</span><span class="grow ellipsis">${esc((x.actions || []).filter((y) => y.ok).map((y) => RUN_LABEL[y.type] || y.type).join(" · ") || x.error || x.summary || "No action")}</span>${x.thread_id ? `<a href="/inbox/${x.thread_id}" class="dim">Open</a>` : ""}<span class="dim">${ago(x.created_at)}</span></div>`).join("")}</div>` : `<p class="dim">No runs yet. Turn the agent on and it runs on the next email, or open a conversation and choose Run agent.</p>`);
        }).catch(() => { d.querySelector("[data-runs]").innerHTML = `<p class="dim">Couldn't load agent activity.</p>`; });
        d.querySelector("[data-save-inbox]")?.addEventListener("click", async (e) => {
          const b = e.currentTarget; b.disabled = true;
          const toneSel = d.querySelector("[name=tone]:checked")?.value || "friendly";
          const agent = { enabled: f("enabled").checked, instructions: f("instructions").value, tone: toneSel === "custom" ? (f("tone_custom").value.trim() || "friendly") : toneSel, actions: [...d.querySelectorAll("[name=act]:checked")].map((x: El) => x.value), forward_to: f("forward_to").value, signature: f("signature").value };
          try {
            const out = await api("PATCH", `/inboxes/${i.id}`, { name: f("name").value, description: f("description").value, agent });
            Object.assign(i, { name: out.name, description: out.description, agent: out.agent });
            drawSide(); toast(out.agent.enabled ? "Saved · the agent runs on new mail" : "Saved"); close();
          } catch (err) { errToast(err); b.disabled = false; }
        });
        d.querySelector("[data-del-inbox]")?.addEventListener("click", async () => {
          if (!(await confirmModal({ title: `Delete ${i.name}`, desc: `Mail to ${i.address} keeps arriving and its conversations stay in the Inbox under Other mail. The agent settings are removed.`, confirm: "Delete inbox" }))) return;
          try { await api("DELETE", `/inboxes/${i.id}`); close(); sel = null; pref.inbox = null; save(); await load(); toast("Inbox deleted"); } catch (err) { errToast(err); }
        });
      } });
  }

  on(root, "click", "[data-folder]", (_e, b) => { folder = b.dataset.folder; labelF = null; drawSide(); drawList(); });
  on(root, "click", "[data-label]", (_e, b) => { labelF = labelF === b.dataset.label ? null : b.dataset.label; folder = "all"; drawSide(); drawList(); });
  on(root, "click", "[data-thread]", (_e, b) => openThread(b.dataset.thread));
  on(root, "click", "[data-new-label]", () => newLabel(null));
  on(root, "click", "[data-del-note]", async (_e, b) => { const { error } = await sb.from("inbox_notes").delete().eq("id", b.dataset.delNote); if (error) return errToast(error); notes = notes.filter((n) => n.id !== b.dataset.delNote); if (openId) openThread(openId, false); });
  on(root, "click", "[data-refresh]", async () => { await load(); if (openId) openThread(openId, false); });
  on(root, "click", "[data-mbox]", (_e, b) => {
    const other = threads.some((t) => !t.inbox_id);
    const pick = (v) => () => { sel = v; pref.inbox = v; save(); drawSide(); drawList(); };
    menu(b, [
      { label: "All inboxes", checked: !sel, onClick: pick(null) },
      ...inboxes.map((i) => ({ html: `<span class="row-flex" style="gap:6px;min-width:0"><span class="ellipsis">${esc(i.name)}</span>${i.agent?.enabled ? icon("sparkle", 11) : ""}</span>`, right: i.address, icon: "inbox", checked: sel === i.id, onClick: pick(i.id) })),
      ...(other ? [{ label: "Other mail", icon: "mail", checked: sel === "other", onClick: pick("other") }] : []),
      { sep: true },
      ...(curInbox() ? [{ label: `${curInbox().name} settings`, icon: "sparkle", onClick: () => inboxSettings(sel) }] : []),
      ...(admin ? [{ label: "New inbox", icon: "plus", onClick: newInbox }] : []),
      { label: "Receiving settings", icon: "gear", onClick: () => ctx.navigate("/domains") },
    ], { width: 300 });
  });
  on(root, "click", "[data-act]", (_e, b) => {
    const t = threads.find((x) => x.id === openId); if (!t) return;
    const a = b.dataset.act;
    if (a === "label") labelMenu(b, t);
    if (a === "assign") assignMenu(b, t);
    if (a === "unread") updateThread(t, { unread: true }, "Marked as unread");
    if (a === "archive") updateThread(t, { status: t.status === "archived" ? "open" : "archived" }, t.status === "archived" ? "Moved to inbox" : "Archived");
    if (a === "notspam" || a === "restore") updateThread(t, { status: "open" }, a === "notspam" ? "Moved to inbox" : "Restored");
    if (a === "agent") runAgentNow(t, b);
    if (a === "more") menu(b, [
      { label: "Forward", icon: "send", onClick: () => forward(t) },
      ...(t.inbox_id ? [{ label: "Run agent", icon: "sparkle", onClick: () => runAgentNow(t) }] : []),
      { label: "Copy thread link", icon: "link", onClick: () => navigator.clipboard.writeText(location.origin + "/inbox/" + t.id).then(() => toast("Link copied")) },
      { sep: true },
      t.status === "spam" ? { label: "Not spam", icon: "inbox", onClick: () => updateThread(t, { status: "open" }, "Moved to inbox") } : { label: "Mark as spam", icon: "alert", onClick: () => updateThread(t, { status: "spam" }, "Moved to Spam") },
      t.status === "trash" ? { label: "Restore", icon: "inbox", onClick: () => updateThread(t, { status: "open" }, "Restored") } : { label: "Move to trash", icon: "trash", onClick: () => updateThread(t, { status: "trash" }, "Moved to Trash") },
      ...(t.status === "trash" ? [{ label: "Delete forever", icon: "trash", danger: true, onClick: async () => { if (!(await confirmModal({ title: "Delete thread", desc: "The conversation, its notes and drafts are removed from the Inbox. The emails stay in your logs.", confirm: "Delete" }))) return; const { error } = await sb.from("inbox_threads").delete().eq("id", t.id); if (error) return errToast(error); threads = threads.filter((x) => x.id !== t.id); openId = null; history.replaceState({}, "", "/inbox"); drawSide(); drawList(); openThread(null, false); toast("Thread deleted"); } }] : []),
    ], { align: "right" });
  });
  $("[data-q]").addEventListener("input", debounce(async () => {
    q = $("[data-q]").value.trim();
    if (/\bhas:attachments?\b/i.test(q) && !withAttachments) {
      const { data } = await sb.from("emails").select("thread_id,attachments").in("thread_id", threads.map((t) => t.id).slice(0, 500)).not("thread_id", "is", null);
      withAttachments = new Set((data || []).filter((e) => (e.attachments || []).length).map((e) => e.thread_id));
    }
    drawList();
  }, 150));

  await Promise.all([load(), loadMembers()]);
  if (pref.inbox && (pref.inbox === "other" || inboxes.some((i) => i.id === pref.inbox))) sel = pref.inbox;
  drawSide(); drawList();
  if (ctx.query.inbox_settings && inboxes.some((i) => i.id === ctx.query.inbox_settings)) inboxSettings(ctx.query.inbox_settings);
  await openThread(openId || visible()[0]?.id || null, false);
  // keep the list fresh while the page is open
  const iv = setInterval(async () => { if (!document.body.contains(root.querySelector(".inbox"))) return clearInterval(iv); if (document.hidden) return; const before = threads[0]?.last_at; await load().catch(() => {}); if (threads[0]?.last_at !== before && threads[0]?.id === openId) openThread(openId, false); }, 30000);
}
