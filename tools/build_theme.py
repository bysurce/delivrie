#!/usr/bin/env python3
"""Theme and brand chrome for every built page. Run last (tools/build_seo.py calls it).

- Light is the default theme; a stored choice (System / Light / Dark, key dlv_theme) is applied before first paint.
- Site footers get the Delivrie lockup and the theme switch (site-config.js wires the buttons).
"""
import glob, os, re, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
try:
    from site_content import CHANGELOG
    LATEST = " ".join(CHANGELOG[0][0].split(",")[0].split()[:2])  # "Nov 13"
except Exception:
    LATEST = ""

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BOOT = ('<script data-theme-boot>try{var t=localStorage.getItem("dlv_theme")||"light";if(t==="system")t=matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";'
        'document.documentElement.dataset.theme=t}catch(e){document.documentElement.dataset.theme="light"}'
    # Prices are in US dollars for everyone (Naira was retired on 27 Nov 2026). Anything still marked only-ngn stays hidden.
    'document.documentElement.dataset.cur="USD";'
        # Signed in already (a Supabase session is stored on this origin): the nav offers Dashboard instead of
        # Log in / Get started. Hidden before first paint; the button is relabelled as soon as the page is parsed.
        'try{var a=JSON.parse(localStorage.getItem("sb-hnjejflinvaoxbduxeiu-auth-token")||"null");if(a&&(a.refresh_token||a.currentSession)){'
        'document.documentElement.dataset.auth="in";'
        # Every sign-up link: plan buttons open Billing with that plan; "Start for free" / "Get started" go to the dashboard.
        'var f=function(){document.querySelectorAll(\'a[href^="/signup"]\').forEach(function(a){var h=a.getAttribute("href"),m=/[?&]plan=([a-z]+)/.exec(h);'
        'if(m){a.href="/billing?upgrade="+m[1]+(/interval=yearly/.test(h)?"&interval=yearly":"");return}var t=a.textContent.trim();'
        'a.href=/^(Emails|Broadcasts|Templates)$/.test(t)?"/"+t.toLowerCase():"/emails";'
        'if(a.matches(".btn-signup,.mm-btn"))a.textContent="Dashboard";else if(/^(Start|Get started|Sign up)/i.test(t))a.textContent="Go to dashboard"})};'
        'document.addEventListener("DOMContentLoaded",function(){f();new MutationObserver(f).observe(document.body,{childList:true,subtree:true})})}}catch(e){}'
        '</script><style>html[data-auth=in] .nav-link.keep[href="/login"],html[data-auth=in] .mm-btn.sec[href="/login"]{display:none}.only-ngn{display:none!important}</style>')
ICONS = {
    "system": '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/></svg>',
    "light": '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
    "dark": '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/></svg>',
}
SWITCH = ('<div class="theme-sw" role="group" aria-label="Theme">' + "".join(
    f'<button type="button" data-theme-set="{t}" title="{t.title()}" aria-label="{t.title()} theme">{ICONS[t]}</button>' for t in ("system", "light", "dark")) + "</div>")
NAV_TOGGLE = ('<div class="nav-theme" role="group" aria-label="Theme">'
              f'<button type="button" data-theme-set="light" title="Light" aria-label="Light theme">{ICONS["light"]}</button>'
              f'<button type="button" data-theme-set="dark" title="Dark" aria-label="Dark theme">{ICONS["dark"]}</button></div>'
              '<span class="divider" aria-hidden="true"></span>')
def svg(body, size=18):
    return f'<svg width="{size}" height="{size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">{body}</svg>'
MI = {
    "mail": '<path d="M19 5H5C3.89543 5 3 5.89543 3 7V17C3 18.1046 3.89543 19 5 19H19C20.1046 19 21 18.1046 21 17V7C21 5.89543 20.1046 5 19 5Z"/><path d="M3.5 6.5L12 13L20.5 6.5"/>',
    "send": '<path d="M21 3L10.5 13.5M10.5 13.5L3 9.5L21 3L14.5 21L10.5 13.5Z"/>',
    "template": '<path d="M18.5 3.5H5.5C4.39543 3.5 3.5 4.39543 3.5 5.5V18.5C3.5 19.6046 4.39543 20.5 5.5 20.5H18.5C19.6046 20.5 20.5 19.6046 20.5 18.5V5.5C20.5 4.39543 19.6046 3.5 18.5 3.5Z"/><path d="M3.5 9H20.5M9 9V20.5"/>',
    "workflow": '<rect x="3.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.5"/><path d="M7 10.5V14C7 15.66 8.34 17 10 17H13.5"/>',
    "inbox": '<path d="M3.5 13.5L6 5.5H18L20.5 13.5V18.5H3.5V13.5Z"/><path d="M3.5 13.5H8.5L9.5 15.5H14.5L15.5 13.5H20.5"/>',
    "x": '<path d="M6 6L18 18M18 6L6 18"/>',
    "right": '<path d="M9.5 6L15.5 12L9.5 18"/>',
    "down": '<path d="M6 9.5L12 15.5L18 9.5"/>',
    "lines": '<path d="M4 8.5H20M10 15.5H20"/>',
}
PRODUCTS = [("mail", "Emails", "Transactional email over API and SMTP", "/docs/send-email"),
            ("send", "Broadcasts", "Newsletters and launches to segments", "/docs/broadcasts"),
            ("template", "Templates", "React and drag-and-drop editors", "/docs/templates"),
            ("workflow", "Automations", "Event-driven flows, no cron jobs", "/docs"),
            ("inbox", "Inbox", "Receive mail and let agents draft replies", "/docs")]
