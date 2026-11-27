// Small Stripe helpers with no I/O of their own, so they can be unit-tested (stripe_test.ts).

// Stripe's API takes form-encoded bodies with bracketed keys: { a: { b: [1] } } -> a[b][0]=1.
export function formEncode(obj: Record<string, unknown>): string {
  const out: string[] = [];
  const walk = (v: unknown, key: string) => {
    if (v === undefined) return;
    if (v === null) { out.push(`${encodeURIComponent(key)}=`); return; }
    if (Array.isArray(v)) { v.forEach((x, i) => walk(x, `${key}[${i}]`)); return; }
    if (typeof v === "object") { for (const [k, x] of Object.entries(v as Record<string, unknown>)) walk(x, `${key}[${k}]`); return; }
    out.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(v))}`);
  };
  for (const [k, v] of Object.entries(obj)) walk(v, k);
  return out.join("&");
}

const hex = (b: ArrayBuffer) => Array.from(new Uint8Array(b)).map((x) => x.toString(16).padStart(2, "0")).join("");

// Constant-time string comparison for signatures.
function same(a: string, b: string) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

export async function hmacHex(secret: string, payload: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return hex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload)));
}

// Verifies a Stripe-Signature header ("t=...,v1=...,v1=...") against the raw body. Rejects anything older than
// `toleranceSec` so a captured request can't be replayed later.
export async function verifyStripeSignature(raw: string, header: string, secret: string, toleranceSec = 300, nowSec = Math.floor(Date.now() / 1000)) {
  if (!secret || !header) return false;
  const parts = header.split(",").map((p) => p.trim().split("="));
  const t = Number(parts.find(([k]) => k === "t")?.[1]);
  const sigs = parts.filter(([k]) => k === "v1").map(([, v]) => v || "");
  if (!t || !sigs.length || Math.abs(nowSec - t) > toleranceSec) return false;
  const expected = await hmacHex(secret, `${t}.${raw}`);
  return sigs.some((s) => same(s, expected));
}

// Stripe subscription status -> what Delivrie shows and enforces.
export function subState(sub: { status: string; cancel_at_period_end?: boolean }) {
  if (sub.status === "canceled" || sub.status === "incomplete_expired") return "canceled";
  if (sub.status === "incomplete") return "incomplete";
  if (sub.status === "past_due" || sub.status === "unpaid") return "past_due";
  return sub.cancel_at_period_end ? "cancelling" : "active"; // active, trialing
}

// The period end moved from the subscription to its items in newer API versions; read either.
export function periodEnd(sub: Record<string, any>): string | null {
  const s = sub.current_period_end ?? sub.items?.data?.[0]?.current_period_end;
  return s ? new Date(s * 1000).toISOString() : null;
}

// One Stripe price per (kind, plan, interval, amount). Changing a price makes a new lookup key, so existing
// subscribers keep the price they signed up at.
export const priceKey = (kind: string, plan: string, interval: string, amount: number) => `delivrie_${kind}_${plan}_${interval}_${amount}`;

// Checkout's trial_end must be at least 48 hours away; a customer switching from an older plan closer to its renewal than
// that simply starts paying in USD now.
export function trialEndFor(paidUntil: string | null | undefined, nowMs = Date.now()) {
  if (!paidUntil) return null;
  const t = new Date(paidUntil).getTime();
  return t - nowMs > 49 * 3600e3 ? Math.floor(t / 1000) : null;
}

export const cardLabel = (c?: { brand?: string; last4?: string } | null) =>
  c?.last4 ? `${String(c.brand || "Card").replace(/^\w/, (x) => x.toUpperCase()).replace("Amex", "American Express")} •••• ${c.last4}` : null;
