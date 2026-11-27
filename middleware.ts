// Vercel Routing Middleware: pages switched off in Admin → Website return the 404 page.
// Settings are cached for 30 seconds per edge instance. If they can't be loaded, pages stay on (fail open).
// Vercel runs this with Node's process.env available.
declare const process: { env: Record<string, string | undefined> };

export const config = {
  // Every page (for the page switches), plus the API (to pass the visitor's address and country along).
  matcher: ['/sitemap.xml', '/api/:path*', '/((?!api/|app/|assets/|docs-md/|_vercel/|.*\\.[a-z0-9]+$).*)'],
};

// Pages that can be switched off in Admin → Website.
const SWITCHABLE = [
  '/pricing', '/compare', '/vs', '/about', '/customers', '/careers', '/brand', '/changelog', '/blog', '/status',
  '/contact-sales', '/dpa', '/acceptable-use', '/cookies', '/subprocessors', '/security', '/resend-alternative', '/brevo-alternative',
];
const switchable = (path) => SWITCHABLE.some((p) => path === p || path.startsWith(p + '/'));

// Pages carry on to the static file. (Prices are in US dollars for everyone, so no currency cookie is set any more.)
function next() {
  return new Response(null, { headers: { 'x-middleware-next': '1' } });
}

// These pages can't be switched off: app directories and the support links reviewers check rely on them.
const ALWAYS_ON = new Set(['/', '/terms', '/privacy', '/support']);
const SOURCE = 'https://hnjejflinvaoxbduxeiu.supabase.co/functions/v1/delivrie/public/site?only=pages';
let cache = { at: 0, pages: {}, billing: null };

async function offPages() { return (await siteConfig()).pages; }

async function siteConfig() {
  if (Date.now() - cache.at < 30_000) return cache;
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 800);
    const r = await fetch(SOURCE, { signal: ctl.signal });
    clearTimeout(t);
    if (r.ok) { const j = await r.json(); cache = { at: Date.now(), pages: j.pages || {}, billing: j.billing || null }; }
    else cache.at = Date.now();
  } catch { cache.at = Date.now() - 20_000; } // retry in 10 seconds
  return cache;
}

// The sitemap lists every page; switched-off pages are removed from it here.
async function sitemap(url) {
  const [res, pages] = await Promise.all([fetch(new URL('/sitemap.xml?raw=1', url)), offPages()]);
  let xml = await res.text();
  const off = Object.keys(pages).filter((p) => pages[p] === false);
  if (off.length) xml = xml.replace(/  <url><loc>https:\/\/delivrie\.io([^<]*)<\/loc>.*?<\/url>\n/g, (m, p) => {
    const path = p || '/', section = '/' + path.split('/')[1];
    return off.includes(path) || off.includes(section) || ((path === '/compare' || path.startsWith('/vs/')) && off.includes('/pricing')) ? '' : m;
  });
  return new Response(xml, { headers: { 'content-type': 'application/xml; charset=utf-8', 'cache-control': 'public, max-age=300' } });
}

// API: pass the visitor's country (for billing details) and address (audit log, IP blocks) from Vercel, never from the
// client, signed with a shared secret (DLV_PROXY_SECRET) so requests that skip this middleware can't fake them.
// Vercel forwards only the request headers named in x-middleware-override-headers, so every header is listed:
// naming just the new one would drop Authorization and the rest.
// The rest of the API gets the visitor's own address the same way (x-dlv-client-ip): Supabase only sees Vercel's
// server, and the API needs the person's address for the audit log and for blocking banned accounts.
function billing(request) {
  const cc = (request.headers.get('x-vercel-ip-country') || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 2);
  const ip = (request.headers.get('x-real-ip') || (request.headers.get('x-forwarded-for') || '').split(',')[0] || '').trim().slice(0, 64);
  const fwd = new Headers(request.headers);
  fwd.delete('x-dlv-country');
  fwd.delete('x-dlv-proxy');
  fwd.delete('x-dlv-client-ip');
  if (cc) fwd.set('x-dlv-country', cc);
  if (ip) fwd.set('x-dlv-client-ip', ip);
  // Proves to the API that these came from here, not from the caller.
  const secret = (process.env.DLV_PROXY_SECRET || '').trim();
  if ((cc || ip) && secret) fwd.set('x-dlv-proxy', secret);
  const out = new Headers({ 'x-middleware-next': '1' });
  const names = [];
  fwd.forEach((value, name) => { names.push(name); out.set('x-middleware-request-' + name, value); });
  out.set('x-middleware-override-headers', names.join(','));
  return new Response(null, { headers: out });
}

export default async function middleware(request) {
  const url = new URL(request.url);
  if (url.pathname.startsWith('/api/')) {
    // Webhooks and cron calls pass through untouched: their signatures and secrets must arrive exactly as sent.
    if (/\/(webhook|webhooks\/[a-z]+|cron(\/[a-z]+)?|ses|status\/run)\/?$/.test(url.pathname)) return new Response(null, { headers: { 'x-middleware-next': '1' } });
    return billing(request);
  }
  if (url.pathname === '/sitemap.xml') return url.searchParams.has('raw') ? new Response(null, { headers: { 'x-middleware-next': '1' } }) : sitemap(url);
  let path = url.pathname.replace(/\/+$/, '') || '/';
  if (path === '/compare') path = '/pricing'; // the Compare view is part of Pricing
  if (!ALWAYS_ON.has(path) && switchable(path)) {
    const pages = await offPages();
    const section = '/' + path.split('/')[1];
    if (pages[path] === false || pages[section] === false) {
      const nf = await fetch(new URL('/404.html', url));
      return new Response(nf.body, { status: 404, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });
    }
  }
  return next();
}