# Desktop nav dropdowns (Figma: Nav dropdown, Menu=Product / Menu=Docs). Icon paths are the Delivrie icon set as
# exported from the Figma file, drawn in currentColor so they follow the theme.
DI = {
    "mail": '<path d="M5 5H19C20.1046 5 21 5.89543 21 7V17C21 18.1046 20.1046 19 19 19H5C3.89543 19 3 18.1046 3 17V7C3 5.89543 3.89543 5 5 5Z"/><path d="M3.5 6.5L12 13L20.5 6.5"/>',
    "send": '<path d="M21 3L10.5 13.5M10.5 13.5L3 9.5L21 3L14.5 21L10.5 13.5Z"/>',
    "template": '<path d="M5.5 3.5H18.5C19.6046 3.5 20.5 4.39543 20.5 5.5V18.5C20.5 19.6046 19.6046 20.5 18.5 20.5H5.5C4.39543 20.5 3.5 19.6046 3.5 18.5V5.5C3.5 4.39543 4.39543 3.5 5.5 3.5Z"/><path d="M3.5 9H20.5M9 9V20.5"/>',
    "workflow": '<path d="M3 3H10V10H3V3Z"/><path d="M14 14H21V21H14V14Z"/><path d="M6.5 10V13.5C6.5 15.7 8.3 17.5 10.5 17.5H14"/>',
    "inbox": '<path d="M2 12L5.5 5H18.5L22 12V18C22 19.1 21.1 20 20 20H4C2.9 20 2 19.1 2 18V12Z"/><path d="M2 12H8L10 15H14L16 12H22"/>',
    "chart": '<path d="M3.5 3.5V20.5H20.5"/><path d="M8 16V12M12.5 16V8M17 16V10"/>',
    "arrow": '<path d="M5 12H19M13 18L19 12L13 6"/>',
    "sparkle": '<path d="M12 3C12.6 7.4 14.6 9.4 19 10C14.6 10.6 12.6 12.6 12 17C11.4 12.6 9.4 10.6 5 10C9.4 9.4 11.4 7.4 12 3Z"/>',
    "book": '<path d="M3.5 5.5C6.3 4.3 9.1 4.3 12 6C14.9 4.3 17.7 4.3 20.5 5.5V18.5C17.7 17.3 14.9 17.3 12 19C9.1 17.3 6.3 17.3 3.5 18.5V5.5Z"/><path d="M12 6V19"/>',
    "refresh": '<path d="M20 11C19.8784 9.38776 19.2712 7.8502 18.2584 6.58994C17.2456 5.32969 15.8747 4.40589 14.3263 3.94031C12.778 3.47473 11.125 3.48922 9.58503 3.98186C8.04511 4.47451 6.69059 5.42219 5.7 6.7L4 8.5M8.5 8.5H4V4M4 13C4.12155 14.6122 4.72876 16.1498 5.74159 17.4101C6.75442 18.6703 8.12534 19.5941 9.67366 20.0597C11.222 20.5253 12.875 20.5108 14.415 20.0181C15.9549 19.5255 17.3094 18.5778 18.3 17.3L20 15.5M15.5 15.5H20V20"/>',
    "globe": '<path d="M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z"/><path d="M3 12H21M12 3C14.5 5.6 15.8 8.6 15.8 12C15.8 15.4 14.5 18.4 12 21C9.5 18.4 8.2 15.4 8.2 12C8.2 8.6 9.5 5.6 12 3Z"/>',
    "code": '<path d="M8.5 7L3.5 12L8.5 17M15.5 7L20.5 12L15.5 17"/>',
    "terminal": '<path d="M5 4.5H19C20.1046 4.5 21 5.39543 21 6.5V17.5C21 18.6046 20.1046 19.5 19 19.5H5C3.89543 19.5 3 18.6046 3 17.5V6.5C3 5.39543 3.89543 4.5 5 4.5Z"/><path d="M7 9.5L10 12L7 14.5M12.5 15H17"/>',
    "webhook": '<path d="M9 7.5C9 6.9034 9.1525 6.31671 9.44302 5.79562C9.73355 5.27454 10.1524 4.83637 10.6599 4.52272C11.1674 4.20907 11.7467 4.03035 12.3427 4.00354C12.9387 3.97672 13.5316 4.1027 14.0652 4.36951C14.5989 4.63631 15.0554 5.03509 15.3916 5.52798C15.7277 6.02086 15.9323 6.59149 15.9859 7.18568C16.0394 7.77987 15.9402 8.37789 15.6977 8.92296C15.4551 9.46802 15.0773 9.94204 14.6 10.3L17.5 15"/><path d="M6.50006 13.2C5.8773 13.2453 5.27801 13.4564 4.76434 13.8114C4.25066 14.1664 3.8413 14.6523 3.57871 15.2188C3.31612 15.7853 3.20985 16.4118 3.27094 17.0332C3.33203 17.6546 3.55825 18.2483 3.92613 18.7529C4.29401 19.2574 4.79016 19.6543 5.36313 19.9025C5.9361 20.1506 6.56502 20.241 7.18468 20.1642C7.80434 20.0874 8.39217 19.8462 8.88722 19.4657C9.38226 19.0851 9.76649 18.5791 10.0001 18H17.0001"/><path d="M17.5 21C18.076 21.0081 18.6452 20.8738 19.1569 20.6092C19.6687 20.3445 20.1072 19.9576 20.4335 19.4828C20.7598 19.0081 20.9639 18.46 21.0276 17.8875C21.0914 17.3149 21.0127 16.7354 20.7988 16.2005C20.5848 15.6656 20.2421 15.1917 19.8011 14.821C19.36 14.4504 18.8343 14.1943 18.2706 14.0755C17.7068 13.9568 17.1225 13.979 16.5694 14.1403C16.0163 14.3015 15.5116 14.5969 15.1 15L12.1 9.5"/>',
    "check": '<path d="M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z"/><path d="M8 12.3L10.7 15L16 9.5"/>',
    "copy": '<path d="M10.5 8.5H18.5C19.6046 8.5 20.5 9.39543 20.5 10.5V18.5C20.5 19.6046 19.6046 20.5 18.5 20.5H10.5C9.39543 20.5 8.5 19.6046 8.5 18.5V10.5C8.5 9.39543 9.39543 8.5 10.5 8.5Z"/><path d="M15.5 8.5V5.5C15.5 4.96957 15.2893 4.46086 14.9142 4.08579C14.5391 3.71071 14.0304 3.5 13.5 3.5H5.5C4.96957 3.5 4.46086 3.71071 4.08579 4.08579C3.71071 4.46086 3.5 4.96957 3.5 5.5V13.5C3.5 14.0304 3.71071 14.5391 4.08579 14.9142C4.46086 15.2893 4.96957 15.5 5.5 15.5H8.5"/>',
    "chevron": '<path d="M6 9L12 15L18 9"/>',
}
def dd_item(icon, title, desc, href):
    return (f'<a class="dd-item" href="{href}" role="menuitem"><span class="dd-tile">{svg(DI[icon], 18)}</span>'
            f'<span class="dd-text"><b>{title}</b><small>{desc}</small></span></a>')
