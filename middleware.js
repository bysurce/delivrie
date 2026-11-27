// Vercel Routing Middleware: pages switched off in Admin → Website return the 404 page.
// Settings are cached for 30 seconds per edge instance. If they can't be loaded, pages stay on (fail open).
export const config = {
  // Every page (not assets, files or the API), so each visitor gets the country cookie below.
  matcher: ['/sitemap.xml', '/api/billing/:path*', '/((?!api/|app/|assets/|docs-md/|_vercel/|.*\\.[a-z0-9]+$).*)'],
};

// Pages that can be switched off in Admin → Website.
const SWITCHABLE = [
  '/pricing', '/compare', '/vs', '/about', '/customers', '/careers', '/brand', '/changelog', '/blog', '/status',
  '/contact-sales', '/dpa', '/acceptable-use', '/cookies', '/subprocessors', '/security', '/resend-alternative', '/brevo-alternative',
];
const switchable = (path) => SWITCHABLE.some((p) => path === p || path.startsWith(p + '/'));

// Pricing is shown in Naira to visitors in Nigeria and in US dollars everywhere else. Vercel tells us the visitor's
// country; we pass it to the page in a short-lived cookie that pricing.js, script.js and the billing page read.
// When one payment provider is switched off in Admin → Website → Payments, every visitor sees the other one's
// currency: the cookie is set as if they were in Nigeria (Naira) or outside it (dollars).
function next(request, billing) {
  let cc = (request.headers.get('x-vercel-ip-country') || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 2);
  if (billing && billing.paystack === false && billing.stripe !== false) cc = 'ZZ';
  else if (billing && billing.stripe === false && billing.paystack !== false) cc = 'NG';
  const headers = { 'x-middleware-next': '1' };
  if (cc) headers['set-cookie'] = `dlv_cc=${cc}; Path=/; Max-Age=86400; SameSite=Lax; Secure`;
  return new Response(null, { headers });
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

// Billing API: tell the billing function which country the request comes from, so Nigeria is offered Naira through
// Paystack and everywhere else US dollars through Stripe. The value always comes from Vercel, never the client,
// and is sent with a shared secret (DLV_PROXY_SECRET) so requests that skip this middleware can't fake it.
// Vercel forwards only the request headers named in x-middleware-override-headers, so every header is listed:
// naming just the new one would drop Authorization and the rest.
function billing(request) {
  const cc = (request.headers.get('x-vercel-ip-country') || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 2);
  const fwd = new Headers(request.headers);
  fwd.delete('x-dlv-country');
  fwd.delete('x-dlv-proxy');
  if (cc) fwd.set('x-dlv-country', cc);
  // Proves to the billing function that the country came from here, not from the caller.
  const secret = (process.env.DLV_PROXY_SECRET || '').trim();
  if (cc && secret) fwd.set('x-dlv-proxy', secret);
  const out = new Headers({ 'x-middleware-next': '1' });
  const names = [];
  fwd.forEach((value, name) => { names.push(name); out.set('x-middleware-request-' + name, value); });
  out.set('x-middleware-override-headers', names.join(','));
  return new Response(null, { headers: out });
}

export default async function middleware(request) {
  const url = new URL(request.url);
  if (url.pathname.startsWith('/api/billing/')) {
    // Webhooks and cron calls pass through untouched: their signatures and secrets must arrive exactly as sent.
    if (/\/(webhook|cron\/[a-z]+)\/?$/.test(url.pathname)) return new Response(null, { headers: { 'x-middleware-next': '1' } });
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
  return next(request, (await siteConfig()).billing);
}
