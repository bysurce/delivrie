// Recipient screening: addresses that can't receive mail never reach Amazon SES, so they can't count against the
// sending reputation every customer shares. Checked in deliver() for every email (API, SMTP, broadcasts,
// automations, forwards), after the team's own suppression list:
//   - platform-wide suppressions: an address that hard-bounced or complained for any team
//   - domains that can't exist (.test, .example, .invalid, .local, example.com …)
//   - domains with no mail server (no MX, a "null MX", or not registered), from DNS and cached
// A skipped address is reported on the email as "suppressed" with the reason; nothing is sent to it.
import { type Any, db } from "./util.ts";

import { reservedReason, verdict } from "./hygiene_rules.ts";
export { reservedReason };

type Dns = { status: number; answers: Any[] } | null; // same shape as in hygiene_rules.ts
async function dns(name: string, type: string): Promise<Dns> {
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 3000);
    const r = await fetch(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(name)}&type=${type}`, { headers: { accept: "application/dns-json" }, signal: ctl.signal });
    clearTimeout(t);
    if (!r.ok) return null;
    const j = await r.json();
    return { status: Number(j.Status), answers: j.Answer || [] };
  } catch { return null; } // unknown: don't block on a lookup failure
}

const memo = new Map<string, { ok: boolean; why: string | null; at: number }>();
const FRESH_OK = 24 * 3600e3, FRESH_BAD = 6 * 3600e3;

/** Whether a domain can receive email. Unknown (DNS unreachable) counts as yes, so a lookup problem never stops mail. */
export async function acceptsMail(domain: string): Promise<{ ok: boolean; why: string | null }> {
  const d = domain.toLowerCase();
  const reserved = reservedReason(d);
  if (reserved) return { ok: false, why: reserved };
  const m = memo.get(d);
  if (m && Date.now() - m.at < (m.ok ? FRESH_OK : FRESH_BAD)) return m;
  const { data: row } = await db.from("recipient_domains").select("accepts,detail,checked_at").eq("domain", d).maybeSingle();
  if (row && Date.now() - new Date(row.checked_at).getTime() < (row.accepts ? FRESH_OK : FRESH_BAD)) {
    const v = { ok: row.accepts, why: row.detail, at: Date.now() }; memo.set(d, v); return v;
  }
  let ok = true, why: string | null = null;
  const mx = await dns(d, "MX");
  if (mx) {
    // No MX: mail goes to the domain's own address, if it has one.
    const needA = mx.status === 0 && !mx.answers.some((r: Any) => r.type === 15);
    const [a, aaaa] = needA ? await Promise.all([dns(d, "A"), dns(d, "AAAA")]) : [null, null];
    ({ ok, why } = verdict(d, mx, a, aaaa));
    await db.from("recipient_domains").upsert({ domain: d, accepts: ok, detail: why, checked_at: new Date().toISOString() });
  }
  const v = { ok, why, at: Date.now() };
  memo.set(d, v);
  if (memo.size > 5000) memo.clear();
  return v;
}

/** Of these addresses, the ones to skip and why. Addresses are compared in lower case. */
export async function screenRecipients(addrs: string[]): Promise<Map<string, string>> {
  const drop = new Map<string, string>();
  const list = [...new Set(addrs.map((a) => a.toLowerCase()).filter(Boolean))];
  if (!list.length) return drop;
  const { data: g } = await db.from("global_suppressions").select("email,reason").in("email", list);
  for (const r of g || []) drop.set(r.email, r.reason === "complaint" ? "marked an earlier email as spam" : "bounced before (the mailbox doesn't exist)");
  const domains = [...new Set(list.filter((a) => !drop.has(a)).map((a) => a.split("@")[1] || ""))].filter(Boolean);
  const checks = await Promise.all(domains.map(async (d) => [d, await acceptsMail(d)] as const));
  const bad = new Map(checks.filter(([, c]) => !c.ok).map(([d, c]) => [d, c.why || "can't receive email"]));
  for (const a of list) { const why = bad.get(a.split("@")[1] || ""); if (why && !drop.has(a)) drop.set(a, why); }
  return drop;
}

export async function addGlobalSuppression(email: string, reason: "bounce" | "complaint", teamId: string) {
  const e = email.toLowerCase();
  if (e.endsWith("@simulator.amazonses.com") || e.endsWith("@test.delivrie.io")) return;
  await db.from("global_suppressions").upsert({ email: e, reason, team_id: teamId }, { onConflict: "email", ignoreDuplicates: reason === "bounce" });
}