def dd_col(label, items):
    return f'<div class="dd-col"><p class="dd-label">{label}</p>' + "".join(dd_item(*i) for i in items) + '</div>'
DD_PRODUCT = ('<div class="dd-body dd-product-body"><div class="dd-col dd-grid-col"><p class="dd-label">PRODUCT</p><div class="dd-grid">' + "".join(dd_item(*i) for i in [
    ("mail", "Emails", "Transactional email over API and SMTP", "/docs/send-email"),
    ("send", "Broadcasts", "Newsletters and launches to segments", "/docs/broadcasts"),
    ("template", "Templates", "22 ready-made, in your brand", "/docs/templates"),
    ("workflow", "Automations", "Flows triggered by events, no cron jobs", "/docs/automations"),
    ("inbox", "Inbox", "Receive replies; agents draft answers", "/docs/inbox"),
    ("chart", "Metrics and logs", "Every open, click and bounce, live", "/docs/email-status")]) + '</div></div>'
  '<a class="dd-feature" href="/changelog"><span class="dd-tag">New</span>'
  '<span class="dd-art"><span class="dd-step">Trigger</span><span class="dd-step on">Send</span><span class="dd-step">Wait 2 days</span></span>'
  '<b>Automations and Inbox are live</b><small>Build flows from events and answer replies without leaving Delivrie.</small>'
  f'<span class="dd-more">See what’s new{svg(DI["arrow"], 14)}</span></a></div>'
  f'<div class="dd-foot"><a class="dd-foot-l" href="/docs/mcp">{svg(DI["sparkle"], 16)}<span>MCP server: let AI agents send, read logs and fix DNS</span></a>'
  f'<a class="dd-more" href="/resend-alternative">Compare with Resend{svg(DI["arrow"], 14)}</a></div>')
