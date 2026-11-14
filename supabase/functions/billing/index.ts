// Delivrie billing on Paystack: Pro/Scale (monthly or yearly), pay-as-you-go credits, month-end overage
// and the marketing add-on, in USD or NGN.
//
// Routes (served at https://delivrie.io/api/billing/* via a Vercel rewrite):
//   GET  /summary    plan, prices, subscription and invoices for the current team
//   POST /checkout   { plan, currency, interval, kind? } -> Paystack checkout URL (kind "marketing" for the add-on)
//   POST /coupon     { code, kind, plan?, interval?, currency, pack? | amount? } -> what the coupon takes off (preview)
//   POST /checkout and /topup also take { coupon }; without one, a discount assigned to the team applies itself.
//   POST /topup      { pack | amount, currency, method: card|bank_transfer|ussd|checkout, auto? } -> credits
//                    (saved card is charged directly; otherwise a Paystack checkout URL). /credits is an alias.
//   POST /settings   { auto_topup?: { enabled, pack, threshold }, alerts?: { p80, p100, credits_low } }
//   POST /cron/watch auto top-ups and usage alert emails (pg_cron every 15 minutes, x-cron-secret)
//   POST /details    { email, name, country, state, address, city, postal_code, tax_id_type, tax_id }
//   POST /cap        { amount } -> monthly overage spending cap (major units; empty clears it)
//   POST /cron/overage  month-end overage charges (pg_cron, x-cron-secret)
//   POST /verify     { reference } -> applies a completed payment (the webhook does the same)
//   POST /card       -> Paystack page to update the card on the subscription
//   POST /cancel     -> stop renewing; the plan stays until the paid period ends
//   POST /webhook    Paystack events (signed with the secret key)
//
// Secrets: PAYSTACK_SECRET_KEY (sk_test_… or sk_live_…), APP_URL, SYSTEM_FROM (alert emails), VAT_RATE (optional percent).
import { createClient } from "npm:@supabase/supabase-js@2.49.1";
import { bestAuto, type Coupon, couponLabel, couponProblem, discounted, nextPeriod, normCode } from "./coupons.ts";

// deno-lint-ignore no-explicit-any
type Any = any;
const env = (k: string) => Deno.env.get(k) ?? "";
const db = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false, autoRefreshToken: false } });
const PSK = env("PAYSTACK_SECRET_KEY");
const APP_URL = (env("APP_URL") || "https://delivrie.io").replace(/\/$/, "");

// Prices follow the pricing page. Amounts are in the smallest unit: cents for USD, kobo for NGN.
type Price = Record<string, number>;
export const PLANS: Record<string, { name: string; emails: number; monthly: Price; yearly: Price; overage: Price }> = {
  starter: { name: "Starter", emails: 20_000, monthly: { USD: 10_00, NGN: 10_000_00 }, yearly: { USD: 100_00, NGN: 100_000_00 }, overage: { USD: 45, NGN: 450_00 } },
  pro: { name: "Pro", emails: 60_000, monthly: { USD: 20_00, NGN: 27_000_00 }, yearly: { USD: 200_00, NGN: 270_000_00 }, overage: { USD: 45, NGN: 450_00 } },
  scale: { name: "Scale", emails: 100_000, monthly: { USD: 45_00, NGN: 45_000_00 }, yearly: { USD: 450_00, NGN: 450_000_00 }, overage: { USD: 40, NGN: 400_00 } },
};
// Marketing add-on, priced by contacts. "free" (Starter, 1,000 contacts) needs no subscription.
export const MARKETING: Record<string, { name: string; contacts: number; monthly: Price; yearly: Price; extra?: Price }> = {
  growth: { name: "Growth", contacts: 5_000, monthly: { USD: 20_00, NGN: 20_000_00 }, yearly: { USD: 200_00, NGN: 200_000_00 } },
  pro: { name: "Pro marketing", contacts: 10_000, monthly: { USD: 40_00, NGN: 40_000_00 }, yearly: { USD: 400_00, NGN: 400_000_00 }, extra: { USD: 3_50, NGN: 3_500_00 } },
};
// Pay-as-you-go credit packs: one credit sends one email. Credits never expire.
export const PACKS: { emails: number; price: Price; note?: string }[] = [
  { emails: 8_300, price: { USD: 5_00, NGN: 5_000_00 }, note: "Minimum" },
  { emails: 41_600, price: { USD: 25_00, NGN: 25_000_00 } },
  { emails: 172_400, price: { USD: 100_00, NGN: 100_000_00 }, note: "Save 3%" },
  { emails: 925_900, price: { USD: 500_00, NGN: 500_000_00 }, note: "Save 10%" },
];
// Credits are stored as emails. Their money value uses the pay-as-you-go rate: ₦600 / $0.60 per 1,000 emails.
const CREDIT_RATE: Price = { NGN: 60, USD: 0.06 }; // smallest unit per email
const creditValue = (emails: number, cur: string) => Math.floor(emails * CREDIT_RATE[cur]);
const emailsFor = (amount: number, cur: string) => Math.floor(amount / CREDIT_RATE[cur]);
const MIN_TOPUP: Price = { NGN: 5_000_00, USD: 5_00 };
const MAX_TOPUP: Price = { NGN: 10_000_000_00, USD: 10_000_00 };
const DEFAULT_THRESHOLD: Price = { NGN: 2_000_00, USD: 2_00 };
// VAT is off unless the VAT_RATE secret is set (a percent, e.g. 7.5). It applies to top-ups and overage.
const VAT_RATE = Math.max(0, Number(env("VAT_RATE") || 0)) || 0;
const vatOf = (amount: number) => Math.round(amount * VAT_RATE / 100);
// Plan limits, mirrored from the API's enforcement table.
const PLAN_LIMITS: Record<string, { domains: number; members: number; retention_days: number; day: number }> = {
  free: { domains: 1, members: 1, retention_days: 30, day: 133 },
  starter: { domains: 10, members: 5, retention_days: 30, day: 0 },
  pro: { domains: 10, members: 5, retention_days: 30, day: 0 },
  scale: { domains: 1000, members: 0, retention_days: 30, day: 0 },
};
const MARKETING_CONTACTS: Record<string, number> = { free: 1_000, growth: 5_000, pro: 10_000 };
const CURRENCIES = ["USD", "NGN"];
const INTERVALS = ["monthly", "yearly"];
const catalog = (kind: string) => (kind === "marketing" ? MARKETING : PLANS) as Record<string, { name: string; monthly: Price; yearly: Price }>;

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, content-type, x-team-id, x-client-info, apikey",
  "access-control-allow-methods": "GET, POST, OPTIONS",
};
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...CORS, "content-type": "application/json" } });
class HttpError extends Error { constructor(public status: number, message: string) { super(message); } }

