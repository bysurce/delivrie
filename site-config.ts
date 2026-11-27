// Website settings from the admin area (Admin → Website), applied on every public page:
// announcement bar, links to switched-off pages hidden, and text edits.
// Settings come from /api/public/site and are cached in localStorage so repeat visits apply them instantly.
// The admin page editor loads public pages in an iframe and uses window.DelivrieSite to find editable text.
(function () {
  var API = '/api/public/site', CACHE = 'dlv_site_v1';
  var INLINE = { B: 1, I: 1, EM: 1, STRONG: 1, BR: 1, A: 1, CODE: 1, SPAN: 1, SMALL: 1, SUP: 1, SUB: 1, U: 1, MARK: 1 };
  var EDITABLE = 'h1,h2,h3,h4,h5,h6,p,li,a,button,summary,td,th,label,dt,dd,figcaption,blockquote,span,b,strong,em,small,div';
  var SKIP = 'script,style,svg,noscript,select,option,textarea,input,.dlv-banner,[data-dlv-skip]';
  var editing = /[?&]dlv_edit=1/.test(location.search) && window.parent !== window;
  var cfg = null;

  function pagePath(p?: string) {
    p = (p || location.pathname).replace(/\/index(\.html)?$/, '/').replace(/\.html$/, '').replace(/^\/pages\//, '/');
    if (p.length > 1) p = p.replace(/\/+$/, '');
    if (p === '/compare' || /^\/vs\//.test(p)) p = '/pricing'; // same page, two views
    return p || '/';
  }
  function hash(s) { var h = 5381; for (var i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36); }
  function norm(s) { return String(s || '').replace(/\s+/g, ' ').trim(); }

  // An editable element holds its own text: it has a non-empty text node of its own and only inline children,
  // and it isn't inside another editable element.
  function isEditable(el) {
    if (el.closest(SKIP)) return false;
    var own = false;
    for (var n = el.firstChild; n; n = n.nextSibling) {
      if (n.nodeType === 3 && n.nodeValue.trim()) own = true;
      else if (n.nodeType === 1 && (!INLINE[n.tagName] || n.querySelector('div,p,ul,ol,li,h1,h2,h3,h4,h5,h6,table,section,article,img,svg,button'))) return false;
    }
    return own;
  }
  function candidates(root?: ParentNode) {
    var all = Array.prototype.slice.call((root || document.body).querySelectorAll(EDITABLE)).filter(isEditable);
    var set = new Set(all);
    return all.filter(function (el) { for (var p = el.parentElement; p; p = p.parentElement) if (set.has(p)) return false; return true; });
  }
  // Key = tag + hash of the element's original text + its position among elements with the same text.
  function keyed(root?: ParentNode) {
    var seen = {}, out = [];
    candidates(root).forEach(function (el) {
      var orig = el.dataset.dlvOrig != null ? el.dataset.dlvOrig : norm(el.textContent);
      var base = el.tagName.toLowerCase() + ':' + hash(orig);
      seen[base] = (seen[base] || 0) + 1;
      out.push({ el: el, key: base + ':' + seen[base], text: orig });
    });
    return out;
  }

  // Edits are written by admins, but still limited to plain inline formatting.
  function clean(html) {
    var t = document.createElement('template'); t.innerHTML = String(html || '');
    (function walk(node) {
      Array.prototype.slice.call(node.childNodes).forEach(function (c) {
        if (c.nodeType === 1) {
          if (!INLINE[c.tagName]) { c.replaceWith(document.createTextNode(c.textContent)); return; }
          Array.prototype.slice.call(c.attributes).forEach(function (a) {
            var ok = (c.tagName === 'A' && a.name === 'href' && !/^\s*javascript:/i.test(a.value)) || a.name === 'class';
            if (!ok) c.removeAttribute(a.name);
          });
          walk(c);
        } else if (c.nodeType !== 3) c.remove();
      });
    })(t.content);
    return t.innerHTML;
  }

  var applying = false;
  function applyEdits() {
    var edits = cfg && cfg.edits && cfg.edits[pagePath()];
    if (!edits) return;
    applying = true;
    keyed().forEach(function (k) {
      var e = edits[k.key];
      if (!e) return;
      if (k.el.dataset.dlvOrig == null) k.el.dataset.dlvOrig = k.text;
      var html = clean(e.html);
      if (k.el.innerHTML !== html) k.el.innerHTML = html;
      if (e.href && k.el.tagName === 'A') k.el.setAttribute('href', e.href);
    });
    applying = false;
  }

  function hideOffLinks() {
    var off = cfg && cfg.pages || {};
    Array.prototype.slice.call(document.querySelectorAll('a[href]')).forEach(function (a) {
      var u; try { u = new URL(a.getAttribute('href'), location.href); } catch (e) { return; }
      if (u.origin !== location.origin) return;
      var p = pagePath(u.pathname), slug = p.split('/')[1];
      var isOff = off[p] === false || (slug && off['/' + slug] === false);
      a.style.display = isOff ? 'none' : '';
    });
  }

  // Shown until an announcement is set in Admin → Website (Figma: Landing · Announcement).
  var DEFAULT_BANNER = { on: true, text: 'Automations and Inbox are live.', link: '/changelog', link_text: 'Read the changelog' };
  // One look for every announcement, from the Figma file (Landing · Announcement): an inset, rounded warm bar with a
  // yellow dot, the message in medium weight and a grey link. It follows the light/dark theme. Styles live in styles.css.
  function banner() {
    var b = (cfg && cfg.banner) || DEFAULT_BANNER, old = document.querySelector('.dlv-banner');
    if (window.DLV_V) return; // not on the dashboard or docs app
    if (!b || !b.on || !b.text) { if (old) old.remove(); return; }
    var el = old || document.createElement('div');
    el.className = 'dlv-banner';
    el.setAttribute('role', 'region'); el.setAttribute('aria-label', 'Announcement');
    el.innerHTML = '';
    var dot = document.createElement('i'); dot.setAttribute('aria-hidden', 'true'); el.appendChild(dot);
    var t = document.createElement('span'); t.className = 'msg'; t.textContent = String(b.text).trim(); el.appendChild(t);
    if (b.link) {
      var label = String(b.link_text || 'Learn more').replace(/[\s→>»]+$/, '');
      var a = document.createElement('a'); a.href = b.link; a.setAttribute('aria-label', label);
      var lt = document.createElement('span'); lt.className = 'lt'; lt.textContent = label + ' ';
      a.appendChild(lt); a.appendChild(document.createTextNode('→')); el.appendChild(a);
    }
    if (!old) document.body.insertBefore(el, document.body.firstChild);
  }

  function applyAll() {
    if (!cfg) { banner(); return; }
    banner(); hideOffLinks(); applyEdits();
    try { window.dispatchEvent(new CustomEvent('dlv:site', { detail: cfg })); } catch (e) {}
  }

  window.DelivrieSite = { pagePath: pagePath, keyed: keyed, clean: clean, norm: norm, get config() { return cfg; }, set: function (c) { cfg = c; applyAll(); }, apply: applyAll, editing: editing };

  try { var c = JSON.parse(localStorage.getItem(CACHE) || 'null'); if (c) { cfg = c; applyAll(); } } catch (e) {}
  if (!cfg) banner();
  if (!editing && window.fetch) {
    fetch(API, { credentials: 'omit' }).then(function (r) { return r.ok ? r.json() : null; }).then(function (fresh) {
      if (!fresh) return;
      cfg = fresh; try { localStorage.setItem(CACHE, JSON.stringify(fresh)); } catch (e) {}
      applyAll();
    }).catch(function () {});
  }
  // Pages that render parts with JavaScript (pricing cards, the comparison) get edits re-applied after they change.
  if ('MutationObserver' in window) {
    var t = null;
    new MutationObserver(function () { if (applying || editing) return; clearTimeout(t); t = setTimeout(function () { applyEdits(); hideOffLinks(); }, 30); })
      .observe(document.body, { childList: true, subtree: true });
  }
})();

// Theme switches on the site: System / Light / Dark in the footer, Light / Dark in the nav. Same storage key as the dashboard.
(function () {
  if (window.DLV_V) return; // the dashboard and docs app handle their own switch (app/js/lib/theme.ts)
  var KEY = "dlv_theme", mq = window.matchMedia && matchMedia("(prefers-color-scheme: dark)");
  function get() { try { return localStorage.getItem(KEY) || "light"; } catch (e) { return "light"; } }
  function apply(t: string, animate?: boolean) {
    var root = document.documentElement, r = t === "system" ? (mq && mq.matches ? "dark" : "light") : t;
    if (animate && !(window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches)) {
      root.classList.add("theme-anim"); setTimeout(function () { root.classList.remove("theme-anim"); }, 350);
    }
    root.setAttribute("data-theme", r);
    var m = document.querySelector('meta[name="theme-color"]'); if (m) m.setAttribute("content", r === "dark" ? "#1f1d1e" : "#ffffff");
    // Footer shows the stored choice (including System); the nav shows the theme on screen.
    var b = document.querySelectorAll(".theme-sw [data-theme-set]");
    for (var i = 0; i < b.length; i++) b[i].classList.toggle("on", b[i].getAttribute("data-theme-set") === t);
    var n = document.querySelectorAll(".nav-theme [data-theme-set]");
    for (var j = 0; j < n.length; j++) { var on = n[j].getAttribute("data-theme-set") === r; n[j].classList.toggle("on", on); n[j].setAttribute("aria-pressed", on ? "true" : "false"); }
  }
  document.addEventListener("click", function (e: any) {
    var b = e.target.closest && e.target.closest("[data-theme-set]");
    if (!b) return;
    var t = b.getAttribute("data-theme-set");
    try { localStorage.setItem(KEY, t); } catch (err) {}
    apply(t, true);
  });
  window.addEventListener("storage", function (e: any) { if (e.key === KEY) apply(get()); }); // other tabs
  if (mq && mq.addEventListener) mq.addEventListener("change", function () { if (get() === "system") apply("system", true); });
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", function () { apply(get()); }); else apply(get());
})();

// Mobile menu (Figma: Mobile · Menu open) and the mobile light/dark button.
(function () {
  if (window.DLV_V) return;
  function $(s) { return document.querySelector(s); }
  function open(on) {
    var m = $("#mmenu"), b = $(".m-menu"); if (!m) return;
    if (on) {
      var sys = document.getElementById("sys"), st = m.querySelector(".mm-status");
      if (sys && st) { st.querySelector("span").textContent = sys.textContent.trim() || "All systems operational"; st.className = "mm-status " + (sys.className.replace(/\bsys\b/, "").trim()); }
      m.hidden = false; document.documentElement.classList.add("mm-open");
      var c = m.querySelector(".mm-close"); if (c) c.focus();
    } else {
      m.hidden = true; document.documentElement.classList.remove("mm-open");
      if (b) b.focus();
    }
    if (b) b.setAttribute("aria-expanded", on ? "true" : "false");
  }
  document.addEventListener("click", function (e: any) {
    var t = e.target.closest ? e.target : null; if (!t) return;
    if (t.closest(".m-menu")) { open(true); return; }
    if (t.closest(".mm-close")) { open(false); return; }
    var g = t.closest(".mm-toggle");
    if (g) { var grp = g.parentNode; var on = !grp.classList.contains("open"); grp.classList.toggle("open", on); g.setAttribute("aria-expanded", on ? "true" : "false"); return; }
    if (t.closest(".mmenu a")) { open(false); return; }
    var f = t.closest("[data-theme-flip]");
    if (f) { var next = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark"; var btn = document.querySelector('.theme-sw [data-theme-set="' + next + '"]'); if (btn) (btn as HTMLElement).click(); }
  });
  document.addEventListener("keydown", function (e: any) { if (e.key === "Escape" && $("#mmenu") && !$("#mmenu").hidden) open(false); });
  window.addEventListener("resize", function () { if (window.innerWidth > 900 && $("#mmenu") && !$("#mmenu").hidden) open(false); });
})();

// Desktop nav dropdowns (Figma: Nav dropdown). Hover opens on a mouse; a click, tap, Enter or the down arrow opens
// for touch and keyboard (a second click follows the link). Escape, a click outside or moving focus away closes.
(function () {
  if (window.DLV_V) return;
  var hover = window.matchMedia && matchMedia("(hover: hover) and (pointer: fine)").matches;
  var timer = null;
  function all() { return document.querySelectorAll("[data-dd]"); }
  function place(dd) {
    var p = dd.querySelector(".nav-dd-panel"); if (!p) return;
    p.style.marginLeft = "";
    var r = p.getBoundingClientRect(), max = document.documentElement.clientWidth - 16;
    if (r.right > max) p.style.marginLeft = -(r.right - max) + "px";
    else if (r.left < 16) p.style.marginLeft = (16 - r.left) + "px";
  }
  function set(dd, on) {
    if (!dd) return;
    if (on) all().forEach(function (o) { if (o !== dd) set(o, false); });
    dd.classList.toggle("open", on);
    var b = dd.querySelector(".nav-dd-btn"); if (b) b.setAttribute("aria-expanded", on ? "true" : "false");
    if (on) place(dd);
  }
  function later(fn, ms) { clearTimeout(timer); timer = setTimeout(fn, ms); }
  document.addEventListener("mouseover", function (e: any) {
    if (!hover || !e.target.closest) return;
    var dd = e.target.closest("[data-dd]");
    if (dd) later(function () { set(dd, true); }, dd.classList.contains("open") ? 0 : 80);
  });
  document.addEventListener("mouseout", function (e: any) {
    if (!hover || !e.target.closest) return;
    var dd = e.target.closest("[data-dd]");
    if (dd && !(e.relatedTarget && dd.contains(e.relatedTarget))) later(function () { set(dd, false); }, 160);
  });
  document.addEventListener("click", function (e: any) {
    var t = e.target.closest ? e.target : null; if (!t) return;
    var btn = t.closest(".nav-dd-btn");
    if (btn) {
      var dd = btn.closest("[data-dd]");
      // Opened by hover: the click goes to the page. Otherwise the first click/tap opens the menu.
      if (!dd.classList.contains("open") || !hover) { e.preventDefault(); clearTimeout(timer); set(dd, !dd.classList.contains("open")); }
      return;
    }
    var copy = t.closest(".dd-install[data-copy]");
    if (copy) {
      var done = function () { copy.classList.add("done"); setTimeout(function () { copy.classList.remove("done"); }, 1600); };
      try { navigator.clipboard.writeText(copy.getAttribute("data-copy")).then(done, function () {}); } catch (err) {}
      return;
    }
    if (!t.closest(".nav-dd-panel") || t.closest("a")) all().forEach(function (o) { set(o, false); });
  });
  document.addEventListener("keydown", function (e: any) {
    var dd = e.target.closest && e.target.closest("[data-dd]");
    if (e.key === "Escape") {
      var open = document.querySelector("[data-dd].open");
      if (open) { set(open, false); var b = open.querySelector(".nav-dd-btn") as HTMLElement | null; if (b) b.focus(); }
      return;
    }
    if (!dd) return;
    var items = [].slice.call(dd.querySelectorAll(".nav-dd-panel a, .nav-dd-panel button"));
    if (e.key === "ArrowDown") {
      e.preventDefault(); set(dd, true);
      var i = items.indexOf(document.activeElement); (items[i + 1] || items[0]).focus();
    } else if (e.key === "ArrowUp" && items.length) {
      e.preventDefault(); var j = items.indexOf(document.activeElement); (items[j - 1] || items[items.length - 1]).focus();
    }
  });
  document.addEventListener("focusin", function (e: any) {
    all().forEach(function (o) { if (o.classList.contains("open") && !o.contains(e.target)) set(o, false); });
  });
  window.addEventListener("resize", function () { var o = document.querySelector("[data-dd].open"); if (o) place(o); });
})();

// Contact support: the chat button on every public page, for visitors and signed-in customers alike. Only the button
// is drawn up front; the chat itself (/app/js/lib/chat.js) loads when it's clicked, or quietly after the page is idle
// for someone with a conversation in progress, so a reply can show as unread.
(function () {
  if (window.__dlvSupport || /[?&]dlv_edit=1/.test(location.search)) return;
  window.__dlvSupport = 1;
  var MARK = '<svg width="19.84" height="14.88" viewBox="0 0 48 36" fill="none" aria-hidden="true"><g transform="translate(7.000 -2.8709) scale(0.229730)"><path d="M0 90.85L37 16.85H74C93.626 16.85 112.448 24.6464 126.326 38.5241C140.204 52.4018 148 71.224 148 90.85C148 110.476 140.204 129.298 126.326 143.176C112.448 157.054 93.626 164.85 74 164.85H0L37 90.85H74L55.5 127.85H74C83.813 127.85 93.2241 123.952 100.163 117.013C107.102 110.074 111 100.663 111 90.85C111 81.037 107.102 71.6259 100.163 64.687C93.2241 57.7482 83.813 53.85 74 53.85H55.5L37 90.85H0Z" fill="#FAD600"/></g></svg>';
  var css = document.createElement('link'); css.rel = 'stylesheet'; css.href = '/app/css/chat.css'; document.head.appendChild(css);
  document.documentElement.classList.add('sc-site');
  var root = document.createElement('div'); root.className = 'sc site';
  root.innerHTML = '<button class="sc-tab" aria-label="Contact support" aria-expanded="false"><span class="sc-tab-av">' + MARK + '</span><span>Contact support</span></button>';
  var loading = null, tab = root.querySelector('.sc-tab');
  // Warm the browser cache (fetch, don't run) the first time someone hovers or touches the button, or once the page is idle.
  var warmed = false;
  function warm() {
    if (warmed) return; warmed = true;
    ['/app/js/lib/chat.js', '/app/js/lib/sb.js', '/app/js/lib/ui.js', '/app/js/lib/icons.js', '/app/vendor/supabase-js.js'].forEach(function (h) { var l = document.createElement('link'); l.rel = 'modulepreload'; l.href = h; document.head.appendChild(l); });
  }
  // The panel frame appears the moment the button is pressed; the chat fills it in when its code has arrived.
  // Pressing again (or its close button) before then just closes the frame, and the chat mounts closed.
  var want = false;
  function shell(on) {
    var p = root.querySelector('.sc-shell');
    if (on && !p) {
      p = document.createElement('section'); p.className = 'sc-panel v-home sc-shell'; p.setAttribute('aria-label', 'Delivrie support'); p.setAttribute('aria-busy', 'true');
      p.innerHTML = '<header class="sc-hero"><div class="sc-hero-top"><div class="sc-brand"><span class="sc-av-d big">' + MARK + '</span><b>Delivrie support</b></div><div class="sc-acts"><button class="sc-ib" aria-label="Close"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg></button></div></div><h2></h2></header><div class="sc-scroll"><div class="sc-skel"></div><div class="sc-skel"></div><div class="sc-skel"></div></div>';
      p.querySelector('button').addEventListener('click', function () { want = false; shell(false); });
      root.insertBefore(p, tab);
    } else if (!on && p) p.remove();
    root.classList.toggle('on', on); document.documentElement.classList.toggle('sc-open', on);
    tab.setAttribute('aria-expanded', String(on));
    if (on) tab.setAttribute('aria-busy', 'true'); else tab.removeAttribute('aria-busy');
  }
  function load(open?: boolean | string) {
    if (open) { want = !want || open === 'force'; shell(want); }
    if (loading) return;
    warm();
    loading = import('/app/js/lib/chat.js').then(function (m) { document.removeEventListener('keydown', onKey); return m.mountSite({ root: root, open: want }); });
    loading.catch(function () { loading = null; var w = want; shell(false); want = false; if (w) location.href = 'mailto:support@delivrie.io'; });
  }
  function onKey(e) {
    var a = document.activeElement as HTMLElement | null;
    if (e.key === '?' && !e.metaKey && !e.ctrlKey && !(a && (/^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) || a.isContentEditable))) { e.preventDefault(); load('force'); }
  }
  tab.addEventListener('click', function () { load(true); });
  ['pointerenter', 'touchstart', 'focus'].forEach(function (ev: any) { tab.addEventListener(ev, warm, { passive: true, once: true }); });
  document.addEventListener('keydown', onKey);
  function start() {
    document.body.appendChild(root);
    var active = false; try { active = !!localStorage.getItem('dlv_support_active'); } catch (e) {}
    if (/[?&]support=/.test(location.search)) load('force');
    else if (active) (window.requestIdleCallback || function (f) { setTimeout(f, 2500); })(function () { load(false); });
    else setTimeout(function () { (window.requestIdleCallback || function (f: () => void) { f(); })(warm); }, 4000);
  }
  if (document.body) start(); else document.addEventListener('DOMContentLoaded', start);
})();