DD_DOCS = ('<div class="dd-body dd-docs-body">'
  + dd_col("GET STARTED", [("book", "Quickstart", "Send your first email in 5 minutes", "/docs/quickstart"),
                           ("refresh", "Migrate from Resend", "Keep your SDK; change two lines", "/docs/migrate-from-resend"),
                           ("globe", "Verify a domain", "SPF, DKIM and DMARC, step by step", "/docs/domains")])
  + dd_col("REFERENCE", [("code", "API reference", "Every endpoint, with examples", "/docs/api"),
                         ("terminal", "SDKs", "Node.js and Python", "/docs/sdks"),
                         ("webhook", "Webhooks", "Events, payloads and signatures", "/docs/webhooks")])
  + dd_col("BUILD WITH AI", [("sparkle", "MCP server", "64 tools for Claude, Cursor and more", "/docs/mcp"),
                             ("mail", "SMTP relay", "Ports 587 and 465", "/docs/smtp"),
                             ("check", "Status", "Live uptime and incidents", "/status")])
  + '</div><div class="dd-foot"><button type="button" class="dd-install" data-copy="npm install delivrie" aria-label="Copy npm install delivrie">'
  f'<span class="dd-dollar">$</span><span>npm install delivrie</span><span class="dd-copy">{svg(DI["copy"], 14)}</span><span class="dd-copied">{svg(DI["check"], 14)}</span></button>'
  f'<a class="dd-more" href="/docs">Open the docs{svg(DI["arrow"], 14)}</a></div>')
def nav_dd(key, label, href, panel):
    return (f'<!--dd-{key}--><div class="nav-dd" data-dd><a class="nav-link nav-dd-btn" href="{href}" aria-haspopup="true" aria-expanded="false" aria-controls="dd-{key}">{label}{svg(DI["chevron"], 14)}</a>'
            f'<div class="nav-dd-panel dd-{key}" id="dd-{key}" role="menu" aria-label="{label}">{panel}</div></div><!--/dd-{key}-->')
NAV_DD = {"product": ('<a class="nav-link" href="/#integrate">Product</a>', nav_dd("product", "Product", "/#integrate", DD_PRODUCT)),
          "docs": ('<a class="nav-link" href="/docs">Docs</a>', nav_dd("docs", "Docs", "/docs", DD_DOCS))}

def badge(t): return f'<span class="mm-badge">{t}</span>'
MOBILE_ACTIONS = ('<button type="button" class="m-theme" data-theme-flip aria-label="Switch between light and dark theme">'
                  f'<span class="i-moon">{svg(MI["x"].replace(MI["x"], ICONS["dark"].split(">",1)[1].rsplit("</svg>",1)[0]), 17)}</span>'
                  f'<span class="i-sun">{svg(ICONS["light"].split(">",1)[1].rsplit("</svg>",1)[0], 17)}</span></button>'
                  f'<button type="button" class="m-menu" aria-expanded="false" aria-controls="mmenu" aria-label="Open menu">{svg(MI["lines"], 18)}</button>')