// ---------------------------------------------------------------- Paystack
async function ps(method: string, path: string, body?: unknown): Promise<Any> {
  if (!PSK) throw new HttpError(503, "Payments aren't connected yet. Add PAYSTACK_SECRET_KEY to the edge function secrets.");
  const r = await fetch("https://api.paystack.co" + path, {
    method,
    headers: { authorization: `Bearer ${PSK}`, "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.status === false) {
    const msg = String(j.message || `Paystack returned ${r.status}`);
    if (/currency/i.test(msg)) throw new HttpError(400, "This currency isn't enabled on the Paystack account yet. Choose the other currency or contact support.");
    throw new HttpError(r.status >= 500 ? 502 : 400, msg);
  }
  return j.data;
}

async function setting(key: string) {
  const { data } = await db.from("system_settings").select("value").eq("key", key).maybeSingle();
  return (data?.value as string) || null;
}
async function setSetting(key: string, value: string) {
  await db.from("system_settings").upsert({ key, value });
}

// One Paystack plan per (kind, plan, interval, currency, price). Changing a price creates a new Paystack plan.
// A "forever" coupon passes its percentage: the subscription then renews at the discounted price.
async function planCode(kind: string, plan: string, interval: string, currency: string, percentOff = 0) {
  const p = catalog(kind)[plan];
  const full = p[interval as "monthly" | "yearly"][currency];
  const amount = percentOff ? discounted(full, percentOff, true) : full;
  const key = `paystack_plan:${PSK.startsWith("sk_live") ? "live" : "test"}:${kind}:${plan}:${interval}:${currency}:${amount}`;
  const existing = await setting(key);
  if (existing) return existing;
  const d = await ps("POST", "/plan", {
    name: `Delivrie ${p.name} ${interval === "yearly" ? "yearly" : "monthly"} (${currency})${percentOff ? ` ${percentOff}% off` : ""}`,
    interval: interval === "yearly" ? "annually" : "monthly",
    amount,
    currency,
    description: kind === "marketing" ? `Marketing up to ${(p as Any).contacts.toLocaleString("en-US")} contacts` : `${(p as Any).emails.toLocaleString("en-US")} emails a month`,
  });
  await setSetting(key, d.plan_code);
  await setSetting(`paystack_code:${d.plan_code}`, `${kind}:${plan}:${interval}:${currency}`);
  return d.plan_code as string;
}
async function planFromCode(code?: string | null): Promise<{ kind: string; plan: string; interval: string; currency: string } | null> {
  if (!code) return null;
  const v = await setting(`paystack_code:${code}`);
  if (!v) return null;
  const parts = v.split(":");
  if (parts.length === 2) return { kind: "transactional", plan: parts[0], interval: "monthly", currency: parts[1] };
  const [kind, plan, interval, currency] = parts;
  return { kind, plan, interval, currency };
}

// ---------------------------------------------------------------- coupons
async function teamCouponIds(teamId: string) {
  const { data } = await db.from("coupon_redemptions").select("coupon_id").eq("team_id", teamId);
  return new Set<string>((data || []).map((r: Any) => r.coupon_id as string));
}
// The coupon for this payment: the typed code (must be valid, or this throws), else the team's best assigned discount.
async function resolveCoupon(teamId: string, code: unknown, use: { kind: "transactional" | "marketing" | "credits"; plan?: string; interval?: string }): Promise<Coupon | null> {
  const typed = normCode(code);
  const used = await teamCouponIds(teamId);
  if (typed) {
    const { data } = await db.from("coupons").select("*").eq("code", typed).maybeSingle();
    const problem = couponProblem(data as Coupon | null, { ...use, teamId, usedByTeam: !!data && used.has((data as Coupon).id) });
    if (problem) throw new HttpError(400, problem);
    return data as Coupon;
  }
  const { data } = await db.from("coupons").select("*").eq("team_id", teamId).eq("auto_apply", true).eq("active", true);
  return bestAuto((data || []) as Coupon[], used, { ...use, teamId });
}
const couponMeta = (c: Coupon | null, before: number, after: number) =>
  c ? { coupon_id: c.id, coupon_code: c.code, percent_off: c.percent_off, coupon_duration: c.duration, amount_before: before, amount_after: after } : {};

// ---------------------------------------------------------------- auth
async function auth(req: Request) {
  const jwt = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const teamId = req.headers.get("x-team-id") || "";
  if (!jwt || !teamId) throw new HttpError(401, "Log in again to manage billing.");
  const { data, error } = await db.auth.getUser(jwt);
  if (error || !data.user) throw new HttpError(401, "Your session has expired. Log in again.");
  const { data: m } = await db.from("team_members").select("role").eq("team_id", teamId).eq("user_id", data.user.id).maybeSingle();
  if (!m) throw new HttpError(403, "You're not a member of this team.");
  return { user: data.user, teamId, admin: m.role === "admin" };
}
const requireAdmin = (a: { admin: boolean }) => { if (!a.admin) throw new HttpError(403, "Only team admins can change billing."); };

async function team(teamId: string) {
  const { data } = await db.from("teams").select("id,name,plan_transactional,plan_marketing,credits,billing,created_at").eq("id", teamId).single();
  return data as Any;
}
async function saveBilling(teamId: string, patch: Record<string, unknown>, plan?: string) {
  const t = await team(teamId);
  const billing = { ...(t.billing || {}), ...patch, updated_at: new Date().toISOString() };
  const update: Any = { billing };
  if (plan) update.plan_transactional = plan;
  await db.from("teams").update(update).eq("id", teamId);
}

// ---------------------------------------------------------------- applying payments
const cardOf = (a: Any) => a?.last4 ? `${(a.brand || a.card_type || "Card").trim().replace(/^\w/, (c: string) => c.toUpperCase())} •••• ${a.last4}` : null;

async function teamForCustomer(customerCode: string, planCodeHint?: string) {
  const { data } = await db.from("teams").select("id,billing").eq("billing->>customer_code", customerCode);
  const rows = data || [];
  return (rows.find((r: Any) => planCodeHint && r.billing?.plan_code === planCodeHint) || rows[0])?.id as string | undefined;
}

const parseMeta = (m: Any) => typeof m === "string" ? (() => { try { return JSON.parse(m); } catch { return {}; } })() : (m || {});

async function recordInvoice(teamId: string, tx: Any, kind: string, plan: string | null, description: string) {
  const { data: prev } = await db.from("billing_invoices").select("status").eq("reference", tx.reference).maybeSingle();
  await db.from("billing_invoices").upsert({
    team_id: teamId, reference: tx.reference, plan, kind, description, amount: tx.amount, currency: tx.currency,
    status: tx.status === "success" ? "success" : "failed", card: cardOf(tx.authorization),
    paid_at: tx.paid_at || tx.paidAt || new Date().toISOString(),
  }, { onConflict: "reference" });
  return prev?.status === "success"; // already applied before
}

// Keep the reusable card so month-end overage can be charged without the customer present.
function cardPatch(tx: Any, old: Any) {
  const a = tx.authorization || {};
  return {
    card: cardOf(a) || old.card,
    ...(a.reusable && a.authorization_code ? { authorization_code: a.authorization_code } : {}),
    customer_code: tx.customer?.customer_code || old.customer_code, customer_id: tx.customer?.id || old.customer_id, email: tx.customer?.email || old.email,
  };
}

async function findSub(customerId: number | undefined, code: string | null) {
  if (!customerId || !code) return null;
  try {
    const subs: Any[] = await ps("GET", `/subscription?customer=${customerId}&perPage=50`);
    return subs.filter((s) => s.plan?.plan_code === code && s.status === "active").sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))[0] || null;
  } catch (e) { console.error("subscription lookup failed", e); return null; }
}

