// Delivrie's own emails (Figma: "Email · Headers"). Every email opens the same way: the logo, a context label or
// action link, one spot illustration and a plain headline; then the body blocks and the shared footer.
// Table-based with inline styles so it holds up in Gmail, Outlook and Apple Mail. Images are PNGs on delivrie.io
// (assets/email/, rendered by tools/email-illustrations/render.js) because Gmail and Outlook don't show SVG.

export const SENDER_NAME = "Matthew from Delivrie";
export const SUPPORT_ADDRESS = "support@delivrie.io";
const SITE = "https://delivrie.io";
const IMG = `${SITE}/assets/email`;

/** "Matthew from Delivrie <address>" from SYSTEM_FROM, whatever display name it has. */
export function senderFrom(systemFrom: string) {
  const m = String(systemFrom || "").match(/<([^>]+)>/);
  const addr = (m ? m[1] : systemFrom).trim();
  return addr ? `${SENDER_NAME} <${addr}>` : "";
}

export type Illustration = "envelope" | "launch" | "survey" | "receipt" | "shield" | "support" | "webhook" | "globe" | "key" | "team" | "card" | "gauge" | "dns";
type Block = { h: string; t: string };
const C = { ink: "#1f1d1e", body: "#3a3637", sub: "#67625f", mute: "#9a9592", line: "#e6e0d6", paper: "#f4eee4", yellow: "#fad600", soft: "#fff7d1", red: "#c2362b", green: "#11743f" };
const FONT = "'Calamantus', -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif";
const MONO = "'Geist Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";

export const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
// Text that may contain {{ Go template }} placeholders (Supabase Auth templates) or our own trusted markup.
const raw = (s: string): Block => ({ h: s, t: "" });