MOBILE_MENU = ('<!--mmenu--><div class="mmenu" id="mmenu" role="dialog" aria-modal="true" aria-label="Menu" hidden>'
  '<div class="mm-top"><a href="/" aria-label="Delivrie home"><img src="/assets/logo.svg" width="121" height="22" alt="Delivrie"></a>'
  f'<button type="button" class="mm-close" aria-label="Close menu">{svg(MI["x"], 18)}</button></div>'
  '<nav class="mm-body" aria-label="Mobile">'
  f'<div class="mm-group open"><button type="button" class="mm-row mm-toggle" aria-expanded="true"><span>Product</span>{svg(MI["down"], 18)}</button>'
  '<div class="mm-items">' + "".join(f'<a class="mm-item" href="{h}"><span class="mm-tile">{svg(MI[i], 18)}</span><span><b>{t}</b><small>{d}</small></span></a>' for i, t, d, h in PRODUCTS) + '</div></div>'
  f'<a class="mm-row" href="/docs"><span>Docs</span>{svg(MI["right"], 18)}</a>'
  f'<a class="mm-row" href="/pricing"><span>Pricing</span>{svg(MI["right"], 18)}</a>'
  f'<a class="mm-row" href="/customers"><span>Customers</span>{svg(MI["right"], 18)}</a>'
  f'<a class="mm-row" href="/changelog"><span>Changelog{badge(LATEST) if LATEST else ""}</span>{svg(MI["right"], 18)}</a>'
  f'<a class="mm-row last" href="/blog"><span>Blog</span>{svg(MI["right"], 18)}</a>'
  '</nav><div class="mm-bottom"><div class="mm-btns"><a class="mm-btn sec" href="/login">Log in</a><a class="mm-btn pri" href="/signup">Get started</a></div>'
  '<div class="mm-meta"><a class="mm-status" href="/status"><i></i><span>All systems operational</span></a>' + SWITCH.replace('class="theme-sw"', 'class="theme-sw pill"') + '</div></div></div><!--/mmenu-->')
BRAND_OLD = re.compile(r'<div class="brand">(?:<a [^>]*>)?<img src="/assets/(?:footer-mark|logo|footer-logo)\.svg"[^>]*>(?:</a>)?</div>')
BRAND_NEW = '<div class="brand"><a href="/" aria-label="Delivrie, by Surce Inc"><img src="/assets/footer-logo.svg" width="188" height="26" alt="Delivrie by Surce Inc"></a></div>'

def files():
    out = glob.glob(os.path.join(ROOT, "*.html"))
    for d in ("pages", "docs-static"):
        out += glob.glob(os.path.join(ROOT, d, "**", "*.html"), recursive=True)
    return out

def apply(s):
    s = re.sub(r'\s*<script data-theme-boot>.*?</script>(<style>html\[data-auth=in\].*?</style>)?', "", s, flags=re.S)
    s = re.sub(r'\s*<script>try\{var t=localStorage\.getItem\("dlv_theme"\).*?</script>', "", s, flags=re.S)  # older app.html boot
    s = re.sub(r'<meta name="theme-color" content="[^"]*">', '<meta name="theme-color" content="#ffffff">', s)
    s = s.replace('<meta charset="utf-8">', '<meta charset="utf-8">\n  ' + BOOT, 1)
    s = BRAND_OLD.sub(BRAND_NEW, s)
    s = re.sub(r'<div class="theme-sw" role="group" aria-label="Theme">.*?</div>(?=<a class="sys")', "", s, flags=re.S)
    s = s.replace('<span class="grow"></span><a class="sys"', '<span class="grow"></span>' + SWITCH + '<a class="sys"')
    s = re.sub(r'<div class="nav-theme" role="group".*?</div><span class="divider" aria-hidden="true"></span>', "", s, flags=re.S)
    s = re.sub(r'(<div class="spacer"></div>\s*)(<a class="nav-link keep" href="/login">)', lambda m: m[1] + NAV_TOGGLE + m[2], s, count=1)
    s = re.sub(r'<button type="button" class="m-theme".*?aria-label="Open menu">.*?</button>', "", s, flags=re.S)
    s = re.sub(r'<!--mmenu-->.*?<!--/mmenu-->', "", s, flags=re.S)
    s = re.sub(r'<div class="mmenu" id="mmenu".*?aria-label="Dark theme">.*?</button></div></div></div></div>(?:</div>)*', "", s, flags=re.S)  # pre-marker builds
    for key, (plain, dd) in NAV_DD.items():
        s = re.sub(rf'<!--dd-{key}-->.*?<!--/dd-{key}-->', lambda m: plain, s, flags=re.S)
        if '<nav class="nav-links"' in s: s = s.replace(plain, dd, 1)
    if '<header class="nav">' in s:
        s = re.sub(r'(<a class="btn-signup" href="/signup">[^<]*</a>)', lambda m: m[1] + MOBILE_ACTIONS, s, count=1)
        i = s.index('<header class="nav">'); j = s.index("</header>", i) + len("</header>")
        s = s[:j] + MOBILE_MENU + s[j:]
    return s

def main():
    n = 0
    for p in files():
        s = open(p, encoding="utf-8").read()
        t = apply(s)
        if t != s:
            open(p, "w", encoding="utf-8").write(t); n += 1
    print(f"theme: updated {n} pages")

if __name__ == "__main__":
    main()