// Count a coupon once per payment. Returns false when this payment was already counted (a repeated webhook or /verify).
async function redeem(meta: Any, teamId: string, tx: Any, kind: string, plan: string | null) {
  if (!meta.coupon_id || tx.status !== "success") return false;
  const { data, error } = await db.rpc("redeem_coupon", {
    p_coupon: meta.coupon_id, p_team: teamId, p_reference: tx.reference, p_kind: kind, p_plan: plan, p_currency: tx.currency || meta.currency,
    p_before: Number(meta.amount_before || 0), p_after: Number(meta.amount_after || tx.amount || 0),
  });
  if (error) { console.error("coupon redemption failed", error); return true; }
  if (data) return true;
  const { data: same } = await db.from("coupon_redemptions").select("id").eq("reference", tx.reference).maybeSingle();
  return !same; // false only when this exact payment was already counted
}

// A first-payment-only coupon is paid as a one-off charge; this starts the full-price subscription from the next period.
async function startFullPriceSub(tx: Any, kind: string, plan: string, interval: string, currency: string) {
  const fullCode = await planCode(kind, plan, interval, currency);
  const start = nextPeriod(new Date(tx.paid_at || tx.paidAt || Date.now()), interval);
  const a = tx.authorization || {};
  try {
    if (!a.reusable || !a.authorization_code) throw new Error("card can't be charged again");
    const s = await ps("POST", "/subscription", { customer: tx.customer?.customer_code || tx.customer?.email, plan: fullCode, authorization: a.authorization_code, start_date: start.toISOString() });
    return { plan_code: fullCode, subscription_code: s.subscription_code, email_token: s.email_token, next_payment_date: s.next_payment_date || start.toISOString() };
  } catch (e) {
    // The paid period still counts; the plan simply ends then unless they subscribe again.
    console.error("full-price subscription after coupon failed", e);
    return { plan_code: fullCode, next_payment_date: start.toISOString(), status: "cancelling", cancel_at: start.toISOString() };
  }
}

async function applyCharge(tx: Any) {
  const code = tx.plan_object?.plan_code || tx.plan?.plan_code || (typeof tx.plan === "string" && tx.plan ? tx.plan : null);
  const meta = parseMeta(tx.metadata);
  const fromCode = await planFromCode(code);
  const kind = meta.kind || fromCode?.kind || "transactional";
  const teamId = meta.team_id || (tx.customer?.customer_code ? await teamForCustomer(tx.customer.customer_code, code) : undefined);
  if (!teamId) return null;
  const before = await team(teamId);
  const old = before.billing || {};

  if (kind === "credits") {
    const emails = Number(meta.emails || 0);
    const done = await recordInvoice(teamId, tx, "credits", null, `${meta.auto ? "Auto top-up" : "Credit top-up"} · ${emails.toLocaleString("en-US")} emails${meta.coupon_code ? ` · ${meta.coupon_code} (${meta.percent_off}% off)` : ""}`);
    if (tx.status === "success" && !done && emails > 0) {
      await redeem(meta, teamId, tx, "credits", null);
      await db.rpc("add_credits", { p_team: teamId, p_n: emails });
      await saveBilling(teamId, { ...cardPatch(tx, old), provider: old.provider || "paystack", currency: old.currency || tx.currency });
    }
    return teamId;
  }
  if (kind === "overage") {
    await recordInvoice(teamId, tx, "overage", before.plan_transactional, meta.description || "Overage");
    return teamId;
  }

  const plan = meta.plan || fromCode?.plan;
  const interval = meta.interval || fromCode?.interval || "monthly";
  const currency = tx.currency || meta.currency || fromCode?.currency;
  if (!plan || !catalog(kind)[plan]) return null;
  const label = `${catalog(kind)[plan].name} · ${interval}${meta.coupon_code ? ` · ${meta.coupon_code} (${meta.percent_off}% off)` : ""}`;
  await recordInvoice(teamId, tx, kind, plan, label);
  if (tx.status !== "success") return teamId;
  const fresh = await redeem(meta, teamId, tx, kind, plan);
  const discount = meta.coupon_id ? { coupon_id: meta.coupon_id, code: meta.coupon_code, percent_off: Number(meta.percent_off), duration: meta.coupon_duration } : null;
  let sub: Any = null, extra: Any = {};
  if (meta.coupon_once && !code) {
    // One-off discounted charge: only the first handler of this payment creates the follow-on subscription.
    if (!fresh) return teamId;
    extra = await startFullPriceSub(tx, kind, plan, interval, currency);
    sub = extra.subscription_code ? extra : null;
  } else {
    sub = await findSub(tx.customer?.id, code);
  }

  if (kind === "marketing") {
    const m = old.marketing || {};
    const patch = { plan, interval, currency, plan_code: code, status: "active", cancel_at: null, ...(sub ? { subscription_code: sub.subscription_code, email_token: sub.email_token, next_payment_date: sub.next_payment_date } : {}), ...extra, discount: discount?.duration === "forever" ? discount : (code && m.plan_code === code ? m.discount ?? null : null) };
    if (m.subscription_code && sub && m.subscription_code !== sub.subscription_code && m.email_token) {
      await ps("POST", "/subscription/disable", { code: m.subscription_code, token: m.email_token }).catch((e) => console.error("old marketing subscription disable failed", e));
    }
    await saveBilling(teamId, { ...cardPatch(tx, old), provider: "paystack", marketing: { ...m, ...patch } });
    await db.from("teams").update({ plan_marketing: plan }).eq("id", teamId);
    return teamId;
  }

  const patch: Any = {
    ...cardPatch(tx, old), provider: "paystack", plan, interval, currency, plan_code: code, status: "active", cancel_at: null,
    last_payment_at: tx.paid_at || new Date().toISOString(),
    plan_since: before.plan_transactional === plan && old.plan_since ? old.plan_since : (tx.paid_at || new Date().toISOString()),
    ...(sub ? { subscription_code: sub.subscription_code, email_token: sub.email_token, next_payment_date: sub.next_payment_date } : {}),
    ...extra,
    // Renewals of a "forever" coupon stay discounted; anything else renews at full price.
    discount: discount?.duration === "forever" ? discount : (code && old.plan_code === code ? old.discount ?? null : null),
  };
  // Switching plans: stop the previous subscription so the customer isn't charged twice.
  if (old.subscription_code && patch.subscription_code && old.subscription_code !== patch.subscription_code && old.email_token) {
    await ps("POST", "/subscription/disable", { code: old.subscription_code, token: old.email_token }).catch((e) => console.error("old subscription disable failed", e));
  }
  await saveBilling(teamId, patch, plan);
  return teamId;
}

