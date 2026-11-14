// Small Markdown renderer for the docs guides (content/docs/*.md).
// Supports: ## / ### headings (with ids), paragraphs, - and 1. lists, tables, > callouts,
// fenced code (```lang Label), runs of labelled fences as tabs, `code`, **bold**, *italic* and [links](url).
// Pure: the docs page passes hooks for its styled code blocks and callouts; the build script uses the defaults.

const ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
export const escHtml = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ESC[c]);

export function slugify(s) {
  return String(s).toLowerCase().replace(/`/g, "").replace(/&[a-z]+;/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export function inlineMd(s) {
  const parts = String(s).split(/(`[^`]+`)/);
  return parts.map((p, i) => {
    if (i % 2) return `<code>${escHtml(p.slice(1, -1))}</code>`;
    let h = escHtml(p);
    h = h.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_m, t, u) => {
      const ext = /^https?:/.test(u) && !/^https:\/\/delivrie\.io/.test(u);
      return `<a href="${u}"${ext ? ' target="_blank" rel="noopener" data-native' : /^\/(docs|api)\b/.test(u) ? "" : " data-native"}>${t}</a>`;
    });
    h = h.replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>").replace(/(^|[\s(])\*([^*\s][^*]*)\*(?=[\s).,;:!?]|$)/g, "$1<em>$2</em>");
    return h;
  }).join("");
}

const defaults = {
  code: (src, lang, label) => `<pre><code${lang ? ` class="language-${escHtml(lang)}"` : ""}>${escHtml(src)}</code></pre>${label ? "" : ""}`,
  tabs: (items) => items.map((t) => `<p><b>${escHtml(t.label)}</b></p><pre><code class="language-${escHtml(t.lang)}">${escHtml(t.src)}</code></pre>`).join(""),
  callout: (kind, title, html) => `<blockquote class="${kind}">${title ? `<b>${escHtml(title)}</b> ` : ""}${html}</blockquote>`,
};

/** Returns { html, headings: [[id, text, level]] }. */
export function renderMarkdown(src, hooks = {}) {
  const h = { ...defaults, ...hooks };
  const lines = String(src).replace(/\r\n/g, "\n").split("\n");
  const out = [], headings = [], used = new Set();
  let i = 0;
  const isBlank = (l) => !l || !l.trim();
  const fenceStart = (l) => /^```/.test(l);

  const readFence = () => {
    const info = lines[i].slice(3).trim();
    const sp = info.indexOf(" ");
    const lang = sp < 0 ? info : info.slice(0, sp);
    const label = sp < 0 ? "" : info.slice(sp + 1).trim();
    const body = [];
    i++;
    while (i < lines.length && !/^```\s*$/.test(lines[i])) body.push(lines[i++]);
    i++;
    return { lang, label, src: body.join("\n") };
  };

  while (i < lines.length) {
    const l = lines[i];
    if (isBlank(l)) { i++; continue; }

    if (fenceStart(l)) {
      const first = readFence();
      // Consecutive labelled fences (only blank lines between) become one tabbed block.
      const group = [first];
      if (first.label) {
        for (;;) {
          let j = i;
          while (j < lines.length && isBlank(lines[j])) j++;
          if (j < lines.length && fenceStart(lines[j]) && lines[j].slice(3).trim().includes(" ")) { i = j; group.push(readFence()); } else break;
        }
      }
      out.push(group.length > 1 ? h.tabs(group) : h.code(first.src, first.lang, first.label));
      continue;
    }

    const hm = /^(#{2,4})\s+(.*)$/.exec(l);
    if (hm) {
      const level = hm[1].length, text = hm[2].trim();
      let id = slugify(text) || "section", n = 2;
      while (used.has(id)) id = `${slugify(text)}-${n++}`;
      used.add(id);
      headings.push([id, text.replace(/`/g, ""), level]);
      out.push(`<h${level} id="${id}">${inlineMd(text)}</h${level}>`);
      i++; continue;
    }

    if (/^\|/.test(l)) {
      const rows = [];
      while (i < lines.length && /^\|/.test(lines[i])) rows.push(lines[i++]);
      const cells = (r) => r.trim().replace(/^\||\|$/g, "").split(/(?<!\\)\|/).map((c) => c.trim().replace(/\\\|/g, "|"));
      const head = cells(rows[0]);
      const bodyRows = rows.slice(/^\|[\s:|-]+\|?$/.test(rows[1] || "") ? 2 : 1);
      out.push(`<div class="d-table"><table><thead><tr>${head.map((c) => `<th>${inlineMd(c)}</th>`).join("")}</tr></thead><tbody>${bodyRows.map((r) => `<tr>${cells(r).map((c) => `<td>${inlineMd(c)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`);
      continue;
    }

    if (/^>\s?/.test(l)) {
      const buf = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) buf.push(lines[i++].replace(/^>\s?/, ""));
      let text = buf.join(" ").trim(), kind = "info", title = "";
      const km = /^\*\*(Note|Tip|Warning|Important)[:.]?\*\*\s*/i.exec(text);
      if (km) { title = km[1]; kind = /warn|important/i.test(km[1]) ? "warn" : /tip/i.test(km[1]) ? "tip" : "info"; text = text.slice(km[0].length); }
      out.push(h.callout(kind, title, inlineMd(text)));
      continue;
    }

    if (/^\s*([-*]|\d+\.)\s/.test(l)) {
      const ordered = /^\s*\d+\./.test(l);
      const items = [];
      while (i < lines.length && (/^\s*([-*]|\d+\.)\s/.test(lines[i]) || (/^\s{2,}\S/.test(lines[i]) && items.length))) {
        if (/^\s*([-*]|\d+\.)\s/.test(lines[i])) items.push(lines[i].replace(/^\s*([-*]|\d+\.)\s/, ""));
        else items[items.length - 1] += " " + lines[i].trim();
        i++;
      }
      out.push(`<${ordered ? "ol" : "ul"}>${items.map((t) => `<li>${inlineMd(t)}</li>`).join("")}</${ordered ? "ol" : "ul"}>`);
      continue;
    }

    const para = [];
    while (i < lines.length && !isBlank(lines[i]) && !fenceStart(lines[i]) && !/^(#{2,4}\s|\||>|\s*([-*]|\d+\.)\s)/.test(lines[i])) para.push(lines[i++]);
    out.push(`<p>${inlineMd(para.join(" "))}</p>`);
  }
  return { html: out.join("\n"), headings };
}

/** Plain text for search and meta descriptions. */
export function mdToText(src) {
  return String(src).replace(/```[\s\S]*?```/g, " ").replace(/`([^`]+)`/g, "$1").replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/^#{1,6}\s+/gm, "").replace(/\*\*([^*]+)\*\*/g, "$1").replace(/^>\s?/gm, "").replace(/^\|.*\|$/gm, " ").replace(/\s+/g, " ").trim();
}