// ------------------------------------------------------------ blocks
export const p = (text: string, o: { html?: boolean } = {}): Block => ({ h: `<p style="margin:0;font:400 16px/1.65 ${FONT};color:${C.body}">${o.html ? text : esc(text)}</p>`, t: o.html ? text.replace(/<[^>]+>/g, "") : text });
export const small = (text: string, o: { html?: boolean } = {}): Block => ({ h: `<p style="margin:0;font:400 13px/1.55 ${FONT};color:${C.mute}">${o.html ? text : esc(text)}</p>`, t: o.html ? text.replace(/<[^>]+>/g, "") : text });
export const greet = (name?: string | null): Block => p(name ? `Hi ${name.split(/\s+/)[0]},` : "Hi,");
export const button = (text: string, href: string, o: { dark?: boolean } = {}): Block => ({
  h: `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td style="border-radius:999px;background:${o.dark ? C.ink : C.yellow}"><a href="${esc(href)}" style="display:inline-block;padding:15px 30px;border-radius:999px;font:500 15px/1 ${FONT};color:${o.dark ? "#ffffff" : C.ink};text-decoration:none">${esc(text)}</a></td></tr></table>`,
  t: `${text}: ${href}`,
});
type Row = [string, string, { mono?: boolean; red?: boolean; strong?: boolean }?];
export const rows = (list: Row[], o: { total?: Row } = {}): Block => {
  const tr = ([k, v, f = {}]: Row, i: number, last: boolean) => `<tr><td style="padding:12px 0;${last ? "" : `border-bottom:1px solid ${C.line};`}font:400 14px/1.4 ${FONT};color:${C.sub}">${esc(k)}</td><td align="right" style="padding:12px 0;${last ? "" : `border-bottom:1px solid ${C.line};`}font:${f.strong ? 600 : 500} ${f.strong ? 16 : 14}px/1.4 ${f.mono ? MONO : FONT};color:${f.red ? C.red : C.ink};word-break:break-word">${esc(v)}</td></tr>`;
  const all = o.total ? [...list, [o.total[0], o.total[1], { strong: true, ...(o.total[2] || {}) }] as Row] : list;
  return {
    h: `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.paper};border-radius:12px"><tr><td style="padding:4px 20px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${all.map((r, i) => tr(r, i, i === all.length - 1)).join("")}</table></td></tr></table>`,
    t: all.map(([k, v]) => `${k}: ${v}`).join("\n"),
  };
};
export const records = (list: { name: string; host: string; ok: boolean; status?: string }[]): Block => ({
  h: `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.paper};border-radius:12px"><tr><td style="padding:4px 18px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${list.map((r, i) => `<tr><td style="padding:12px 0;${i < list.length - 1 ? `border-bottom:1px solid ${C.line};` : ""}"><div style="font:600 13px/1.3 ${FONT};color:${C.ink}">${esc(r.name)}</div><div style="font:400 11px/1.5 ${MONO};color:${C.sub}">${esc(r.host)}</div></td><td align="right" style="padding:12px 0;${i < list.length - 1 ? `border-bottom:1px solid ${C.line};` : ""}"><span style="display:inline-block;padding:4px 10px;border-radius:999px;background:${r.ok ? "#e4f5ea" : "#fde8e6"};font:500 11px/1 ${FONT};color:${r.ok ? C.green : C.red}">&#9679;&nbsp;${esc(r.status || (r.ok ? "Verified" : "Not found"))}</span></td></tr>`).join("")}</table></td></tr></table>`,
  t: list.map((r) => `${r.name} (${r.host}): ${r.status || (r.ok ? "Verified" : "Not found")}`).join("\n"),
});
export const code = (text: string): Block => ({ h: `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="background:${C.ink};border-radius:10px;padding:16px 18px;font:400 13px/1.6 ${MONO};color:#edeae6;white-space:pre-wrap;word-break:break-all">${esc(text)}</td></tr></table>`, t: text });
export const callout = (title: string, text: string): Block => ({ h: `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="background:${C.soft};border-radius:14px;padding:20px 22px"><div style="font:500 16px/1.4 ${FONT};color:${C.ink};margin-bottom:6px">${esc(title)}</div><div style="font:400 14px/1.6 ${FONT};color:${C.body}">${esc(text)}</div></td></tr></table>`, t: `${title}\n${text}` });
export const steps = (list: [string, string][]): Block => ({
  h: `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${list.map(([title, sub], i) => `<tr><td width="40" valign="top" style="padding:0 0 18px"><div style="width:28px;height:28px;border-radius:14px;background:${C.yellow};text-align:center;font:600 13px/28px ${FONT};color:${C.ink}">${i + 1}</div></td><td valign="top" style="padding:3px 0 18px"><div style="font:500 15px/1.4 ${FONT};color:${C.ink}">${esc(title)}</div><div style="font:400 13px/1.55 ${FONT};color:${C.sub};margin-top:3px">${esc(sub)}</div></td></tr>`).join("")}</table>`,
  t: list.map(([a, b], i) => `${i + 1}. ${a}: ${b}`).join("\n"),
});
/** A one-time code. `value` may be a Go template placeholder like {{ .Token }}. */
export const digits = (value: string): Block => ({ h: `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td style="background:${C.paper};border:1px solid ${C.line};border-radius:12px;padding:14px 22px;font:500 30px/1 ${MONO};letter-spacing:12px;color:${C.ink}">${value}</td></tr></table>`, t: value });
export const checks = (list: string[]): Block => ({
  h: `<table role="presentation" cellpadding="0" cellspacing="0" border="0">${list.map((x) => `<tr><td width="30" valign="top" style="padding:0 0 12px"><div style="width:20px;height:20px;border-radius:10px;background:${C.yellow};text-align:center;font:700 11px/20px ${FONT};color:${C.ink}">&#10003;</div></td><td style="padding:1px 0 12px;font:400 14px/1.5 ${FONT};color:${C.ink}">${esc(x)}</td></tr>`).join("")}</table>`,
  t: list.map((x) => `- ${x}`).join("\n"),
});
export const bar = (left: string, right: string, ratio: number): Block => {
  const pct = Math.max(2, Math.min(100, Math.round(ratio * 100)));
  return { h: `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.paper};border-radius:12px"><tr><td style="padding:16px 20px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="font:500 13px/1 ${FONT};color:${C.ink}">${esc(left)}</td><td align="right" style="font:400 12px/1 ${FONT};color:${C.sub}">${esc(right)}</td></tr></table><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:12px;background:#ffffff;border:1px solid ${C.line};border-radius:999px"><tr><td width="${pct}%" style="height:8px;background:${C.yellow};border-radius:999px;font-size:0;line-height:0">&nbsp;</td>${pct < 100 ? `<td style="font-size:0;line-height:0">&nbsp;</td>` : ""}</tr></table></td></tr></table>`, t: `${left} of ${right}` };
};
/** A support reply, as a chat bubble. `body` is plain text; ``` fences become code. */
export const quote = (o: { initials: string; who: string; body: string }): Block => {
  const parts = o.body.split(/```[a-z]*\n?([\s\S]*?)```/g).map((s, i) => i % 2
    ? `<div style="background:${C.ink};border-radius:8px;padding:12px 14px;margin:0 0 12px;font:400 12px/1.6 ${MONO};color:#edeae6;white-space:pre-wrap;word-break:break-all">${esc(s.trim())}</div>`
    : s.split(/\n{2,}/).filter((x) => x.trim()).map((x) => `<p style="margin:0 0 12px;font:400 15px/1.6 ${FONT};color:${C.body};white-space:pre-wrap">${esc(x.trim())}</p>`).join("")).join("");
  return {
    h: `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td width="52" valign="top"><div style="width:38px;height:38px;border-radius:19px;background:${C.soft};border:1px solid ${C.ink};text-align:center;font:500 13px/38px ${FONT};color:${C.ink}">${esc(o.initials)}</div></td><td valign="top"><div style="font:500 12px/1.4 ${FONT};color:${C.sub};margin:0 0 6px">${esc(o.who)}</div><div style="background:${C.paper};border-radius:4px 16px 16px 16px;padding:18px 18px 6px">${parts}</div></td></tr></table>`,
    t: `${o.who}:\n${o.body}`,
  };
};
/** One-click rating: three links, no form. */
export const rating = (links: { bad: string; okay: string; great: string }): Block => {
  const pill = (href: string, label: string, sym: string, on = false) => `<td style="padding:0 4px"><a href="${esc(href)}" style="display:inline-block;padding:11px 18px;border-radius:999px;background:${on ? C.yellow : "#ffffff"};border:1px solid ${on ? C.yellow : C.line};font:500 14px/1 ${FONT};color:${C.ink};text-decoration:none">${sym}&nbsp; ${label}</a></td>`;
  return {
    h: `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.paper};border-radius:16px"><tr><td align="center" style="padding:24px 16px"><div style="font:500 17px/1.3 ${FONT};color:${C.ink};margin-bottom:16px">How did we do?</div><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>${pill(links.bad, "Bad", "&#10005;")}${pill(links.okay, "Okay", "&#8505;")}${pill(links.great, "Great", "&#10003;", true)}</tr></table><div style="font:400 13px/1.5 ${FONT};color:${C.mute};margin-top:14px">One click. No form.</div></td></tr></table>`,
    t: `How did we do? Bad: ${links.bad}  Okay: ${links.okay}  Great: ${links.great}`,
  };
};
export const items = (list: { title: string; text: string; tag?: string }[]): Block => ({
  h: `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${list.map((x, i) => `<tr><td style="padding:16px 0;${i < list.length - 1 ? `border-bottom:1px solid ${C.line};` : ""}"><div style="font:500 17px/1.4 ${FONT};color:${C.ink}">${x.tag !== "" ? `<span style="display:inline-block;padding:3px 8px;margin-right:8px;border-radius:999px;background:${C.yellow};font:600 10px/1.2 ${FONT};letter-spacing:1px;color:${C.ink};vertical-align:2px">${esc(x.tag || "NEW")}</span>` : ""}${esc(x.title)}</div><div style="font:400 14px/1.6 ${FONT};color:${C.sub};margin-top:6px">${esc(x.text)}</div></td></tr>`).join("")}</table>`,
  t: list.map((x) => `- ${x.title}: ${x.text}`).join("\n"),
});