// ---------------------------------------------------------------- usage
const monthStart = (d = new Date(), back = 0) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - back, 1));
async function usage(teamId: string, from: Date, to = new Date()) {
  const { data } = await db.rpc("team_usage", { p_team: teamId, p_from: from.toISOString(), p_to: to.toISOString() });
  return Number(data || 0);
}
const overageCost = (plan: string, used: number, cur: string) => {
  const p = PLANS[plan];
  if (!p) return { over: 0, cost: 0 };
  const over = Math.max(0, used - p.emails);
  return { over, cost: Math.ceil(over / 1000) * p.overage[cur] };
};

// ---------------------------------------------------------------- handlers
async function summary(teamId: string, admin: boolean) {
  const t = await team(teamId);
  const { data: invoices } = await db.from("billing_invoices").select("reference,plan,kind,description,amount,currency,status,card,paid_at").eq("team_id", teamId).order("created_at", { ascending: false }).limit(50);
  const b = t.billing || {};
  const plan = t.plan_transactional || "free";
  const now = new Date();
  const from = monthStart(now), to = monthStart(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)));
  const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const cur = b.currency === "USD" ? "USD" : b.currency === "NGN" ? "NGN" : (b.details?.country === "Nigeria" ? "NGN" : "USD");
  const [used, today, daily, contactsQ, domainsQ, membersQ] = await Promise.all([
    usage(teamId, from),
    usage(teamId, dayStart),
    db.rpc("team_daily_usage", { p_team: teamId, p_from: from.toISOString(), p_to: to.toISOString() }).then((r) => r.data || []),
    db.from("contacts").select("id", { count: "exact", head: true }).eq("team_id", teamId),
    db.from("domains").select("id", { count: "exact", head: true }).eq("team_id", teamId),
    db.from("team_members").select("user_id", { count: "exact", head: true }).eq("team_id", teamId),
  ]);
  const credits = Number(t.credits || 0);
  const value = creditValue(credits, cur);
  const ov = overageCost(plan, used, cur);
  const L = PLAN_LIMITS[plan] || PLAN_LIMITS.free;
  // when did this plan start: saved on payment, else the first successful invoice for it
  const firstPlanInvoice = (invoices || []).filter((i: Any) => i.status === "success" && i.plan === plan && i.kind !== "credits" && i.kind !== "overage").map((i: Any) => i.paid_at).sort()[0];
  const sub = b.provider === "paystack" && b.plan && b.plan !== "free" ? {
    plan: b.plan, interval: b.interval || "monthly", currency: b.currency, status: b.status, card: b.card || null,
    next_payment_date: b.next_payment_date || null, cancel_at: b.cancel_at || null, can_manage: !!b.subscription_code,
    discount: b.discount?.percent_off ? { code: b.discount.code, percent_off: b.discount.percent_off } : null,
  } : null;
  // Next invoice estimate: renewal (if it falls before the month ends) plus projected overage, less credits.
  const daysIn = Math.round((to.getTime() - from.getTime()) / 864e5), dayN = Math.min(daysIn, Math.floor((now.getTime() - from.getTime()) / 864e5) + 1);
  const projected = dayN ? Math.round(used / dayN * daysIn) : used;
  const projOver = overageCost(plan, projected, cur);
  const p = PLANS[plan];
  const subCur = sub?.currency === "USD" ? "USD" : "NGN";
  const fullRenewal = p && sub && sub.status === "active" ? p[(sub.interval === "yearly" ? "yearly" : "monthly") as "monthly"][subCur] : 0;
  const renewal = fullRenewal && sub?.discount ? discounted(fullRenewal, sub.discount.percent_off, true) : fullRenewal;
  // Discounts assigned to this team that apply themselves at checkout.
  const usedCoupons = admin ? await teamCouponIds(teamId) : new Set<string>();
  const { data: assigned } = admin ? await db.from("coupons").select("*").eq("team_id", teamId).eq("auto_apply", true).eq("active", true) : { data: [] };
  const discounts = ((assigned || []) as Coupon[]).filter((c) => !usedCoupons.has(c.id) && !(c.expires_at && new Date(c.expires_at) <= now) && !(c.max_redemptions != null && c.redemptions >= c.max_redemptions))
    .map((c) => ({ code: c.code, label: couponLabel(c), percent_off: c.percent_off, applies_to: c.applies_to, duration: c.duration, plans: c.plans, intervals: c.intervals, expires_at: c.expires_at, description: c.description }));
  const creditsApplied = Math.min(value, projOver.cost);
  const vat = vatOf(projOver.cost - creditsApplied);
  return {
    plan,
    plan_marketing: t.plan_marketing || "free",
    admin,
    payments_ready: !!PSK,
    mode: PSK.startsWith("sk_live") ? "live" : PSK ? "test" : null,
    currencies: CURRENCIES,
    currency: cur,
    plans: Object.entries(PLANS).map(([id, p]) => ({ id, ...p })),
    marketing: Object.entries(MARKETING).map(([id, p]) => ({ id, ...p })),
    packs: PACKS,
    credits,
    credit_value: value,
    credit_rate: CREDIT_RATE,
    min_topup: MIN_TOPUP,
    vat_rate: VAT_RATE,
    usage: { month: used, today, included: PLANS[plan]?.emails ?? (plan === "free" ? 4000 : 0), day_limit: L.day, contacts: contactsQ.count || 0, ...ov, currency: cur },
    period: { start: from.toISOString(), end: new Date(to.getTime() - 1).toISOString(), day: dayN, days: daysIn, projected, projected_over: projOver.over, projected_cost: projOver.cost },
    daily: (daily as Any[]).map((r) => ({ day: r.day, n: Number(r.n) })),
    limits: {
      domains: { used: domainsQ.count || 0, limit: L.domains },
      members: { used: membersQ.count || 0, limit: L.members },
      contacts: { used: contactsQ.count || 0, limit: MARKETING_CONTACTS[t.plan_marketing || "free"] || 0 },
      retention_days: L.retention_days,
    },
    next_invoice: { date: sub?.next_payment_date && new Date(sub.next_payment_date) < to ? sub.next_payment_date : to.toISOString(), plan: renewal, plan_currency: subCur, overage: projOver.cost, overage_units: Math.ceil(projOver.over / 1000), credits: creditsApplied, vat, total: renewal + projOver.cost - creditsApplied + vat, currency: cur },
    customer_since: t.created_at,
    plan_since: b.plan_since || firstPlanInvoice || (plan === "free" ? t.created_at : null),
    auto_topup: { enabled: false, pack: 1, threshold: DEFAULT_THRESHOLD[cur], ...(b.auto_topup || {}) },
    alerts: { p80: true, p100: true, credits_low: true, ...(b.alerts || {}) },
    spend_cap: b.spend_cap || null,
    card: b.card || null,
    can_charge_card: !!b.authorization_code,
    subscription: sub,
    marketing_subscription: b.marketing?.plan ? { ...b.marketing, email_token: undefined, subscription_code: undefined, can_manage: !!b.marketing.subscription_code } : null,
    details: b.details || {},
    invoices: invoices || [],
    discounts,
  };
}

