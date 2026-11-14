// Shared by the browser editor and the sending backend: email blocks -> email-safe HTML,
// and {{variable}} substitution. Plain JS, no dependencies.
// The server keeps an identical copy at supabase/functions/delivrie/blocks.js (tools/build_docs.py checks they match).

export function esc(s) {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

// Inline HTML allowed in text blocks (from the editor): b, strong, i, em, u, s, a, br, span, code.
export function sanitizeInline(html) {
  const s = String(html ?? "");
  return s
    .replace(/<\s*(script|style|iframe|object|embed|form|input|textarea|select|button|meta|link)[\s\S]*?(<\/\s*\1\s*>|\/?>)/gi, "")
    .replace(/<(\/?)([a-z0-9]+)([^>]*)>/gi, (m, close, tag, attrs) => {
      tag = tag.toLowerCase();
      if (!["b", "strong", "i", "em", "u", "s", "strike", "a", "br", "span", "code"].includes(tag)) return "";
      if (close) return `</${tag}>`;
      if (tag === "a") {
        const href = (attrs.match(/href\s*=\s*"([^"]*)"/i) || attrs.match(/href\s*=\s*'([^']*)'/i) || [])[1] || "";
        if (!/^(https?:|mailto:|tel:|\{\{)/i.test(href.trim())) return "<a>";
        return `<a href="${esc(href)}">`;
      }
      return `<${tag}>`;
    })
    .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "");
}

// Page styles. Older templates only set background/text/muted/accent/font/width and render as one column.
// "card" layout: the email sits in a white card (cardBackground) on a soft outer background (background),
// with header blocks (zone "header", e.g. the logo) above the card and footer blocks (zone "footer") below it.
export const DEFAULT_STYLE = {
  page: { background: "#ffffff", text: "#211f20", muted: "#6b6f76", accent: "#fad600", font: "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif", width: 600 },
};
export const FONTS = {
  System: "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif",
  Inter: "Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif",
  Helvetica: "'Helvetica Neue',Helvetica,Arial,sans-serif",
  Georgia: "Georgia,'Times New Roman',Times,serif",
  Mono: "SFMono-Regular,Menlo,Consolas,'Liberation Mono',monospace",
};

function boxStyle(st = {}, defaults = {}) {
  const s = { ...defaults, ...st };
  const parts = [];
  if (s.color) parts.push(`color:${s.color}`);
  if (s.fontSize) parts.push(`font-size:${parseInt(s.fontSize)}px`);
  if (s.lineHeight) parts.push(`line-height:${s.lineHeight}`);
  if (s.weight) parts.push(`font-weight:${s.weight === "Bold" ? 700 : s.weight === "Medium" ? 500 : s.weight === "Semibold" ? 600 : 400}`);
  if (s.align) parts.push(`text-align:${s.align}`);
  if (s.padding) parts.push(`padding:${String(s.padding).trim().split(/\s+/).map((v) => parseInt(v) + "px").join(" ")}`);
  if (s.background && s.background !== "None") parts.push(`background:${s.background}`);
  if (s.radius) parts.push(`border-radius:${parseInt(s.radius)}px`);
  if (s.borderColor) parts.push(`border:1px solid ${s.borderColor}`);
  return parts.join(";");
}

function row(inner, st, defaults) {
  const margin = st?.margin ? parseInt(st.margin) : 0;
  return `<tr><td style="${boxStyle(st, defaults)}${margin ? `;padding-bottom:${margin}px` : ""}">${inner}</td></tr>`;
}
const table = (inner, extra = "") => `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"${extra}>${inner}</table>`;

/** Render blocks to a full HTML document. vars: substituted later by renderVars. */
export function renderBlocks(doc, opts = {}) {
  const page = { ...DEFAULT_STYLE.page, ...(doc?.page || {}) };
  const blocks = doc?.blocks || [];
  const preview = opts.previewText ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(opts.previewText)}${"&#8204;&nbsp;".repeat(60)}</div>` : "";
  const head = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light"><title>${esc(opts.subject || "")}</title>` +
    `<style>@media only screen and (max-width:620px){.dlv-card{padding:28px 22px!important}.dlv-outer{padding:16px 10px!important}.dlv-h1{font-size:24px!important}.dlv-col{display:block!important;width:100%!important;padding:0 0 12px!important}}a{color:${page.link || page.text}}</style></head>`;
  if (page.layout !== "card") {
    const body = blocks.map((b) => renderBlock(b, page, opts)).join("");
    return head + `<body style="margin:0;padding:0;background:${page.background};font-family:${page.font};color:${page.text}">${preview}` +
      `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${page.background}"><tr><td align="center" class="dlv-outer" style="padding:24px 12px">` +
      `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:${page.width}px;font-family:${page.font};color:${page.text}">${body}</table>` +
      `</td></tr></table></body></html>`;
  }
  const cardBg = page.cardBackground || "#ffffff";
  const radius = page.radius != null ? parseInt(page.radius) : 12;
  const zone = (z) => blocks.filter((b) => (b.zone || "body") === z).map((b) => renderBlock(b, page, opts)).join("");
  const header = zone("header"), footer = zone("footer");
  const border = page.cardBorder ? `border:1px solid ${page.cardBorder};` : "";
  return head + `<body style="margin:0;padding:0;background:${page.background};font-family:${page.font};color:${page.text};-webkit-font-smoothing:antialiased">${preview}` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${page.background}"><tr><td align="center" class="dlv-outer" style="padding:40px 16px">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:${page.width}px;font-family:${page.font};color:${page.text}">` +
    (header ? `<tr><td style="padding:0 4px 24px">${table(header)}</td></tr>` : "") +
    `<tr><td class="dlv-card" style="background:${cardBg};border-radius:${radius}px;${border}padding:40px 44px">${table(zone("body"))}</td></tr>` +
    (footer ? `<tr><td style="padding:28px 8px 0">${table(footer)}</td></tr>` : "") +
    `</table></td></tr></table></body></html>`;
}

export function renderBlock(b, page, opts = {}) {
  const st = b.style || {};
  const t = page.text;
  const muted = page.muted;
  const border = page.border || "#e8e8ec";
  switch (b.type) {
    case "title": return row(`<h1 class="dlv-h1" style="margin:0;font-size:${st.fontSize ? parseInt(st.fontSize) : 28}px;line-height:1.25;letter-spacing:-0.01em;font-weight:${st.weight === "Bold" ? 700 : 600};color:${st.color || page.heading || t}">${sanitizeInline(b.html ?? esc(b.text))}</h1>`, { padding: "0 0 12 0", ...st, fontSize: null, color: null, weight: null });
    case "heading": return row(`<h2 style="margin:0;font-size:${st.fontSize ? parseInt(st.fontSize) : 19}px;line-height:1.35;font-weight:600;color:${st.color || page.heading || t}">${sanitizeInline(b.html ?? esc(b.text))}</h2>`, { padding: "8 0 8 0", ...st, fontSize: null, color: null });
    case "text": return row(sanitizeInline(b.html ?? esc(b.text)), st, { fontSize: 16, lineHeight: 1.65, color: t, padding: "0 0 14 0" });
    case "eyebrow": return row(sanitizeInline(b.html ?? esc(b.text)), st, { fontSize: 12, lineHeight: 1.4, color: page.accentText || muted, weight: "Semibold", padding: "0 0 10 0" }).replace("<td style=\"", "<td style=\"text-transform:uppercase;letter-spacing:0.08em;");
    case "bulleted":
    case "numbered": {
      const tag = b.type === "bulleted" ? "ul" : "ol";
      const items = (b.items || []).map((i) => `<li style="margin:0 0 8px">${sanitizeInline(i)}</li>`).join("");
      return row(`<${tag} style="margin:0;padding-left:22px">${items}</${tag}>`, st, { fontSize: 16, lineHeight: 1.6, color: t, padding: "0 0 14 0" });
    }
    case "image": {
      if (!b.src) return "";
      const img = `<img src="${esc(b.src)}" alt="${esc(b.alt || "")}" width="${b.width ? parseInt(b.width) : page.width}" style="display:block;max-width:100%;height:auto;border:0;${b.align === "center" ? "margin:0 auto;" : ""}${st.radius ? `border-radius:${parseInt(st.radius)}px` : ""}">`;
      return row(b.href ? `<a href="${esc(b.href)}">${img}</a>` : img, { ...st, radius: null }, { padding: "0 0 14 0", align: b.align || "left" });
    }
    case "logo": {
      // The brand's logo image, or its name as text when there's no logo yet.
      const align = b.align || "left";
      const h = parseInt(b.height || 32);
      const inner = b.src
        ? `<img src="${esc(b.src)}" alt="${esc(b.alt || b.text || "")}" height="${h}" style="display:${align === "center" ? "block;margin:0 auto" : "inline-block"};height:${h}px;width:auto;max-width:220px;border:0">`
        : `<span style="font-size:20px;font-weight:700;letter-spacing:-0.01em;color:${st.color || page.heading || t}">${esc(b.text || "")}</span>`;
      return row(b.href ? `<a href="${esc(b.href)}" style="text-decoration:none">${inner}</a>` : inner, { ...st, color: null }, { padding: "0", align });
    }
    case "button": {
      const pad = String(st.padding || "13 24 13 24").trim().split(/\s+/).map((v) => parseInt(v) + "px").join(" ");
      const w = b.width === "Full" ? "display:block;text-align:center" : "display:inline-block";
      return row(`<a href="${esc(b.href || "#")}" style="${w};background:${b.fill || page.accent};color:${b.color || "#211f20"};padding:${pad};border-radius:${b.radius != null ? parseInt(b.radius) : 8}px;font-weight:600;font-size:15px;line-height:1.2;text-decoration:none;mso-padding-alt:0">${esc(b.text || "Button")}</a>`, { padding: "8 0 20 0", align: b.align || "left" });
    }
    case "divider": return row(`<div style="height:1px;background:${st.color || border};line-height:1px;font-size:1px">&nbsp;</div>`, { padding: st.padding || "16 0 16 0" });
    case "spacer": return `<tr><td style="height:${parseInt(b.height || 24)}px;line-height:1px;font-size:1px">&nbsp;</td></tr>`;
    case "columns": {
      const cols = (b.columns || []).map((c) => `<td valign="top" class="dlv-col" style="width:${Math.floor(100 / (b.columns.length || 1))}%;padding:0 8px;font-size:15px;line-height:1.6;color:${t}">${sanitizeInline(c.html || "")}</td>`).join("");
      return row(table(`<tr>${cols}</tr>`), st, { padding: "0 0 14 0" });
    }
    case "callout": {
      // A highlighted box: notes, warnings, summaries.
      const bg = b.background || page.calloutBackground || "#f6f6f8";
      const bar = b.accent ? `border-left:3px solid ${b.accent};` : "";
      return row(`<div style="background:${bg};${bar}border-radius:${b.radius != null ? parseInt(b.radius) : 10}px;padding:16px 18px;font-size:${st.fontSize ? parseInt(st.fontSize) : 15}px;line-height:1.6;color:${st.color || t}">${b.title ? `<div style="font-weight:600;margin:0 0 4px;color:${page.heading || t}">${sanitizeInline(b.title)}</div>` : ""}${sanitizeInline(b.html || "")}</div>`, { ...st, fontSize: null, color: null }, { padding: "4 0 18 0" });
    }
    case "otp": {
      // A one-time code, big and easy to copy.
      const align = b.align || "left";
      return row(`<div style="display:inline-block;background:${b.background || page.calloutBackground || "#f6f6f8"};border-radius:10px;padding:16px 26px;font-family:SFMono-Regular,Menlo,Consolas,monospace;font-size:${parseInt(b.size || 32)}px;font-weight:700;letter-spacing:0.28em;color:${page.heading || t}">${esc(b.code || "")}</div>`, { padding: "6 0 20 0", align });
    }
    case "rows": {
      // Label / value lines with an optional total: receipts, invoices, account details.
      const lines = (b.rows || []).map((r) => `<tr><td style="padding:9px 0;border-bottom:1px solid ${border};font-size:15px;color:${r.strong ? t : muted}">${sanitizeInline(r.label || "")}</td><td align="right" style="padding:9px 0;border-bottom:1px solid ${border};font-size:15px;color:${t};${r.strong ? "font-weight:600;" : ""}white-space:nowrap">${sanitizeInline(r.value || "")}</td></tr>`).join("");
      const total = b.total ? `<tr><td style="padding:14px 0 0;font-size:16px;font-weight:600;color:${page.heading || t}">${sanitizeInline(b.total.label || "Total")}</td><td align="right" style="padding:14px 0 0;font-size:16px;font-weight:700;color:${page.heading || t};white-space:nowrap">${sanitizeInline(b.total.value || "")}</td></tr>` : "";
      return row(table(lines + total), st, { padding: "4 0 18 0" });
    }
    case "social": {
      const gap = (b.align || "left") === "center" ? "0 7px" : "0 16px 0 0";
      const links = (b.links || []).filter((l) => l.url).map((l) => `<a href="${esc(l.url)}" style="color:${page.muted};text-decoration:none;margin:${gap};font-size:13px;font-weight:500">${esc(l.label || l.network)}</a>`).join("");
      return links ? row(links, st, { padding: "6 0 10 0", align: b.align || "left" }) : "";
    }
    case "footer": {
      const reason = b.reason ? `<div>${esc(b.reason)}</div>` : "";
      const links = b.unsubscribe === false ? "" : `<div style="margin-top:4px"><a href="{{{unsubscribe_url}}}" style="color:${page.muted}">Unsubscribe</a> or <a href="{{{preferences_url}}}" style="color:${page.muted}">manage preferences</a></div>`;
      const addr = b.address ? `<div style="margin-top:8px">${esc(b.address)}</div>` : "";
      return row(`${reason}${links}${addr}`, st, { fontSize: 12, lineHeight: 1.6, color: page.muted, padding: "16 0 0 0", align: b.align });
    }
    case "html": return `<tr><td>${b.html || ""}</td></tr>`;
    case "code": return row(`<pre style="margin:0;white-space:pre-wrap;font-family:SFMono-Regular,Menlo,Consolas,monospace;font-size:13px;line-height:1.6;background:#0f1011;color:#e6e6e6;padding:${parseInt(st.padding ?? 16)}px;border-radius:${parseInt(st.radius ?? 8)}px">${esc(b.code || "")}</pre>`, { padding: "0 0 12 0" });
    default: return "";
  }
}

