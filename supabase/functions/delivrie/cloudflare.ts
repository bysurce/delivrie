// One-click DNS setup for domains whose DNS is on Cloudflare.
//
// The customer creates a Cloudflare API token limited to "Zone: Read" and "DNS: Edit" (the dashboard links to a
// pre-filled Cloudflare page), pastes it once, and Delivrie adds the domain's records through Cloudflare's API.
// The token is used for this one request only: it is never stored, and request logs blank it out.
//
// Safety rules: records are only ever ADDED. Nothing that already exists is changed or deleted.
//   - Already there with the same value: left alone ("existing").
//   - SPF: a name can have only one SPF record. If another one is there, it's reported, not touched.
//   - DMARC: if the domain already has a DMARC policy, theirs is kept.
//   - MX: if the name already has a different MX record (a mail provider), it's reported, not touched, so setting up
//     Delivrie can never redirect someone's existing email.

type Any = any; // deno-lint-ignore no-explicit-any

const API = "https://api.cloudflare.com/client/v4";

export class CloudflareError extends Error {
  code: string;
  constructor(code: string, message: string) { super(message); this.code = code; }
}

export interface CfRecord { name: string; type: string; value: string; priority?: number | null; group?: string; record?: string }
export interface CfResult {
  zone: string;
  created: { type: string; name: string }[];
  existing: { type: string; name: string }[];
  skipped: { type: string; name: string; reason: string }[];
}

async function cf(token: string, method: string, path: string, body?: unknown): Promise<Any> {
  let r: Response;
  try {
    r = await fetch(API + path, { method, headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  } catch {
    throw new CloudflareError("cloudflare_unreachable", "Couldn't reach Cloudflare. Try again in a moment.");
  }
  const j = await r.json().catch(() => ({}));
  if (r.ok && j.success !== false) return j;
  const err = (j.errors || [])[0] || {};
  if (r.status === 401 || r.status === 403 || [1000, 9103, 9106, 9109, 10000, 6003].includes(Number(err.code))) {
    throw new CloudflareError("cloudflare_token_invalid", "Cloudflare didn't accept that token. Create one with \"Zone: Read\" and \"DNS: Edit\" for this domain, then paste it again.");
  }
  throw new CloudflareError("cloudflare_error", `Cloudflare said: ${String(err.message || `error ${r.status}`).slice(0, 200)}`);
}

const fqdnOf = (domain: string, name: string) => (!name || name === "@" ? domain : `${name}.${domain}`).toLowerCase();
const norm = (v: string) => String(v || "").trim().replace(/^"|"$/g, "").replace(/"\s*"/g, "").replace(/\.$/, "").toLowerCase();

// The Cloudflare zone a domain lives in: the domain itself or one of its parents (mail.acme.com → acme.com).
export async function findZone(token: string, domain: string): Promise<{ id: string; name: string }> {
  const labels = domain.toLowerCase().split(".");
  for (let i = 0; i <= labels.length - 2; i++) {
    const name = labels.slice(i).join(".");
    const j = await cf(token, "GET", `/zones?name=${encodeURIComponent(name)}&per_page=1`);
    const z = (j.result || [])[0];
    if (z?.id) return { id: z.id, name: z.name };
  }
  throw new CloudflareError("cloudflare_zone_not_found", `${domain} isn't in the Cloudflare account this token belongs to, or the token can't see it. Check the token's zone resources include this domain.`);
}

/** Adds the domain's missing records to Cloudflare. Never changes or deletes existing records. */
export async function cloudflareSetup(token: string, domain: string, records: CfRecord[]): Promise<CfResult> {
  token = String(token || "").trim();
  if (!token || token.length < 20 || /\s/.test(token)) throw new CloudflareError("validation_error", "Paste the Cloudflare API token (a long string of letters and numbers).");
  const zone = await findZone(token, domain);
  const out: CfResult = { zone: zone.name, created: [], existing: [], skipped: [] };

  for (const rec of records) {
    const type = rec.type.toUpperCase();
    if (type !== "TXT" && type !== "MX" && type !== "CNAME") continue;
    const name = fqdnOf(domain, rec.name);
    const label = { type, name };
    const want = norm(rec.value);
    const j = await cf(token, "GET", `/zones/${zone.id}/dns_records?type=${type}&name=${encodeURIComponent(name)}&per_page=100`);
    const there: Any[] = j.result || [];

    if (there.some((x) => norm(x.content) === want)) { out.existing.push(label); continue; }
    if (type === "TXT" && want.startsWith("v=spf1") && there.some((x) => norm(x.content).startsWith("v=spf1"))) {
      out.skipped.push({ ...label, reason: "This name already has an SPF record. A name can only have one, so merge ours into it by hand." });
      continue;
    }
    if (type === "TXT" && want.startsWith("v=dmarc1") && there.some((x) => norm(x.content).startsWith("v=dmarc1"))) {
      out.existing.push(label); // keep their existing DMARC policy
      continue;
    }
    if (type === "MX" && there.length) {
      out.skipped.push({ ...label, reason: "This name already has an MX record from another mail service. We didn't touch it so your existing email keeps working." });
      continue;
    }
    if (type === "CNAME" && there.length) {
      out.skipped.push({ ...label, reason: "This name already has a CNAME record pointing elsewhere." });
      continue;
    }
    // Some names can't hold a TXT or MX record because a CNAME is there already.
    if (type !== "CNAME") {
      const cn = await cf(token, "GET", `/zones/${zone.id}/dns_records?type=CNAME&name=${encodeURIComponent(name)}&per_page=1`);
      if ((cn.result || []).length) { out.skipped.push({ ...label, reason: "This name is a CNAME, which can't hold other records. Remove the CNAME or use a different subdomain." }); continue; }
    }
    await cf(token, "POST", `/zones/${zone.id}/dns_records`, {
      type, name, content: rec.value, ttl: 1, ...(type === "MX" ? { priority: rec.priority ?? 10 } : {}), ...(type === "CNAME" ? { proxied: false } : {}),
      comment: "Added by Delivrie",
    });
    out.created.push(label);
  }
  return out;
}