// Charge the saved card for credits (used by auto top-up and "Pay with card" in the top-up dialog).
async function chargeCredits(teamId: string, emails: number, amount: number, currency: string, auto: boolean, coupon: Coupon | null = null, fullAmount = amount) {
  const t = await team(teamId);
  const b = t.billing || {};
  if (!b.authorization_code || !b.email) throw new HttpError(400, "There's no saved card. Pay with checkout instead.");
  const vat = vatOf(amount);
  const reference = `top_${auto ? "auto_" : ""}${teamId.slice(0, 8)}_${Date.now().toString(36)}`;
  const metadata = { team_id: teamId, kind: "credits", emails, currency, vat, auto, ...couponMeta(coupon, fullAmount, amount) };
  const tx = await ps("POST", "/transaction/charge_authorization", { email: b.email, amount: amount + vat, currency, authorization_code: b.authorization_code, reference, metadata });
  await applyCharge({ ...tx, reference, currency, amount: amount + vat, metadata });
  return tx.status as string;
}

// Every 15 minutes: auto top-ups and usage alerts.
async function watchRun() {
  const { data: teams } = await db.from("teams").select("id,name,plan_transactional,credits,billing");
  const out: Any[] = [];
  const now = new Date();
  const tag = `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  for (const t of teams || []) {
    const b = t.billing || {};
    const cur = b.currency === "USD" ? "USD" : "NGN";
    const value = creditValue(Number(t.credits || 0), cur);
    // auto top-up
    const at = b.auto_topup || {};
    if (at.enabled && b.authorization_code && value < Number(at.threshold || DEFAULT_THRESHOLD[cur])) {
      const last = at.last_attempt ? new Date(at.last_attempt).getTime() : 0;
      if (now.getTime() - last > 3600e3) {
        const pack = PACKS[Number(at.pack ?? 1)] || PACKS[1];
        await saveBilling(t.id, { auto_topup: { ...at, last_attempt: now.toISOString() } });
        try { out.push({ team: t.id, topup: await chargeCredits(t.id, pack.emails, pack.price[cur], cur, true) }); }
        catch (e) { out.push({ team: t.id, topup: "error", error: String((e as Error).message) }); }
      }
    }
    // alerts, at most once per month per kind
    const al = { p80: true, p100: true, credits_low: true, ...(b.alerts || {}) };
    const sent: Any = b.alerts_sent?.month === tag ? b.alerts_sent : { month: tag, kinds: [] };
    const fire: string[] = [];
    const p = PLANS[t.plan_transactional];
    if (p && (al.p80 || al.p100)) {
      const used = await usage(t.id, monthStart());
      if (al.p100 && used >= p.emails && !sent.kinds.includes("p100")) fire.push("p100");
      else if (al.p80 && used >= p.emails * 0.8 && !sent.kinds.includes("p80")) fire.push("p80");
      if (fire.length) sent.used = used;
    }
    const lowAt = Number(at.threshold || DEFAULT_THRESHOLD[cur]);
    if (al.credits_low && Number(t.credits || 0) > 0 && value < lowAt && !at.enabled && !sent.kinds.includes("credits_low")) fire.push("credits_low");
    if (!fire.length) continue;
    const to = b.details?.email || b.email;
    const from = env("SYSTEM_FROM");
    if (to && from) {
      const money = (n: number) => new Intl.NumberFormat(cur === "NGN" ? "en-NG" : "en-US", { style: "currency", currency: cur, maximumFractionDigits: 0 }).format(n / 100);
      for (const k of fire) {
        const subject = k === "credits_low" ? `${t.name}: Delivrie credits are running low` : `${t.name}: you've used ${k === "p100" ? "all" : "80%"} of this month's ${p!.emails.toLocaleString("en-US")} emails`;
        const text = k === "credits_low" ? `You have ${money(value)} of credit left (about ${Number(t.credits).toLocaleString("en-US")} emails). Top up or turn on auto top-up: ${APP_URL}/billing/credits`
          : k === "p100" ? `Your team has sent ${Number(sent.used).toLocaleString("en-US")} emails this month. Sending continues; extra emails are billed per 1,000 at month end, paid from credits first. Details: ${APP_URL}/billing`
          : `Your team has sent ${Number(sent.used).toLocaleString("en-US")} of ${p!.emails.toLocaleString("en-US")} emails this month. Details: ${APP_URL}/billing`;
        await db.from("emails").insert({ team_id: t.id, from, to: [to], subject, text, html: `<p>${text.replace(/(https:\/\/\S+)/g, '<a href="$1">$1</a>')}</p>`, status: "queued", tags: [{ name: "system", value: "billing_alert" }] });
      }
    }
    await saveBilling(t.id, { alerts_sent: { ...sent, kinds: [...sent.kinds, ...fire] } });
    out.push({ team: t.id, alerts: fire, emailed: !!(to && from) });
  }
  return { checked: (teams || []).length, results: out };
}

async function overageRun() {
  // Bill last month's overage for every paid team with a saved card. Safe to re-run: references are per team-month.
  const from = monthStart(new Date(), 1), to = monthStart();
  const tag = `${from.getUTCFullYear()}${String(from.getUTCMonth() + 1).padStart(2, "0")}`;
  const { data: teams } = await db.from("teams").select("id,name,plan_transactional,plan_marketing,credits,billing").in("plan_transactional", Object.keys(PLANS));
  const results: Any[] = [];
  for (const t of teams || []) {
    const b = t.billing || {};
    const cur = b.currency === "USD" ? "USD" : "NGN";
    const used = await usage(t.id, from, to);
    const { over, cost } = overageCost(t.plan_transactional, used, cur);
    let amount = cost;
    const lines = over ? [`${over.toLocaleString("en-US")} emails over ${PLANS[t.plan_transactional].name}`] : [];
    if (t.plan_marketing === "pro") {
      const { count } = await db.from("contacts").select("id", { count: "exact", head: true }).eq("team_id", t.id);
      const extra = Math.max(0, (count || 0) - MARKETING.pro.contacts);
      if (extra) { amount += Math.ceil(extra / 1000) * MARKETING.pro.extra![cur]; lines.push(`${extra.toLocaleString("en-US")} extra contacts`); }
    }
    if (!amount) continue;
    const reference = `ovg_${tag}_${t.id.slice(0, 8)}`;
    const { data: done } = await db.from("billing_invoices").select("status").eq("reference", reference).maybeSingle();
    if (done?.status === "success") continue;
    // Credits pay first. Recorded once per team-month so a re-run never takes credits twice.
    const creditRef = `ovc_${tag}_${t.id.slice(0, 8)}`;
    const { data: paid } = await db.from("billing_invoices").select("amount").eq("reference", creditRef).maybeSingle();
    let fromCredits = Number(paid?.amount || 0);
    if (!paid && Number(t.credits || 0) > 0) {
      const apply = Math.min(creditValue(Number(t.credits), cur), amount);
      const n = Math.min(Number(t.credits), Math.ceil(apply / CREDIT_RATE[cur]));
      if (apply > 0 && n > 0) {
        const { data: ok } = await db.rpc("use_credits", { p_team: t.id, p_n: n });
        if (ok) {
          fromCredits = apply;
          await db.from("billing_invoices").upsert({ team_id: t.id, reference: creditRef, kind: "overage", plan: t.plan_transactional, description: `${lines.join(" · ")} · paid from credits (${n.toLocaleString("en-US")} emails)`, amount: apply, currency: cur, status: "success", paid_at: new Date().toISOString() }, { onConflict: "reference" });
        }
      }
    }
    amount = Math.max(0, amount - fromCredits);
    if (!amount) { results.push({ team: t.id, credits: fromCredits, status: "paid_from_credits" }); continue; }
    if (fromCredits) lines.push(`credits applied`);
    amount += vatOf(amount);
    if (VAT_RATE) lines.push(`incl. VAT ${VAT_RATE}%`);
    if (!b.authorization_code || !b.email) {
      await db.from("billing_invoices").upsert({ team_id: t.id, reference, kind: "overage", plan: t.plan_transactional, description: lines.join(" · ") + " (no saved card)", amount, currency: cur, status: "failed" }, { onConflict: "reference" });
      results.push({ team: t.id, amount, status: "no_card" });
      continue;
    }
    try {
      const tx = await ps("POST", "/transaction/charge_authorization", {
        email: b.email, amount, currency: cur, authorization_code: b.authorization_code, reference,
        metadata: { team_id: t.id, kind: "overage", description: lines.join(" · ") },
      });
      await recordInvoice(t.id, { ...tx, reference, currency: cur, amount }, "overage", t.plan_transactional, lines.join(" · "));
      if (tx.status !== "success") await saveBilling(t.id, { status: "past_due" });
      results.push({ team: t.id, amount, status: tx.status });
    } catch (e) {
      results.push({ team: t.id, amount, status: "error", error: String((e as Error).message) });
    }
  }
  return { month: tag, charged: results };
}

// What a checkout or top-up costs, with any coupon applied. Throws with a customer-facing message when the choice is invalid.
async function quote(teamId: string, body: Any) {
  const currency = String(body.currency || "").toUpperCase();
  if (!CURRENCIES.includes(currency)) throw new HttpError(400, "Choose USD or NGN.");
  if (body.kind === "credits") {
    let amount: number, emails: number;
    if (body.pack != null && body.pack !== "custom") {
      const pack = PACKS[Number(body.pack)];
      if (!pack) throw new HttpError(400, "Choose a credit pack.");
      amount = pack.price[currency]; emails = pack.emails;
    } else {
      amount = Math.round(Number(body.amount) * 100);
      if (!isFinite(amount) || amount < MIN_TOPUP[currency]) throw new HttpError(400, `The minimum top-up is ${currency === "NGN" ? "₦5,000" : "$5"}.`);
      if (amount > MAX_TOPUP[currency]) throw new HttpError(400, "That's above the largest top-up. Talk to sales for bigger volumes.");
      emails = emailsFor(amount, currency);
    }
    const coupon = await resolveCoupon(teamId, body.coupon, { kind: "credits" });
    const after = coupon ? discounted(amount, coupon.percent_off) : amount;
    return { kind: "credits" as const, currency, emails, full: amount, after, coupon, plan: "", interval: "", p: null as Any };
  }
  const kind = body.kind === "marketing" ? "marketing" as const : "transactional" as const;
  const plan = String(body.plan || "");
  const interval = INTERVALS.includes(body.interval) ? body.interval as string : "monthly";
  const p = catalog(kind)[plan];
  if (!p) throw new HttpError(400, kind === "marketing" ? "Choose Growth or Pro marketing." : "Choose Pro or Scale.");
  const full = p[interval as "monthly" | "yearly"][currency];
  const coupon = await resolveCoupon(teamId, body.coupon, { kind, plan, interval });
  const after = coupon ? discounted(full, coupon.percent_off, true) : full;
  return { kind, currency, emails: 0, full, after, coupon, plan, interval, p };
}

async function handle(req: Request, path: string): Promise<Response> {
  if (path === "/webhook" && req.method === "POST") return webhook(req);
  if (path === "/cron/overage" && req.method === "POST") {
    const secret = await setting("cron_secret");
    if (!secret || req.headers.get("x-cron-secret") !== secret) throw new HttpError(401, "Unauthorized");
    return json(await overageRun());
  }
  if (path === "/cron/health" && req.method === "POST") {
    // For delivrie.io/status: can we reach Paystack with our key? Says test or live mode, never the key.
    const secret = await setting("cron_secret");
    if (!secret || req.headers.get("x-cron-secret") !== secret) throw new HttpError(401, "Unauthorized");
    if (!PSK) return json({ ok: false, configured: false });
    const t0 = Date.now();
    try { await ps("GET", "/bank?currency=NGN&perPage=1"); return json({ ok: true, configured: true, mode: PSK.startsWith("sk_live_") ? "live" : "test", latency_ms: Date.now() - t0 }); }
    catch (e) { return json({ ok: false, configured: true, mode: PSK.startsWith("sk_live_") ? "live" : "test", error: (e as Error).message.slice(0, 200) }); }
  }
  if (path === "/cron/watch" && req.method === "POST") {
    const secret = await setting("cron_secret");
    if (!secret || req.headers.get("x-cron-secret") !== secret) throw new HttpError(401, "Unauthorized");
    return json(await watchRun());
  }
  const a = await auth(req);
  const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};

  if (path === "/summary" && req.method === "GET") return json(await summary(a.teamId, a.admin));

  // Preview a coupon (or the team's assigned discount when no code is given) before paying.
  if (path === "/coupon" && req.method === "POST") {
    requireAdmin(a);
    const q = await quote(a.teamId, body);
    if (!q.coupon) return json({ coupon: null, amount_before: q.full, amount_after: q.full, currency: q.currency });
    const c = q.coupon;
    return json({
      coupon: { code: c.code, percent_off: c.percent_off, duration: c.duration, label: couponLabel(c), description: c.description || null, assigned: !normCode(body.coupon) },
      amount_before: q.full, amount_after: q.after, vat: q.kind === "credits" ? vatOf(q.after) : 0, currency: q.currency,
      renews_at: q.kind === "credits" ? null : c.duration === "forever" ? q.after : q.full,
    });
  }

  if (path === "/checkout" && req.method === "POST") {
    requireAdmin(a);
    const q = await quote(a.teamId, { ...body, kind: body.kind === "marketing" ? "marketing" : "transactional" });
    const { kind, plan, currency, interval, p, coupon } = q;
    const t = await team(a.teamId);
    const cur = kind === "marketing" ? (t.billing?.marketing || {}) : (t.billing || {});
    const current = kind === "marketing" ? t.plan_marketing : t.plan_transactional;
    if (current === plan && cur.status === "active" && cur.currency === currency && (cur.interval || "monthly") === interval) throw new HttpError(400, `You're already on ${p.name}.`);
    // No coupon or "every payment": subscribe to a Paystack plan at that price. "First payment only": a one-off charge
    // at the discounted price (card only, so the card can be saved), then applyCharge starts the full-price plan.
    const once = coupon?.duration === "once";
    const code = once ? null : await planCode(kind, plan, interval, currency, coupon?.percent_off || 0);
    const init = await ps("POST", "/transaction/initialize", {
      email: t.billing?.details?.email || a.user.email,
      amount: q.after,
      currency,
      ...(code ? { plan: code } : { channels: ["card"] }),
      callback_url: `${APP_URL}/billing`,
      metadata: { team_id: a.teamId, kind, plan, interval, currency, user_id: a.user.id, cancel_action: `${APP_URL}/billing?canceled=1`, ...couponMeta(coupon, q.full, q.after), ...(once ? { coupon_once: true } : {}) },
    });
    return json({ url: init.authorization_url, reference: init.reference });
  }

  // Top up credits: a pack or a custom amount; saved card, or Paystack checkout (card, bank transfer, USSD).
  if ((path === "/topup" || path === "/credits") && req.method === "POST") {
    requireAdmin(a);
    const q = await quote(a.teamId, { ...body, kind: "credits" });
    const { currency, emails, coupon } = q;
    const amount = q.after; // emails stay at the full-price amount; the coupon lowers what's paid
    const t = await team(a.teamId);
    if (body.auto && typeof body.auto === "object") {
      const pack = Number(body.auto.pack ?? body.pack ?? 1);
      await saveBilling(a.teamId, { auto_topup: { ...(t.billing?.auto_topup || {}), enabled: !!body.auto.enabled, pack: PACKS[pack] ? pack : 1, threshold: Math.max(0, Math.round(Number(body.auto.threshold ?? DEFAULT_THRESHOLD[currency] / 100) * 100)) } });
    }
    const method = ["card", "bank_transfer", "ussd"].includes(body.method) ? body.method : "checkout";
    if (method === "card" && t.billing?.authorization_code) {
      const status = await chargeCredits(a.teamId, emails, amount, currency, false, coupon, q.full);
      if (status !== "success") throw new HttpError(402, "Your card was declined. Try checkout instead.");
      return json({ status, emails, ...(await summary(a.teamId, a.admin)) });
    }
    const init = await ps("POST", "/transaction/initialize", {
      email: t.billing?.details?.email || a.user.email,
      amount: amount + vatOf(amount),
      currency,
      ...(method === "bank_transfer" || method === "ussd" ? { channels: [method] } : {}),
      callback_url: `${APP_URL}/billing`,
      metadata: { team_id: a.teamId, kind: "credits", emails, currency, vat: vatOf(amount), user_id: a.user.id, cancel_action: `${APP_URL}/billing?canceled=1`, ...couponMeta(coupon, q.full, amount) },
    });
    return json({ url: init.authorization_url, reference: init.reference });
  }

  // Auto top-up and usage alert preferences.
  if (path === "/settings" && req.method === "POST") {
    requireAdmin(a);
    const t = await team(a.teamId);
    const b = t.billing || {};
    const cur = b.currency === "USD" ? "USD" : "NGN";
    const patch: Any = {};
    if (body.auto_topup) {
      const x = body.auto_topup, pack = Number(x.pack ?? b.auto_topup?.pack ?? 1);
      if (x.enabled && !b.authorization_code) throw new HttpError(400, "Auto top-up needs a saved card. Top up once with a card first.");
      patch.auto_topup = { ...(b.auto_topup || {}), enabled: !!x.enabled, pack: PACKS[pack] ? pack : 1, threshold: x.threshold != null ? Math.max(0, Math.round(Number(x.threshold) * 100)) : (b.auto_topup?.threshold ?? DEFAULT_THRESHOLD[cur]) };
    }
    if (body.alerts) patch.alerts = { ...(b.alerts || {}), ...Object.fromEntries(["p80", "p100", "credits_low"].filter((k) => k in body.alerts).map((k) => [k, !!body.alerts[k]])) };
    await saveBilling(a.teamId, patch);
    return json(await summary(a.teamId, a.admin));
  }

  if (path === "/cap" && req.method === "POST") {
    requireAdmin(a);
    const v = body.amount == null || body.amount === "" ? null : Math.round(Number(body.amount) * 100);
    if (v != null && (!isFinite(v) || v < 0)) throw new HttpError(400, "Enter a positive amount, or leave it empty for no cap.");
    await saveBilling(a.teamId, { spend_cap: v || null });
    return json(await summary(a.teamId, a.admin));
  }

  if (path === "/details" && req.method === "POST") {
    requireAdmin(a);
    const clip = (v: unknown, n = 200) => String(v ?? "").trim().slice(0, n);
    const email = clip(body.email, 254);
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(400, "Enter a valid billing email.");
    const t = await team(a.teamId);
    const prev = t.billing?.details || {};
    const next: Any = { ...prev };
    for (const k of ["name", "country", "state", "address", "city", "postal_code", "tax_id_type", "tax_id"]) if (k in body) next[k] = clip(body[k]);
    if ("email" in body) next.email = email;
    await saveBilling(a.teamId, { details: next });
    return json(await summary(a.teamId, a.admin));
  }

  if (path === "/verify" && req.method === "POST") {
    const ref = String(body.reference || "");
    if (!ref) throw new HttpError(400, "Missing payment reference.");
    const tx = await ps("GET", `/transaction/verify/${encodeURIComponent(ref)}`);
    const meta = parseMeta(tx.metadata);
    if (meta.team_id && meta.team_id !== a.teamId) throw new HttpError(403, "This payment belongs to a different team.");
    if (tx.status === "success") await applyCharge(tx);
    return json({ status: tx.status, kind: meta.kind || "transactional", ...(await summary(a.teamId, a.admin)) });
  }

  if (path === "/card" && req.method === "POST") {
    requireAdmin(a);
    const t = await team(a.teamId);
    const b = t.billing || {};
    const code = b.subscription_code || b.marketing?.subscription_code;
    if (!code) throw new HttpError(400, "There's no active subscription to update.");
    const d = await ps("GET", `/subscription/${code}/manage/link`);
    return json({ url: d.link });
  }

  if (path === "/cancel" && req.method === "POST") {
    requireAdmin(a);
    const t = await team(a.teamId);
    const all = t.billing || {};
    const marketing = body.kind === "marketing";
    const b = marketing ? (all.marketing || {}) : all;
    if (!b.subscription_code || !b.email_token) throw new HttpError(400, "There's no active subscription to cancel.");
    await ps("POST", "/subscription/disable", { code: b.subscription_code, token: b.email_token });
    const end = b.next_payment_date || new Date().toISOString();
    if (marketing) await saveBilling(a.teamId, { marketing: { ...b, status: "cancelling", cancel_at: end } });
    else await saveBilling(a.teamId, { status: "cancelling", cancel_at: end });
    return json(await summary(a.teamId, a.admin));
  }

  throw new HttpError(404, "Not found");
}