// ------------------------------------------------------------ the email
export type EmailParts = {
  subject: string;
  preheader?: string;
  /** Small caps context label on the right of the top bar ("SUPPORT · #DLV-2041"), or an action link. */
  label?: string;
  link?: { text: string; href: string };
  illustration: Illustration;
  headline: string;
  blocks: Block[];
  /** "account" (default) or "product" (carries an unsubscribe link). */
  footer?: "account" | "product";
  unsubscribe?: string;
};
export type Rendered = { subject: string; html: string; text: string };

export function renderEmail(o: EmailParts): Rendered {
  const right = o.link
    ? `<a href="${esc(o.link.href)}" style="font:500 12px/1 ${FONT};color:${C.ink};text-decoration:none">${esc(o.link.text)}&nbsp;&rarr;</a>`
    : o.label ? `<span style="font:500 11px/1 ${FONT};letter-spacing:1.4px;text-transform:uppercase;color:${C.sub}">${esc(o.label)}</span>` : "";
  const headline = esc(o.headline).replace(/\n/g, "<br>");
  const footText = o.footer === "product"
    ? `You’re receiving product updates from Delivrie. ${o.unsubscribe ? `<a href="${esc(o.unsubscribe)}" style="color:${C.mute}">Unsubscribe</a> or manage preferences.` : "Unsubscribe or manage preferences in Settings."}`
    : "You’re receiving this because you have a Delivrie account.";
  const link = (href: string, label: string) => `<a href="${href}" style="font:400 13px/1 ${FONT};color:${C.ink};text-decoration:none">${label}</a>`;
  const sep = `<span style="color:${C.line};padding:0 12px">|</span>`;
  const icon = (n: string, href: string, alt: string) => `<a href="${href}" style="text-decoration:none;padding:0 9px"><img src="${IMG}/icon-${n}.png" width="18" height="18" alt="${alt}" style="display:inline-block;border:0;vertical-align:middle"></a>`;
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light only"><meta name="supported-color-schemes" content="light"><title>${esc(o.subject)}</title>
<style>@font-face{font-family:'Calamantus';font-weight:400;src:url(${SITE}/assets/fonts/Calamantus-Regular.woff) format('woff')}@font-face{font-family:'Calamantus';font-weight:500;src:url(${SITE}/assets/fonts/Calamantus-Medium.woff) format('woff')}@font-face{font-family:'Calamantus';font-weight:600;src:url(${SITE}/assets/fonts/Calamantus-SemiBold.woff) format('woff')}
@media (max-width:620px){.dlv-pad{padding-left:24px!important;padding-right:24px!important}.dlv-ill{width:100%!important;height:auto!important}.dlv-h{font-size:28px!important}.dlv-outer{padding:0!important}}</style></head>
<body style="margin:0;padding:0;background:${C.paper};-webkit-font-smoothing:antialiased">
${o.preheader ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${esc(o.preheader)}</div>` : ""}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.paper}"><tr><td align="center" class="dlv-outer" style="padding:40px 12px">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background:#ffffff">
<tr><td class="dlv-pad" style="padding:24px 48px 20px;border-bottom:1px solid ${C.line}"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td><a href="${SITE}"><img src="${SITE}/assets/email-logo.png" width="121" height="22" alt="Delivrie" style="display:block;border:0"></a></td><td align="right">${right}</td></tr></table></td></tr>
<tr><td class="dlv-pad" style="padding:36px 48px 4px"><img class="dlv-ill" src="${IMG}/${o.illustration}.png" width="504" height="200" alt="" style="display:block;border:0;width:504px;max-width:100%;height:auto;background:${C.paper}">
<h1 class="dlv-h" style="margin:24px 0 0;font:500 32px/1.16 ${FONT};letter-spacing:-0.64px;color:${C.ink}">${headline}</h1></td></tr>
<tr><td class="dlv-pad" style="padding:24px 48px 48px">${o.blocks.map((b, i) => `<div style="${i ? "margin-top:24px" : ""}">${b.h}</div>`).join("")}</td></tr>
</table>
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px"><tr><td align="center" style="padding:32px 40px 8px">
<p style="margin:0 auto;max-width:440px;font:400 13px/1.5 ${FONT};color:${C.sub}">Questions? Read the docs at <a href="${SITE}/docs" style="color:${C.sub}">delivrie.io/docs</a> or reply to this email. A person reads every reply.</p>
<div style="width:170px;height:1px;background:${C.line};margin:16px auto"></div>
<div style="margin:0 0 14px">${icon("github", "https://github.com/bysurce/delivrie", "GitHub")}${icon("globe", SITE, "delivrie.io")}${icon("book", `${SITE}/docs`, "Docs")}</div>
<div style="margin:0 0 14px">${link(`${SITE}/emails`, "Dashboard")}${sep}${link(`${SITE}/docs`, "Docs")}${sep}${link(`${SITE}/status`, "Status")}${sep}${link(`${SITE}/privacy`, "Privacy")}</div>
<p style="margin:0;font:400 11px/1.65 ${FONT};color:${C.mute}">${footText}<br>8 The Green, Suite R, Dover, DE 19901, United States<br>&copy; ${new Date().getUTCFullYear()} Surce Inc &middot; delivrie.io</p>
</td></tr></table>
</td></tr></table></body></html>`;
  const text = [o.headline.replace(/\n/g, " "), "", ...o.blocks.map((b) => b.t).filter(Boolean).flatMap((t) => [t, ""]), "—", "Questions? Read the docs at delivrie.io/docs or reply to this email. A person reads every reply.", o.footer === "product" ? `Unsubscribe: ${o.unsubscribe || `${SITE}/settings`}` : "You’re receiving this because you have a Delivrie account.", "Delivrie · 8 The Green, Suite R, Dover, DE 19901, United States"].join("\n");
  return { subject: o.subject, html, text };
}
export { raw };
