// Webhook signature verification. Delivrie signs every webhook with the Standard Webhooks scheme:
//   webhook-id, webhook-timestamp and webhook-signature headers, where the signature is
//   "v1,<base64 HMAC-SHA256 of `${id}.${timestamp}.${body}`>" keyed with the endpoint's whsec_ signing secret.
// Uses Web Crypto, so it works on Node 18+, Bun, Deno, Cloudflare Workers and Vercel Edge.
import type { WebhookEvent } from "./types.js";

export class WebhookVerificationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WebhookVerificationError";
  }
}

type HeaderBag = Headers | Record<string, string | string[] | undefined>;

export interface VerifyWebhookOptions {
  /** The request body exactly as received (a string or bytes). Verify before you parse it. */
  payload: string | Uint8Array;
  /** The request headers: a Headers object, Express/Node `req.headers`, or a plain object. */
  headers: HeaderBag;
  /** The endpoint's signing secret, starting with `whsec_`. */
  secret: string;
  /** Reject timestamps further than this from now, in seconds. Default 300 (5 minutes). */
  toleranceSeconds?: number;
}

function header(h: HeaderBag, name: string): string | undefined {
  if (typeof (h as Headers).get === "function") return (h as Headers).get(name) ?? undefined;
  const bag = h as Record<string, string | string[] | undefined>;
  const key = Object.keys(bag).find((k) => k.toLowerCase() === name);
  const v = key ? bag[key] : undefined;
  return Array.isArray(v) ? v[0] : v;
}

function fromBase64(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// Web Crypto is global everywhere except Node 18, where it lives on node:crypto. The specifier is a variable
// so edge bundlers don't try to resolve a Node built-in they never load.
async function getSubtle(): Promise<SubtleCrypto> {
  const g = (globalThis as { crypto?: Crypto }).crypto;
  if (g?.subtle) return g.subtle;
  const mod = "node:crypto";
  const nodeCrypto = await import(/* @vite-ignore */ /* webpackIgnore: true */ mod);
  return nodeCrypto.webcrypto.subtle as SubtleCrypto;
}

function equal(a: Uint8Array, b: Uint8Array) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

/**
 * Checks that a webhook request really came from Delivrie and isn't a replay, then returns the parsed event.
 * Rejects with `WebhookVerificationError` otherwise.
 */
export async function verifyWebhook<T = Record<string, unknown>>(opts: VerifyWebhookOptions): Promise<WebhookEvent<T>> {
  const { payload, headers, secret, toleranceSeconds = 300 } = opts;
  if (!secret) throw new WebhookVerificationError("Missing signing secret");
  const id = header(headers, "webhook-id");
  const timestamp = header(headers, "webhook-timestamp");
  const signatures = header(headers, "webhook-signature");
  if (!id || !timestamp || !signatures) throw new WebhookVerificationError("Missing webhook-id, webhook-timestamp or webhook-signature header");

  const ts = Number(timestamp);
  if (!Number.isInteger(ts)) throw new WebhookVerificationError("Invalid webhook-timestamp header");
  if (Math.abs(Math.floor(Date.now() / 1000) - ts) > toleranceSeconds) throw new WebhookVerificationError("Webhook timestamp is too old or in the future");

  const body = typeof payload === "string" ? payload : new TextDecoder().decode(payload);
  let keyBytes: Uint8Array;
  try { keyBytes = fromBase64(secret.startsWith("whsec_") ? secret.slice(6) : secret); } catch { throw new WebhookVerificationError("Signing secret isn't valid base64"); }
  const subtle = await getSubtle();
  const key = await subtle.importKey("raw", keyBytes as BufferSource, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const expected = new Uint8Array(await subtle.sign("HMAC", key, new TextEncoder().encode(`${id}.${ts}.${body}`)));

  // The header can carry several space-separated signatures (during secret rotation); any valid one is enough.
  const ok = signatures.split(" ").some((part) => {
    const [version, sig] = part.split(",", 2);
    if (version !== "v1" || !sig) return false;
    try { return equal(fromBase64(sig), expected); } catch { return false; }
  });
  if (!ok) throw new WebhookVerificationError("Signature doesn't match");

  try {
    return JSON.parse(body) as WebhookEvent<T>;
  } catch {
    throw new WebhookVerificationError("Body is not valid JSON");
  }
}