async function webhook(req: Request) {
  const raw = await req.text();
  const sig = req.headers.get("x-paystack-signature") || "";
  if (!PSK || !sig) return json({ error: "invalid signature" }, 401);
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(PSK), { name: "HMAC", hash: "SHA-512" }, false, ["sign"]);
  const mac = Array.from(new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(raw)))).map((x) => x.toString(16).padStart(2, "0")).join("");
  if (!PSK || mac !== sig) return json({ error: "invalid signature" }, 401);
  const evt = JSON.parse(raw);
  const d = evt.data || {};
  try {
    switch (evt.event) {
      case "charge.success":
        await applyCharge(d);
        break;
      case "subscription.create": {
        const teamId = d.customer?.customer_code ? await teamForCustomer(d.customer.customer_code, d.plan?.plan_code) : undefined;
        const info = await planFromCode(d.plan?.plan_code);
        const sub = { subscription_code: d.subscription_code, email_token: d.email_token, next_payment_date: d.next_payment_date, plan_code: d.plan?.plan_code };
        if (teamId && info?.kind === "marketing") await saveBilling(teamId, { marketing: { ...((await team(teamId)).billing?.marketing || {}), ...sub } });
        else if (teamId) await saveBilling(teamId, sub);
        break;
      }
      case "invoice.create":
      case "invoice.update": {
        const teamId = d.customer?.customer_code ? await teamForCustomer(d.customer.customer_code, d.subscription?.plan?.plan_code) : undefined;
        if (teamId && d.subscription?.next_payment_date) await saveBilling(teamId, { next_payment_date: d.subscription.next_payment_date });
        break;
      }
      case "invoice.payment_failed": {
        const teamId = d.customer?.customer_code ? await teamForCustomer(d.customer.customer_code) : undefined;
        if (teamId) await saveBilling(teamId, { status: "past_due" });
        break;
      }
      case "subscription.not_renew":
      case "subscription.disable": {
        const { data: mk } = await db.from("teams").select("id,billing").eq("billing->marketing->>subscription_code", d.subscription_code);
        for (const r of mk || []) {
          const m = r.billing?.marketing || {};
          const end = m.next_payment_date || d.next_payment_date;
          if (end && new Date(end) > new Date()) await saveBilling(r.id, { marketing: { ...m, status: "cancelling", cancel_at: end } });
          else { await saveBilling(r.id, { marketing: { ...m, status: "canceled", plan: "free" } }); await db.from("teams").update({ plan_marketing: "free" }).eq("id", r.id); }
        }
        const { data: rows } = await db.from("teams").select("id,billing").eq("billing->>subscription_code", d.subscription_code);
        for (const r of rows || []) {
          const end = r.billing?.next_payment_date || d.next_payment_date;
          const stillPaid = end && new Date(end) > new Date();
          if (stillPaid) await saveBilling(r.id, { status: "cancelling", cancel_at: end });
          else await saveBilling(r.id, { status: "canceled", plan: "free" }, "free");
        }
        break;
      }
    }
  } catch (e) {
    console.error("webhook handling failed", evt.event, e);
    return json({ received: true, error: String((e as Error).message) }, 500);
  }
  return json({ received: true });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  const url = new URL(req.url);
  const i = url.pathname.indexOf("/billing");
  const path = (i >= 0 ? url.pathname.slice(i + "/billing".length) : url.pathname) || "/";
  try {
    return await handle(req, path.replace(/\/$/, "") || "/");
  } catch (e) {
    if (e instanceof HttpError) return json({ statusCode: e.status, message: e.message }, e.status);
    console.error(e);
    return json({ statusCode: 500, message: "Something went wrong with billing. Try again." }, 500);
  }
});
