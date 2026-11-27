// Pure rules for recipient screening (hygiene.ts), kept free of database imports so they can be unit-tested.
// deno-lint-ignore no-explicit-any
type Any = any;

const RESERVED_TLD = /\.(test|example|invalid|localhost|local|internal|lan|home|corp|onion|arpa|localdomain)$/i;
const RESERVED_DOMAIN = /^(example\.(com|net|org)|localhost)$/i;

export function reservedReason(domain: string): string | null {
  const d = domain.toLowerCase();
  if (RESERVED_DOMAIN.test(d)) return `${d} is reserved for examples and can't receive email`;
  const m = d.match(RESERVED_TLD);
  if (m) return `.${m[1].toLowerCase()} isn't a real email domain`;
  if (!d.includes(".")) return `${d} isn't a full domain`;
  return null;
}


export type Dns = { status: number; answers: Any[] } | null;

/** From DNS answers: can this domain receive email? A failed lookup (null) never blocks. */
export function verdict(d: string, mx: Dns, a: Dns, aaaa: Dns): { ok: boolean; why: string | null } {
  if (!mx) return { ok: true, why: null };
  if (mx.status === 3) return { ok: false, why: `${d} doesn't exist` };
  const records = mx.answers.filter((r: Any) => r.type === 15).map((r: Any) => String(r.data).trim());
  if (records.length) return records.every((r: string) => /^\d+\s+\.$/.test(r)) ? { ok: false, why: `${d} doesn't accept email` } : { ok: true, why: null };
  if (mx.status !== 0) return { ok: true, why: null }; // SERVFAIL and the like: unknown
  const has = (x: Dns) => !!x && x.answers.some((r: Any) => r.type === 1 || r.type === 28);
  if (a && aaaa && !has(a) && !has(aaaa)) return { ok: false, why: `${d} has no mail server` };
  return { ok: true, why: null };
}
