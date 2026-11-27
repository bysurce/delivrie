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

  function pagePath(p) {
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
  function candidates(root) {
    var all = Array.prototype.slice.call((root || document.body).querySelectorAll(EDITABLE)).filter(isEditable);
    var set = new Set(all);
    return all.filter(function (el) { for (var p = el.parentElement; p; p = p.parentElement) if (set.has(p)) return false; return true; });
  }
  // Key = tag + hash of the element's original text + its position among elements with the same text.
  function keyed(root) {
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
  if (window.DLV_V) return; // the dashboard and docs app handle their own switch (app/js/lib/theme.js)
  var KEY = "dlv_theme", mq = window.matchMedia && matchMedia("(prefers-color-scheme: dark)");
  function get() { try { return localStorage.getItem(KEY) || "light"; } catch (e) { return "light"; } }
  function apply(t, animate) {
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
  document.addEventListener("click", function (e) {
    var b = e.target.closest && e.target.closest("[data-theme-set]");
    if (!b) return;
    var t = b.getAttribute("data-theme-set");
    try { localStorage.setItem(KEY, t); } catch (err) {}
    apply(t, true);
  });
  window.addEventListener("storage", function (e) { if (e.key === KEY) apply(get()); }); // other tabs
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
  document.addEventListener("click", function (e) {
    var t = e.target.closest ? e.target : null; if (!t) return;
    if (t.closest(".m-menu")) { open(true); return; }
    if (t.closest(".mm-close")) { open(false); return; }
    var g = t.closest(".mm-toggle");
    if (g) { var grp = g.parentNode; var on = !grp.classList.contains("open"); grp.classList.toggle("open", on); g.setAttribute("aria-expanded", on ? "true" : "false"); return; }
    if (t.closest(".mmenu a")) { open(false); return; }
    var f = t.closest("[data-theme-flip]");
    if (f) { var next = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark"; var btn = document.querySelector('.theme-sw [data-theme-set="' + next + '"]'); if (btn) btn.click(); }
  });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && $("#mmenu") && !$("#mmenu").hidden) open(false); });
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
  document.addEventListener("mouseover", function (e) {
    if (!hover || !e.target.closest) return;
    var dd = e.target.closest("[data-dd]");
    if (dd) later(function () { set(dd, true); }, dd.classList.contains("open") ? 0 : 80);
  });
  document.addEventListener("mouseout", function (e) {
    if (!hover || !e.target.closest) return;
    var dd = e.target.closest("[data-dd]");
    if (dd && !(e.relatedTarget && dd.contains(e.relatedTarget))) later(function () { set(dd, false); }, 160);
  });
  document.addEventListener("click", function (e) {
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
  document.addEventListener("keydown", function (e) {
    var dd = e.target.closest && e.target.closest("[data-dd]");
    if (e.key === "Escape") {
      var open = document.querySelector("[data-dd].open");
      if (open) { set(open, false); var b = open.querySelector(".nav-dd-btn"); if (b) b.focus(); }
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
  document.addEventListener("focusin", function (e) {
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
  var MARK = '<svg width="19.84" height="14.88" viewBox="0 0 48 36" fill="none" aria-hidden="true"><path d="M45.621 15.8308C47.0004 16.948 47.0004 19.052 45.621 20.1692L33.6 29.9049C31.775 31.3829 29.0518 30.0841 29.0518 27.7357L29.0518 8.26426C29.0518 5.91588 31.775 4.61707 33.6 6.09507L45.621 15.8308Z" fill="#FAD600"/><path d="M27.7507 14.2163C29.6239 16.391 29.624 19.609 27.7507 21.7837L19.8975 30.9006C17.5846 33.5857 13.4253 33.5857 11.1125 30.9006L3.25923 21.7837C1.386 19.609 1.386 16.391 3.25923 14.2163L11.1124 5.09937C13.4253 2.41433 17.5846 2.41432 19.8975 5.09937L27.7507 14.2163Z" fill="#FAD600"/></svg>';
  var css = document.createElement('link'); css.rel = 'stylesheet'; css.href = '/app/css/chat.css'; document.head.appendChild(css);
  document.documentElement.classList.add('sc-site');
  var root = document.createElement('div'); root.className = 'sc site';
  root.innerHTML = '<button class="sc-tab" aria-label="Contact support" aria-expanded="false"><span class="sc-tab-av">' + MARK + '</span><span>Contact support</span></button>';
  var loading = null;
  function load(open) {
    if (!loading) {
      root.querySelector('.sc-tab').setAttribute('aria-busy', 'true');
      loading = import('/app/js/lib/chat.js').then(function (m) { document.removeEventListener('keydown', onKey); return m.mountSite({ root: root, open: open }); });
    } else if (open) loading.then(function (w) { w.open(); });
    loading.catch(function () { loading = null; location.href = 'mailto:support@delivrie.io'; });
  }
  function onKey(e) {
    var a = document.activeElement;
    if (e.key === '?' && !e.metaKey && !e.ctrlKey && !(a && (/^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) || a.isContentEditable))) { e.preventDefault(); load(true); }
  }
  root.querySelector('.sc-tab').addEventListener('click', function () { load(true); });
  document.addEventListener('keydown', onKey);
  function start() {
    document.body.appendChild(root);
    var active = false; try { active = !!localStorage.getItem('dlv_support_active'); } catch (e) {}
    if (/[?&]support=/.test(location.search)) load(true);
    else if (active) (window.requestIdleCallback || function (f) { setTimeout(f, 2500); })(function () { load(false); });
  }
  if (document.body) start(); else document.addEventListener('DOMContentLoaded', start);
})();