/**
 * Replace {{{var}}} (raw) and {{var}} (escaped) with values.
 * definitions: [{name, fallback}] - fallback used when value is missing/empty.
 */
export function renderVars(str, vars = {}, definitions = []) {
  if (str == null) return str;
  const fb = Object.fromEntries((definitions || []).map((d) => [d.name ?? d.key, d.fallback ?? d.fallback_value]));
  const get = (name) => {
    const key = name.trim();
    const [k, inlineFallback] = key.split("|").map((x) => x.trim());
    let v = vars[k];
    if (v === undefined || v === null || v === "") v = fb[k];
    if ((v === undefined || v === null || v === "") && inlineFallback !== undefined) v = inlineFallback.replace(/^["']|["']$/g, "");
    return v === undefined || v === null ? "" : String(v);
  };
  return String(str)
    .replace(/\{\{\{\s*([^}]+?)\s*\}\}\}/g, (_m, n) => get(n))
    .replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_m, n) => esc(get(n)));
}

/** Variable names used in a string (both {{x}} and {{{x}}}). */
export function usedVars(str) {
  const out = new Set();
  String(str ?? "").replace(/\{\{\{?\s*([a-zA-Z_][a-zA-Z0-9_]*)/g, (_m, n) => { out.add(n); return ""; });
  return [...out];
}

export function blocksToText(doc) {
  return (doc?.blocks || []).map((b) => {
    const strip = (h) => String(h ?? "").replace(/<a [^>]*href="([^"]+)"[^>]*>(.*?)<\/a>/gi, "$2 ($1)").replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'");
    switch (b.type) {
      case "title": case "heading": case "text": case "eyebrow": return strip(b.html ?? b.text);
      case "bulleted": return (b.items || []).map((i) => "• " + strip(i)).join("\n");
      case "numbered": return (b.items || []).map((i, n) => `${n + 1}. ${strip(i)}`).join("\n");
      case "button": return `${b.text}: ${b.href}`;
      case "divider": return "---";
      case "columns": return (b.columns || []).map((c) => strip(c.html)).join("\n");
      case "callout": return [b.title && strip(b.title), strip(b.html)].filter(Boolean).join("\n");
      case "otp": return b.code || "";
      case "rows": return [...(b.rows || []).map((r) => `${strip(r.label)}: ${strip(r.value)}`), b.total ? `${strip(b.total.label || "Total")}: ${strip(b.total.value)}` : ""].filter(Boolean).join("\n");
      case "logo": return "";
      case "footer": return [b.reason, b.unsubscribe === false ? "" : "Unsubscribe: {{{unsubscribe_url}}}", b.address].filter(Boolean).join("\n");
      case "code": return b.code || "";
      case "image": return b.alt ? `[${b.alt}]` : "";
      default: return "";
    }
  }).filter(Boolean).join("\n\n");
}
