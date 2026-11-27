// node --experimental-strip-types --no-warnings supabase/functions/delivrie/hygiene_test.ts
import { reservedReason, verdict } from "./hygiene_rules.ts";
let n = 0;
const eq = (a: unknown, b: unknown, m: string) => { n++; if (JSON.stringify(a) !== JSON.stringify(b)) { console.error("FAIL", m, a, b); throw new Error(m); } };
const ok = { ok: true, why: null };
const mx = (...data: string[]) => ({ status: 0, answers: data.map((d) => ({ type: 15, data: d })) });
const ip = (has: boolean) => ({ status: 0, answers: has ? [{ type: 1, data: "1.2.3.4" }] : [] });

eq(reservedReason("cm-shots.test"), ".test isn't a real email domain", ".test");
eq(reservedReason("foo.example"), ".example isn't a real email domain", ".example");
eq(reservedReason("example.com"), "example.com is reserved for examples and can't receive email", "example.com");
eq(reservedReason("intranet.local"), ".local isn't a real email domain", ".local");
eq(reservedReason("localhost"), "localhost is reserved for examples and can't receive email", "localhost");
eq(reservedReason("gmail.com"), null, "gmail ok");
eq(reservedReason("delivrie.io"), null, "io ok");
eq(reservedReason("mail.testing.com"), null, "'test' inside a name is fine");

eq(verdict("gmail.com", mx("5 gmail-smtp-in.l.google.com."), null, null), ok, "has MX");
eq(verdict("gone.com", { status: 3, answers: [] }, null, null), { ok: false, why: "gone.com doesn't exist" }, "NXDOMAIN");
eq(verdict("nomail.com", mx("0 ."), null, null), { ok: false, why: "nomail.com doesn't accept email" }, "null MX");
eq(verdict("site.com", mx(), ip(true), ip(false)), ok, "no MX but A record (implicit MX)");
eq(verdict("parked.com", mx(), ip(false), ip(false)), { ok: false, why: "parked.com has no mail server" }, "no MX, no A/AAAA");
eq(verdict("x.com", null, null, null), ok, "lookup failed: don't block");
eq(verdict("x.com", { status: 2, answers: [] }, null, null), ok, "SERVFAIL: don't block");
eq(verdict("x.com", mx(), null, ip(false)), ok, "A lookup failed: don't block");
console.log(`hygiene tests passed (${n})`);
