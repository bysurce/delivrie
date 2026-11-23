// Delivrie billing: Starter/Pro/Scale (monthly or yearly), the marketing add-on, pay-as-you-go credits and
// month-end overage. Two payment providers, chosen per team:
//   - Teams in Nigeria pay in Naira through Paystack (card, bank transfer, USSD).
//   - Everyone else pays in US dollars through Stripe (card, with Stripe Tax).
// A team stays on the provider it first paid with, so its currency never changes under it. Before that, the
// country of the request decides (x-dlv-country, set by middleware.js from Vercel's geolocation).
//
// Routes (served at https://delivrie.io/api/billing/* via a Vercel rewrite):
//   GET  /summary         plan, prices, subscription and invoices for the current team
//   POST /checkout        { plan, interval, kind? } -> checkout URL (Stripe or Paystack). A live Stripe plan changes
//                         in place instead (the difference is charged or credited now).
//   POST /topup           { pack | amount, method, auto? } -> credits. method: card (saved card, charged now),
//                         checkout, and for Naira also bank_transfer or ussd. /credits is an alias.
//   POST /verify          { session_id } (Stripe) or { reference } (Paystack) -> applies a finished payment
//   POST /portal          { flow?: "card" } -> Stripe customer portal, or Paystack's card update page. /card too.
//   POST /cancel          { kind? } -> stop renewing; the plan stays until the paid period ends
//   POST /settings        { auto_topup?: { enabled, pack, threshold }, alerts?: { p80, p100, credits_low } }
//   POST /cap             { amount } -> monthly overage spending cap in the team's currency (empty clears it)
//   POST /details         { email, and for Naira teams name, country, state, address, city, postal_code, tax_id… }
//   POST /stripe/webhook  Stripe events (Stripe-Signature, STRIPE_WEBHOOK_SECRET)
//   POST /webhook         Paystack events (x-paystack-signature, signed with PAYSTACK_SECRET_KEY)
//   POST /cron/watch      auto top-ups and usage alert emails (pg_cron every 15 minutes, x-cron-secret)
//   POST /cron/overage    month-end overage charges (pg_cron, x-cron-secret)
//   POST /cron/health     can we reach Stripe and Paystack? (status page, x-cron-secret)
//   GET  /geo             the country seen for this request and the provider it would get (no login)
//
// Secrets: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, PAYSTACK_SECRET_KEY, APP_URL, SYSTEM_FROM, VAT_RATE (optional
// percent added to Naira top-ups and overage; Stripe Tax handles tax on dollar payments).
import { createClient } from "npm:@supabase/supabase-js@2.49.1";
import { cardLabel, formEncode, periodEnd, priceKey, subState, trialEndFor, verifyStripeSignature } from "./stripe.ts";

// deno-lint-ignore no-explicit-any
type Any = any;
const env = (k: string) => Deno.env.get(k) ?? "";
const db = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false, autoRefreshToken: false } });
const SK = env("STRIPE_SECRET_KEY");
const WHSEC = env("STRIPE_WEBHOOK_SECRET");
const MODE = SK.startsWith("sk_live") ? "live" : SK ? "test" : null;
const PSK = env("PAYSTACK_SECRET_KEY");
const PS_MODE = PSK.startsWith("sk_live") ? "live" : PSK ? "test" : null;
const APP_URL = (env("APP_URL") || "https://delivrie.io").replace(/\/$/, "");
const STRIPE_VERSION = "2024-06-20";

// Prices follow the pricing page, in the smallest unit: cents for USD, kobo for NGN.
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
// Credits are stored as emails. Their money value uses the pay-as-you-go rate: $0.60 / ₦600 per 1,000 emails.
const CREDIT_RATE: Price = { USD: 0.06, NGN: 60 }; // smallest unit per email
const creditValue = (emails: number, cur: string) => Math.floor(emails * CREDIT_RATE[cur]);
const emailsFor = (amount: number, cur: string) => Math.floor(amount / CREDIT_RATE[cur]);
const MIN_TOPUP: Price = { USD: 5_00, NGN: 5_000_00 };
const MAX_TOPUP: Price = { USD: 10_000_00, NGN: 10_000_000_00 };
const DEFAULT_THRESHOLD: Price = { USD: 2_00, NGN: 2_000_00 };
// Naira payments: VAT is off unless VAT_RATE is set (a percent, e.g. 7.5). Dollar payments use Stripe Tax.
const VAT_RATE = Math.max(0, Number(env("VAT_RATE") || 0)) || 0;
const vatOf = (amount: number) => Math.round(amount * VAT_RATE / 100);
const PLAN_LIMITS: Record<string, { domains: number; members: number; retention_days: number; day: number }> = {
  free: { domains: 1, members: 1, retention_days: 30, day: 133 },
  starter: { domains: 10, members: 5, retention_days: 30, day: 1500 },
  pro: { domains: 10, members: 5, retention_days: 30, day: 0 },
  scale: { domains: 1000, members: 0, retention_days: 30, day: 0 },
};
const MARKETING_CONTACTS: Record<string, number> = { free: 1_000, growth: 5_000, pro: 10_000 };
const INTERVALS = ["monthly", "yearly"];
const catalog = (kind: string) => (kind === "marketing" ? MARKETING : PLANS) as Record<string, { name: string; monthly: Price; yearly: Price }>;
const fmt = (n: number, cur: string) => new Intl.NumberFormat(cur === "NGN" ? "en-NG" : "en-US", { style: "currency", currency: cur, maximumFractionDigits: 0 }).format(n / 100);
type Provider = "stripe" | "paystack";
const CUR: Record<Provider, string> = { stripe: "USD", paystack: "NGN" };

// Which provider a team pays with: the one behind its running plan, else the one it first paid with, else the
// request's country (Nigeria: Paystack in Naira; anywhere else: Stripe in US dollars).
// Admin → Website → Payments can switch a provider off. Everyone then pays through the other one, whatever their
// country or history: Stripe off means Naira through Paystack for all, Paystack off means dollars through Stripe
// for all. With both off, payments are paused. Read from site_config and cached for 30 seconds.
let FLAGS: { stripe: boolean; paystack: boolean; at: number } = { stripe: true, paystack: true, at: 0 };
async function loadFlags() {
  if (Date.now() - FLAGS.at < 30_000) return;
  try {
    const { data } = await db.from("site_config").select("value").eq("key", "billing").maybeSingle();
    const v = (data?.value || {}) as Any;
    FLAGS = { stripe: v.stripe !== false, paystack: v.paystack !== false, at: Date.now() };
  } catch (e) { console.error("billing switches", e); FLAGS.at = Date.now() - 20_000; } // keep the last known, retry in 10s
}
const otherOf = (p: Provider): Provider => (p === "stripe" ? "paystack" : "stripe");
const paused = () => !FLAGS.stripe && !FLAGS.paystack;
// A provider that's switched off hands over to the other one. (With both off the natural one is kept, and every
// payment route answers that payments are paused.)
const usable = (p: Provider): Provider => (FLAGS[p] || !FLAGS[otherOf(p)] ? p : otherOf(p));
const runningSub = (x: Any) => !!(x?.provider && x.plan && x.plan !== "free" && ["active", "cancelling", "past_due"].includes(x.status));

function providerOf(t: Any, country?: string | null): Provider {
  const b = t?.billing || {};
  // Set by hand in the database for one team (for example to test Stripe from Nigeria). Wins over everything else.
  if (b.provider_override === "stripe" || b.provider_override === "paystack") return b.provider_override;
  if (runningSub(b)) return usable(b.provider);
  if (runningSub(b.marketing)) return usable(b.marketing.provider);
  if (b.payment_provider === "stripe" || b.payment_provider === "paystack") return usable(b.payment_provider);
  const cc = (country || "").toUpperCase();
  if (cc) return usable(cc === "NG" ? "paystack" : "stripe");
  return usable(b.details?.country === "Nigeria" || b.currency === "NGN" ? "paystack" : "stripe");
}
const assertOpen = () => { if (paused()) throw new HttpError(503, "Payments are paused right now. Please try again a little later."); };

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, content-type, x-team-id, x-client-info, apikey",
  "access-control-allow-methods": "GET, POST, OPTIONS",
};
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...CORS, "content-type": "application/json" } });
class HttpError extends Error { constructor(public status: number, message: string) { super(message); } }

// ---------------------------------------------------------------- Stripe
async function stripe(method: string, path: string, params?: Record<string, unknown>, idempotencyKey?: string): Promise<Any> {
  if (!SK) throw new HttpError(503, "Payments aren't connected yet. Add STRIPE_SECRET_KEY to the billing function's secrets.");
  const body = params ? formEncode(params) : "";
  const get = method === "GET";
  const r = await fetch(`https://api.stripe.com/v1${path}${get && body ? (path.includes("?") ? "&" : "?") + body : ""}`, {
    method,
    headers: {
      authorization: `Bearer ${SK}`, "stripe-version": STRIPE_VERSION,
      ...(get ? {} : { "content-type": "application/x-www-form-urlencoded" }),
      ...(idempotencyKey ? { "idempotency-key": idempotencyKey } : {}),
    },
    body: get ? undefined : body,
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    const e = j.error || {};
    const err = new HttpError(e.type === "card_error" ? 402 : r.status >= 500 ? 502 : 400, String(e.message || `Stripe returned ${r.status}`));
    (err as Any).code = e.code;
    throw err;
  }
  return j;
}

async function setting(key: string) {
  const { data } = await db.from("system_settings").select("value").eq("key", key).maybeSingle();
  return (data?.value as string) || null;
}
async function setSetting(key: string, value: string) {
  await db.from("system_settings").upsert({ key, value });
}

// Stripe Tax is used once it's turned on in the Stripe dashboard (Settings → Tax); until then prices are charged
// without tax rather than failing checkout.
let taxCache: { ok: boolean; at: number } | null = null;
async function taxReady() {
  if (taxCache && Date.now() - taxCache.at < 600e3) return taxCache.ok;
  let ok = false;
  try { ok = (await stripe("GET", "/tax/settings")).status === "active"; } catch (e) { console.error("tax settings", (e as Error).message); }
  taxCache = { ok, at: Date.now() };
  return ok;
}

// The Stripe price for a plan, created on first use and cached. Prices exclude tax; Stripe Tax adds it on top.
async function priceId(kind: string, plan: string, interval: string) {
  const p = catalog(kind)[plan];
  const amount = p[interval as "monthly" | "yearly"].USD;
  const key = priceKey(kind, plan, interval, amount);
  const cacheKey = `stripe_price:${MODE}:${key}`;
  const cached = await setting(cacheKey);
  if (cached) return cached;
  const found = await stripe("GET", "/prices", { lookup_keys: [key], active: true, limit: 1 });
  let id = found.data?.[0]?.id;
  if (!id) {
    const name = `Delivrie ${p.name}${kind === "marketing" && plan === "pro" ? "" : kind === "marketing" ? " marketing" : ""}`;
    const made = await stripe("POST", "/prices", {
      currency: "usd", unit_amount: amount, lookup_key: key, tax_behavior: "exclusive",
      recurring: { interval: interval === "yearly" ? "year" : "month" },
      product_data: { name, metadata: { kind, plan, ...APP_TAG } },
      metadata: { kind, plan, interval, ...APP_TAG },
    }, `price-${MODE}-${key}`);
    id = made.id;
  }
  await setSetting(cacheKey, id);
  return id as string;
}

// ---------------------------------------------------------------- teams
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
  // Plan changes are confirmed by the payment provider, so they're recorded as the system acting.
  if (plan && plan !== t.plan_transactional) await auditLog(teamId, null, "billing.plan_changed", t.name, { from: t.plan_transactional, to: plan, provider: (billing as Any).provider || null });
}

// Audit log entries for billing (Enterprise teams can read them in Settings -> Audit log). A user's own action
// names them; provider-confirmed changes are "system". Never blocks the billing action itself.
async function auditLog(teamId: string, user: Any | null, action: string, label: string | null, metadata: Record<string, unknown> = {}, req?: Request) {
  const ip = req ? (req.headers.get("x-forwarded-for") || "").split(",")[0].trim().slice(0, 64) || null : null;
  const { error } = await db.from("audit_logs").insert({
    team_id: teamId, actor_type: user ? "user" : "system", actor_id: user?.id || null, actor_label: user ? user.email : "Billing",
    action, target_type: "billing", target_id: teamId, target_label: label, metadata, ip, user_agent: user ? "Dashboard" : null,
  });
  if (error) console.error("audit insert", error.message);
}

// One Stripe customer per team (per mode, so test and live never mix).
async function customerFor(teamId: string, fallbackEmail?: string) {
  const t = await team(teamId);
  const b = t.billing || {};
  if (b.stripe_customer && b.stripe_mode === MODE) return b.stripe_customer as string;
  const c = await stripe("POST", "/customers", { email: b.details?.email || b.email || fallbackEmail, name: t.name, metadata: { team_id: teamId, ...APP_TAG } }, `customer-${MODE}-${teamId}`);
  await saveBilling(teamId, { stripe_customer: c.id, stripe_mode: MODE, stripe_pm: null });
  return c.id as string;
}

async function teamForCustomer(customer: string) {
  const { data } = await db.from("teams").select("id").eq("billing->>stripe_customer", customer).limit(1);
  return data?.[0]?.id as string | undefined;
}

// ---------------------------------------------------------------- applying payments
async function recordInvoice(row: { team_id: string; reference: string; kind: string; plan: string | null; description: string; amount: number; currency?: string; status: string; card?: string | null; url?: string | null; tax?: number; paid_at?: string }) {
  const { data: prev } = await db.from("billing_invoices").select("status").eq("reference", row.reference).maybeSingle();
  // Drop fields that weren't given, so they don't wipe the defaults (an undefined paid_at would save an empty date).
  const given = Object.fromEntries(Object.entries(row).filter(([, v]) => v !== undefined));
  await db.from("billing_invoices").upsert({ currency: "USD", paid_at: new Date().toISOString(), ...given }, { onConflict: "reference" });
  return prev?.status === "success"; // already applied before
}

// Credits are applied once per payment reference, however many times the webhook or /verify sees it.
async function applyCredits(teamId: string, reference: string, emails: number, amount: number, opts: { auto?: boolean; url?: string | null; tax?: number; card?: string | null; status?: string }) {
  const ok = (opts.status || "success") === "success";
  const done = await recordInvoice({ team_id: teamId, reference, kind: "credits", plan: null, description: `${opts.auto ? "Auto top-up" : "Credit top-up"} · ${emails.toLocaleString("en-US")} emails`, amount, currency: "USD", status: ok ? "success" : "failed", card: opts.card, url: opts.url, tax: opts.tax });
  if (ok && !done && emails > 0) await db.rpc("add_credits", { p_team: teamId, p_n: emails });
  if (ok) await saveBilling(teamId, { payment_provider: "stripe" });
}

// Make the card from a payment the default for invoices (auto top-ups, overage, renewals).
async function rememberCard(teamId: string, customer: string, pm: Any) {
  if (!pm?.id) return;
  await stripe("POST", `/customers/${customer}`, { invoice_settings: { default_payment_method: pm.id } }).catch((e) => console.error("default card", e.message));
  await saveBilling(teamId, { stripe_pm: pm.id, card: cardLabel(pm.card) || "Card", payment_provider: "stripe" });
}

// Mirrors a Stripe subscription onto the team (plan, status, renewal date). Called from webhooks and Checkout.
async function syncSubscription(subOrId: Any) {
  const sub = typeof subOrId === "string" ? await stripe("GET", `/subscriptions/${subOrId}`, { expand: ["default_payment_method"] }) : subOrId;
  const price = sub.items?.data?.[0]?.price || {};
  const kind = sub.metadata?.kind || price.metadata?.kind || "transactional";
  const plan = sub.metadata?.plan || price.metadata?.plan;
  const interval = price.recurring?.interval === "year" ? "yearly" : "monthly";
  const teamId = sub.metadata?.team_id || await teamForCustomer(sub.customer);
  if (!teamId || !plan || !catalog(kind)[plan]) return null;
  const t = await team(teamId);
  if (!t) { console.warn("stripe subscription for unknown team", JSON.stringify({ subscription: sub.id, team: String(teamId).slice(0, 64), status: sub.status })); return null; }
  const b = t.billing || {};
  const cur = kind === "marketing" ? (b.marketing || {}) : b;
  // A team that pays through Paystack isn't moved by a stray Stripe subscription (for example one left over from
  // a test). It is moved when new payments for it go through Stripe: Paystack switched off, or an override.
  const fromPaystack = cur.provider === "paystack" && runningSub(cur);
  if (fromPaystack && providerOf(t) === "paystack") return teamId;
  // Ignore events for a subscription that has since been replaced by a newer one.
  if (cur.stripe_subscription && cur.stripe_subscription !== sub.id && sub.status !== "active" && sub.status !== "trialing") return teamId;
  const state = subState(sub);
  if (state === "incomplete") return teamId;
  const end = periodEnd(sub);
  const fields: Any = {
    provider: "stripe", payment_provider: "stripe", stripe_subscription: sub.id, plan: state === "canceled" ? "free" : plan, interval, currency: "USD",
    status: state, next_payment_date: end, cancel_at: state === "cancelling" ? (sub.cancel_at ? new Date(sub.cancel_at * 1000).toISOString() : end) : null,
    trial_end: sub.status === "trialing" && sub.trial_end ? new Date(sub.trial_end * 1000).toISOString() : null,
  };
  if (sub.default_payment_method?.card) Object.assign(fields, { card: cardLabel(sub.default_payment_method.card) });
  // Continuing a Naira plan in dollars: stop the Paystack subscription so it never renews. The Stripe one starts
  // charging when the paid Naira period ends (see the trial in /checkout).
  if (fromPaystack && state !== "canceled") {
    if (cur.subscription_code && cur.email_token) await ps("POST", "/subscription/disable", { code: cur.subscription_code, token: cur.email_token }).catch((e) => console.error("paystack disable", e.message));
    Object.assign(fields, { subscription_code: null, email_token: null, plan_code: null });
  }
  if (kind === "marketing") {
    await saveBilling(teamId, { marketing: { ...(b.marketing || {}), ...fields, subscription_code: null, email_token: null } });
    await db.from("teams").update({ plan_marketing: state === "canceled" ? "free" : plan }).eq("id", teamId);
  } else {
    const newPlan = state === "canceled" ? "free" : plan;
    fields.plan_since = t.plan_transactional === newPlan && b.plan_since ? b.plan_since : new Date().toISOString();
    await saveBilling(teamId, fields, newPlan);
  }
  return teamId;
}

// A finished Checkout Session: credits get added, subscriptions get mirrored, the card is remembered.
async function applySession(id: string, expectTeam?: string) {
  const s = await stripe("GET", `/checkout/sessions/${id}`, { expand: ["payment_intent.payment_method", "subscription.default_payment_method", "invoice"] });
  const teamId = s.metadata?.team_id || s.client_reference_id;
  if (!teamId) return { status: "unknown" };
  if (expectTeam && teamId !== expectTeam) throw new HttpError(403, "This payment belongs to a different team.");
  const t = await team(teamId);
  // A checkout for a team that no longer exists, or one made by another app on the same Stripe account: note it for
  // the admins and acknowledge it, so Stripe doesn't keep retrying.
  if (!t) { console.warn("stripe checkout for unknown team", JSON.stringify({ session: s.id, team: String(teamId).slice(0, 64), amount: s.amount_total, currency: s.currency, mode: s.mode, created: s.created, livemode: s.livemode })); return { status: "ignored" }; }
  if (t.billing?.stripe_customer && s.customer && t.billing.stripe_customer !== s.customer) throw new HttpError(403, "This payment belongs to a different customer.");
  const kind = s.metadata?.kind || "transactional";
  if (s.status !== "complete") return { status: s.status, kind, teamId };
  if (s.mode === "payment") {
    if (s.payment_status !== "paid") return { status: s.payment_status, kind, teamId };
    const pm = s.payment_intent?.payment_method;
    await applyCredits(teamId, s.metadata.ref || s.id, Number(s.metadata.emails || 0), s.amount_total, { url: s.invoice?.hosted_invoice_url, tax: s.total_details?.amount_tax || 0, card: cardLabel(pm?.card) });
    await rememberCard(teamId, s.customer, pm);
    return { status: "success", kind: "credits", teamId };
  }
  if (s.mode === "subscription" && s.subscription) {
    await syncSubscription(s.subscription);
    const pm = s.subscription.default_payment_method;
    if (pm) await rememberCard(teamId, s.customer, pm);
    return { status: "success", kind, teamId };
  }
  return { status: s.status, kind, teamId };
}

// Records a Stripe invoice: subscription renewals, and the one-off invoices used for saved-card top-ups and overage.
async function applyInvoice(invOrId: Any) {
  const inv = typeof invOrId === "string" ? await stripe("GET", `/invoices/${invOrId}`, { expand: ["subscription", "payment_intent.payment_method"] }) : invOrId;
  const meta = inv.metadata || {};
  const teamId = meta.team_id || (typeof inv.subscription === "object" ? inv.subscription?.metadata?.team_id : null) || await teamForCustomer(inv.customer);
  if (!teamId) return null;
  if (!(await team(teamId))) { console.warn("stripe invoice for unknown team", JSON.stringify({ invoice: inv.id, team: String(teamId).slice(0, 64), amount: inv.amount_paid ?? inv.amount_due, currency: inv.currency, status: inv.status })); return null; }
  const status = inv.status === "paid" ? "success" : inv.status === "void" ? "void" : "failed";
  const card = cardLabel(inv.payment_intent?.payment_method?.card);
  const tax = Number(inv.tax || 0);
  // Checkout already credited these; just keep the receipt link.
  if (meta.via === "checkout") {
    if (meta.ref) await db.from("billing_invoices").update({ url: inv.hosted_invoice_url }).eq("reference", meta.ref);
    return teamId;
  }
  if (meta.kind === "credits") { await applyCredits(teamId, inv.id, Number(meta.emails || 0), inv.amount_paid || inv.amount_due, { auto: meta.auto === "true", url: inv.hosted_invoice_url, tax, card, status }); return teamId; }
  if (meta.kind === "overage") {
    await recordInvoice({ team_id: teamId, reference: inv.id, kind: "overage", plan: meta.plan || null, description: meta.description || "Overage", amount: inv.amount_paid || inv.amount_due, status, card, url: inv.hosted_invoice_url, tax });
    if (status === "failed") await saveBilling(teamId, { status: "past_due" });
    return teamId;
  }
  if (inv.subscription) {
    const sub = typeof inv.subscription === "object" ? inv.subscription : await stripe("GET", `/subscriptions/${inv.subscription}`);
    const price = sub.items?.data?.[0]?.price || {};
    const kind = sub.metadata?.kind || price.metadata?.kind || "transactional";
    const plan = sub.metadata?.plan || price.metadata?.plan || null;
    const p = plan ? catalog(kind)[plan] : null;
    const interval = price.recurring?.interval === "year" ? "yearly" : "monthly";
    const amount = inv.amount_paid || inv.amount_due;
    if (!amount && inv.billing_reason === "subscription_create" && sub.status === "trialing") return teamId; // $0 trial start for switching customers
    const label = inv.billing_reason === "subscription_update" ? `${p?.name || "Plan"} · plan change` : `${p?.name || "Plan"} · ${interval}`;
    await recordInvoice({ team_id: teamId, reference: inv.id, kind, plan, description: label, amount, status, card, url: inv.hosted_invoice_url, tax, paid_at: inv.status_transitions?.paid_at ? new Date(inv.status_transitions.paid_at * 1000).toISOString() : undefined });
    await syncSubscription(sub.id);
  }
  return teamId;
}

// Charges the saved card through a one-off invoice (Stripe Tax and a receipt included). Used for saved-card and
// automatic top-ups and month-end overage. Returns the invoice after the payment attempt.
async function chargeInvoice(teamId: string, lines: { amount: number; description: string }[], metadata: Record<string, string>, idem: string) {
  const t = await team(teamId);
  const b = t.billing || {};
  if (!b.stripe_customer || !b.stripe_pm || b.stripe_mode !== MODE) throw new HttpError(400, "There's no saved card. Pay with checkout instead.");
  const base = { customer: b.stripe_customer, collection_method: "charge_automatically", auto_advance: false, default_payment_method: b.stripe_pm, pending_invoice_items_behavior: "exclude", metadata: { ...APP_TAG, team_id: teamId, ...metadata }, description: lines.map((l) => l.description).join(" · ") };
  let inv: Any;
  const tax = await taxReady();
  try { inv = await stripe("POST", "/invoices", { ...base, automatic_tax: { enabled: tax } }, `${idem}-inv`); }
  catch (e) {
    // No address on file for tax: bill without it rather than not at all.
    if (!tax || !/tax|location|address/i.test((e as Error).message)) throw e;
    inv = await stripe("POST", "/invoices", { ...base, automatic_tax: { enabled: false } }, `${idem}-inv-notax`);
  }
  for (const [i, l] of lines.entries()) {
    await stripe("POST", "/invoiceitems", { customer: b.stripe_customer, invoice: inv.id, amount: l.amount, currency: "usd", description: l.description, tax_behavior: "exclusive" }, `${idem}-item-${i}`);
  }
  await stripe("POST", `/invoices/${inv.id}/finalize`, { auto_advance: false }, `${idem}-fin`);
  try { await stripe("POST", `/invoices/${inv.id}/pay`, { off_session: true }, `${idem}-pay`); }
  catch (e) { console.error("invoice payment failed", inv.id, (e as Error).message); }
  return await stripe("GET", `/invoices/${inv.id}`, { expand: ["payment_intent.payment_method"] });
}

async function chargeCredits(teamId: string, emails: number, amount: number, auto: boolean) {
  const inv = await chargeInvoice(teamId, [{ amount, description: `Delivrie credits · ${emails.toLocaleString("en-US")} emails` }],
    { kind: "credits", emails: String(emails), auto: String(auto) }, `topup-${teamId}-${auto ? "auto-" : ""}${Date.now().toString(36)}`);
  await applyInvoice(inv);
  if (inv.status === "paid") return "success";
  // A declined top-up isn't owed: void it so it doesn't sit in Stripe as an unpaid invoice.
  await stripe("POST", `/invoices/${inv.id}/void`).catch((e) => console.error("void top-up invoice", e.message));
  return "failed";
}

// ---------------------------------------------------------------- Paystack (Naira, for teams in Nigeria)
async function ps(method: string, path: string, body?: unknown): Promise<Any> {
  if (!PSK) throw new HttpError(503, "Naira payments aren't connected yet. Add PAYSTACK_SECRET_KEY to the billing function's secrets.");
  const r = await fetch("https://api.paystack.co" + path, { method, headers: { authorization: `Bearer ${PSK}`, "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.status === false) throw new HttpError(r.status >= 500 ? 502 : 400, String(j.message || `Paystack returned ${r.status}`));
  return j.data;
}

// One Paystack plan per (kind, plan, interval, price). Changing a price creates a new plan; subscribers keep theirs.
async function planCode(kind: string, plan: string, interval: string) {
  const p = catalog(kind)[plan] as Any;
  const amount = p[interval].NGN;
  const key = `paystack_plan:${PS_MODE}:${kind}:${plan}:${interval}:NGN:${amount}`;
  const existing = await setting(key);
  if (existing) return existing;
  const d = await ps("POST", "/plan", {
    name: `Delivrie ${p.name} ${interval} (NGN)`, interval: interval === "yearly" ? "annually" : "monthly", amount, currency: "NGN",
    description: kind === "marketing" ? `Marketing up to ${p.contacts.toLocaleString("en-US")} contacts` : `${p.emails.toLocaleString("en-US")} emails a month`,
  });
  await setSetting(key, d.plan_code);
  await setSetting(`paystack_code:${d.plan_code}`, `${kind}:${plan}:${interval}:NGN`);
  return d.plan_code as string;
}
async function planFromCode(code?: string | null): Promise<{ kind: string; plan: string; interval: string } | null> {
  if (!code) return null;
  const v = await setting(`paystack_code:${code}`);
  if (!v) return null;
  const parts = v.split(":");
  if (parts.length === 2) return { kind: "transactional", plan: parts[0], interval: "monthly" };
  return { kind: parts[0], plan: parts[1], interval: parts[2] };
}

const cardOf = (a: Any) => a?.last4 ? `${(a.brand || a.card_type || "Card").trim().replace(/^\w/, (c: string) => c.toUpperCase())} •••• ${a.last4}` : null;
const parseMeta = (m: Any) => typeof m === "string" ? (() => { try { return JSON.parse(m); } catch { return {}; } })() : (m || {});

async function teamForPaystack(customerCode: string, planCodeHint?: string) {
  const { data } = await db.from("teams").select("id,billing").eq("billing->>customer_code", customerCode);
  const rows = data || [];
  return (rows.find((r: Any) => planCodeHint && r.billing?.plan_code === planCodeHint) || rows[0])?.id as string | undefined;
}

const psRecord = (teamId: string, tx: Any, kind: string, plan: string | null, description: string) => recordInvoice({
  team_id: teamId, reference: tx.reference, kind, plan, description, amount: tx.amount, currency: tx.currency || "NGN",
  status: tx.status === "success" ? "success" : "failed", card: cardOf(tx.authorization), paid_at: tx.paid_at || tx.paidAt || undefined,
});

// Keep the reusable card so auto top-ups and month-end overage can be charged without the customer present.
function cardPatch(tx: Any, old: Any) {
  const a = tx.authorization || {};
  return {
    card: cardOf(a) || old.card,
    ...(a.reusable && a.authorization_code ? { authorization_code: a.authorization_code } : {}),
    customer_code: tx.customer?.customer_code || old.customer_code, customer_id: tx.customer?.id || old.customer_id, email: tx.customer?.email || old.email,
    payment_provider: "paystack",
  };
}

async function findSub(customerId: number | undefined, code: string | null) {
  if (!customerId || !code) return null;
  try {
    const subs: Any[] = await ps("GET", `/subscription?customer=${customerId}&perPage=50`);
    return subs.filter((x) => x.plan?.plan_code === code && x.status === "active").sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))[0] || null;
  } catch (e) { console.error("subscription lookup failed", e); return null; }
}

// A successful (or failed) Paystack charge: plan payments, renewals, credits and overage.
async function applyCharge(tx: Any) {
  const code = tx.plan_object?.plan_code || tx.plan?.plan_code || (typeof tx.plan === "string" && tx.plan ? tx.plan : null);
  const meta = parseMeta(tx.metadata);
  const fromCode = await planFromCode(code);
  const kind = meta.kind || fromCode?.kind || "transactional";
  const teamId = meta.team_id || (tx.customer?.customer_code ? await teamForPaystack(tx.customer.customer_code, code) : undefined);
  if (!teamId) return null;
  const before = await team(teamId);
  const old = before.billing || {};

  if (kind === "credits") {
    const emails = Number(meta.emails || 0);
    const done = await psRecord(teamId, tx, "credits", null, `${meta.auto ? "Auto top-up" : "Credit top-up"} · ${emails.toLocaleString("en-US")} emails`);
    if (tx.status === "success" && !done && emails > 0) {
      await db.rpc("add_credits", { p_team: teamId, p_n: emails });
      await saveBilling(teamId, { ...cardPatch(tx, old), currency: "NGN" });
    }
    return teamId;
  }
  if (kind === "overage") {
    await psRecord(teamId, tx, "overage", before.plan_transactional, meta.description || "Overage");
    if (tx.status !== "success") await saveBilling(teamId, { status: "past_due" });
    return teamId;
  }

  const plan = meta.plan || fromCode?.plan;
  const interval = meta.interval || fromCode?.interval || "monthly";
  if (!plan || !catalog(kind)[plan]) return null;
  await psRecord(teamId, tx, kind, plan, `${catalog(kind)[plan].name} · ${interval}`);
  if (tx.status !== "success") return teamId;
  const sub = await findSub(tx.customer?.id, code);
  const subFields = sub ? { subscription_code: sub.subscription_code, email_token: sub.email_token, next_payment_date: sub.next_payment_date } : {};

  if (kind === "marketing") {
    const m = old.marketing || {};
    if (m.subscription_code && sub && m.subscription_code !== sub.subscription_code && m.email_token) {
      await ps("POST", "/subscription/disable", { code: m.subscription_code, token: m.email_token }).catch((e) => console.error("old marketing subscription disable failed", e));
    }
    await saveBilling(teamId, { ...cardPatch(tx, old), marketing: { ...m, provider: "paystack", plan, interval, currency: "NGN", plan_code: code, status: "active", cancel_at: null, ...subFields } });
    await db.from("teams").update({ plan_marketing: plan }).eq("id", teamId);
    return teamId;
  }

  const patch: Any = {
    ...cardPatch(tx, old), provider: "paystack", plan, interval, currency: "NGN", plan_code: code, status: "active", cancel_at: null,
    last_payment_at: tx.paid_at || new Date().toISOString(),
    plan_since: before.plan_transactional === plan && old.plan_since ? old.plan_since : (tx.paid_at || new Date().toISOString()),
    ...subFields,
  };
  // Switching plans: stop the previous subscription so the customer isn't charged twice.
  if (old.subscription_code && patch.subscription_code && old.subscription_code !== patch.subscription_code && old.email_token) {
    await ps("POST", "/subscription/disable", { code: old.subscription_code, token: old.email_token }).catch((e) => console.error("old subscription disable failed", e));
  }
  await saveBilling(teamId, patch, plan);
  return teamId;
}

// Charge the saved Paystack card for credits (auto top-up and "Pay with saved card"). VAT is added if set.
async function paystackCredits(teamId: string, emails: number, amount: number, auto: boolean) {
  const t = await team(teamId);
  const b = t.billing || {};
  if (!b.authorization_code || !b.email) throw new HttpError(400, "There's no saved card. Pay with checkout instead.");
  const vat = vatOf(amount);
  const reference = `top_${auto ? "auto_" : ""}${teamId.slice(0, 8)}_${Date.now().toString(36)}`;
  const metadata = { team_id: teamId, kind: "credits", emails, currency: "NGN", vat, auto };
  const tx = await ps("POST", "/transaction/charge_authorization", { email: b.email, amount: amount + vat, currency: "NGN", authorization_code: b.authorization_code, reference, metadata });
  await applyCharge({ ...tx, reference, currency: "NGN", amount: amount + vat, metadata });
  return tx.status === "success" ? "success" : "failed";
}

async function paystackWebhook(req: Request) {
  const raw = await req.text();
  const sig = req.headers.get("x-paystack-signature") || "";
  if (!PSK || !sig) return json({ error: "invalid signature" }, 401);
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(PSK), { name: "HMAC", hash: "SHA-512" }, false, ["sign"]);
  const mac = Array.from(new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(raw)))).map((x) => x.toString(16).padStart(2, "0")).join("");
  if (mac.length !== sig.length || mac !== sig) return json({ error: "invalid signature" }, 401);
  const evt = JSON.parse(raw), d = evt.data || {};
  try {
    switch (evt.event) {
      case "charge.success":
        await applyCharge(d);
        break;
      case "subscription.create": {
        const teamId = d.customer?.customer_code ? await teamForPaystack(d.customer.customer_code, d.plan?.plan_code) : undefined;
        const info = await planFromCode(d.plan?.plan_code);
        const sub = { subscription_code: d.subscription_code, email_token: d.email_token, next_payment_date: d.next_payment_date, plan_code: d.plan?.plan_code };
        if (teamId && info?.kind === "marketing") await saveBilling(teamId, { marketing: { ...((await team(teamId)).billing?.marketing || {}), ...sub } });
        else if (teamId) await saveBilling(teamId, sub);
        break;
      }
      case "invoice.create":
      case "invoice.update": {
        const code = d.subscription?.subscription_code;
        const next = d.subscription?.next_payment_date;
        if (!code || !next) break;
        const { data: rows } = await db.from("teams").select("id,billing").eq("billing->>subscription_code", code);
        for (const r of rows || []) await saveBilling(r.id, { next_payment_date: next });
        const { data: mk } = await db.from("teams").select("id,billing").eq("billing->marketing->>subscription_code", code);
        for (const r of mk || []) await saveBilling(r.id, { marketing: { ...(r.billing?.marketing || {}), next_payment_date: next } });
        break;
      }
      case "invoice.payment_failed": {
        const teamId = d.customer?.customer_code ? await teamForPaystack(d.customer.customer_code) : undefined;
        if (teamId) await saveBilling(teamId, { status: "past_due" });
        break;
      }
      case "subscription.not_renew":
      case "subscription.disable": {
        const { data: mk } = await db.from("teams").select("id,billing").eq("billing->marketing->>subscription_code", d.subscription_code || "-");
        for (const r of mk || []) {
          const m = r.billing?.marketing || {};
          const end = m.next_payment_date || d.next_payment_date;
          if (end && new Date(end) > new Date()) await saveBilling(r.id, { marketing: { ...m, status: "cancelling", cancel_at: end } });
          else { await saveBilling(r.id, { marketing: { ...m, status: "canceled", plan: "free" } }); await db.from("teams").update({ plan_marketing: "free" }).eq("id", r.id); }
        }
        const { data: rows } = await db.from("teams").select("id,billing").eq("billing->>subscription_code", d.subscription_code || "-");
        for (const r of rows || []) {
          const end = r.billing?.next_payment_date || d.next_payment_date;
          if (end && new Date(end) > new Date()) await saveBilling(r.id, { status: "cancelling", cancel_at: end });
          else await saveBilling(r.id, { status: "canceled", plan: "free" }, "free");
        }
        break;
      }
    }
  } catch (e) {
    console.error("paystack webhook", evt.event, e);
    return json({ received: true, error: String((e as Error).message) }, 500);
  }
  return json({ received: true });
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

// ---------------------------------------------------------------- summary
function subView(b: Any, kind: string) {
  if (!b?.plan || b.plan === "free") return null;
  const cur = b.provider === "paystack" ? "NGN" : "USD";
  const p = catalog(kind)[b.plan];
  return {
    plan: b.plan, interval: b.interval || "monthly", provider: b.provider || null, status: b.status, card: b.card || null, currency: cur,
    price: p ? p[b.interval === "yearly" ? "yearly" : "monthly"][cur] : 0,
    next_payment_date: b.next_payment_date || null, cancel_at: b.cancel_at || null, trial_end: b.trial_end || null,
    can_manage: !!(b.stripe_subscription || b.subscription_code),
  };
}

async function summary(teamId: string, admin: boolean, country?: string | null) {
  const t = await team(teamId);
  const provider = providerOf(t, country);
  const cur = CUR[provider];
  const onStripe = provider === "stripe";
  const { data: invoices } = await db.from("billing_invoices").select("reference,plan,kind,description,amount,currency,status,card,url,tax,paid_at").eq("team_id", teamId).order("created_at", { ascending: false }).limit(50);
  const b = t.billing || {};
  const plan = t.plan_transactional || "free";
  const now = new Date();
  const from = monthStart(now), to = monthStart(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)));
  const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const [used, today, daily, contactsQ, domainsQ, membersQ, tax] = await Promise.all([
    usage(teamId, from),
    usage(teamId, dayStart),
    db.rpc("team_daily_usage", { p_team: teamId, p_from: from.toISOString(), p_to: to.toISOString() }).then((r) => r.data || []),
    db.from("contacts").select("id", { count: "exact", head: true }).eq("team_id", teamId),
    db.from("domains").select("id", { count: "exact", head: true }).eq("team_id", teamId),
    db.from("team_members").select("user_id", { count: "exact", head: true }).eq("team_id", teamId),
    onStripe && SK ? taxReady() : Promise.resolve(false),
  ]);
  const credits = Number(t.credits || 0);
  const value = creditValue(credits, cur);
  const ov = overageCost(plan, used, cur);
  const L = PLAN_LIMITS[plan] || PLAN_LIMITS.free;
  const firstPlanInvoice = (invoices || []).filter((i: Any) => i.status === "success" && i.plan === plan && i.kind !== "credits" && i.kind !== "overage").map((i: Any) => i.paid_at).sort()[0];
  const sub = subView(b, "transactional");
  const msub = subView(b.marketing, "marketing");
  const daysIn = Math.round((to.getTime() - from.getTime()) / 864e5), dayN = Math.min(daysIn, Math.floor((now.getTime() - from.getTime()) / 864e5) + 1);
  const projected = dayN ? Math.round(used / dayN * daysIn) : used;
  const projOver = overageCost(plan, projected, cur);
  const renewal = sub && sub.status === "active" && sub.currency === cur && sub.next_payment_date && new Date(sub.next_payment_date) < to ? sub.price : 0;
  const creditsApplied = Math.min(value, projOver.cost);
  const vat = onStripe ? 0 : vatOf(projOver.cost - creditsApplied);
  const stripeReady = onStripe && b.stripe_mode === MODE;
  return {
    plan,
    plan_marketing: t.plan_marketing || "free",
    admin,
    provider,
    payments_ready: (onStripe ? !!SK : !!PSK) && !paused(),
    payments_paused: paused(),
    mode: onStripe ? MODE : PS_MODE,
    tax_ready: tax,
    currencies: [cur],
    currency: cur,
    plans: Object.entries(PLANS).map(([id, p]) => ({ id, ...p })),
    marketing: Object.entries(MARKETING).map(([id, p]) => ({ id, ...p })),
    packs: PACKS,
    credits,
    credit_value: value,
    credit_rate: CREDIT_RATE,
    min_topup: MIN_TOPUP,
    vat_rate: onStripe ? 0 : VAT_RATE,
    usage: { month: used, today, included: PLANS[plan]?.emails ?? (plan === "free" ? 4000 : 0), day_limit: L.day, contacts: contactsQ.count || 0, ...ov, currency: cur },
    period: { start: from.toISOString(), end: new Date(to.getTime() - 1).toISOString(), day: dayN, days: daysIn, projected, projected_over: projOver.over, projected_cost: projOver.cost },
    daily: (daily as Any[]).map((r) => ({ day: r.day, n: Number(r.n) })),
    limits: {
      domains: { used: domainsQ.count || 0, limit: L.domains },
      members: { used: membersQ.count || 0, limit: L.members },
      contacts: { used: contactsQ.count || 0, limit: MARKETING_CONTACTS[t.plan_marketing || "free"] || 0 },
      retention_days: L.retention_days,
    },
    next_invoice: { date: renewal ? sub!.next_payment_date : to.toISOString(), plan: renewal, plan_currency: cur, overage: projOver.cost, overage_units: Math.ceil(projOver.over / 1000), credits: creditsApplied, vat, total: renewal + projOver.cost - creditsApplied + vat, currency: cur },
    customer_since: t.created_at,
    plan_since: b.plan_since || firstPlanInvoice || (plan === "free" ? t.created_at : null),
    auto_topup: { enabled: false, pack: 1, threshold: DEFAULT_THRESHOLD[cur], ...(b.auto_topup || {}) },
    alerts: { p80: true, p100: true, credits_low: true, ...(b.alerts || {}) },
    spend_cap: b.spend_cap || null,
    card: stripeReady || (!onStripe && b.authorization_code) || sub?.provider === provider ? (b.card || null) : null,
    can_charge_card: onStripe ? !!(stripeReady && b.stripe_pm) : !!(b.authorization_code && b.email),
    has_customer: onStripe ? !!(stripeReady && b.stripe_customer) : !!b.customer_code,
    can_update_card: onStripe ? !!(stripeReady && b.stripe_customer) : !!(b.subscription_code || b.marketing?.subscription_code),
    subscription: sub,
    marketing_subscription: msub,
    // A plan that was bought through the other provider (its provider has been switched off, or the team was moved):
    // the billing page explains what happens next. Moving to Stripe is free until the paid period ends.
    legacy: sub && sub.provider && sub.provider !== provider && sub.status !== "canceled" ? (() => { const ends = sub.cancel_at || sub.next_payment_date; return { plan: sub.plan, from: sub.provider, to: provider, ends, price: sub.price, currency: sub.currency, status: sub.status, switch_free_until: provider === "stripe" && trialEndFor(ends) ? ends : null }; })() : null,
    details: b.details || {},
    invoices: invoices || [],
  };
}

// ---------------------------------------------------------------- crons
// Every 15 minutes: auto top-ups and usage alerts.
async function watchRun() {
  const { data: teams } = await db.from("teams").select("id,name,plan_transactional,credits,billing");
  const out: Any[] = [];
  const now = new Date();
  const tag = `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  for (const t of teams || []) {
    const b = t.billing || {};
    // A cancelled plan that has passed its paid-through date moves to Free. The provider's webhook normally does
    // this at the moment it ends; this catches one that was missed. Stripe is asked for the real state first.
    const lapsed = (x: Any) => x?.status === "cancelling" && x.cancel_at && new Date(x.cancel_at).getTime() < now.getTime() - 6 * 3600e3;
    if (lapsed(b) || lapsed(b.marketing)) {
      try {
        for (const [x, marketing] of [[b, false], [b.marketing, true]] as [Any, boolean][]) {
          if (!lapsed(x)) continue;
          if (x.provider === "stripe" && x.stripe_subscription && b.stripe_mode === MODE) await syncSubscription(x.stripe_subscription);
          else if (marketing) { await saveBilling(t.id, { marketing: { ...x, status: "canceled", plan: "free" } }); await db.from("teams").update({ plan_marketing: "free" }).eq("id", t.id); }
          else await saveBilling(t.id, { status: "canceled", plan: "free" }, "free");
        }
        out.push({ team: t.id, plan_ended: true });
      } catch (e) { out.push({ team: t.id, plan_ended: "error", error: String((e as Error).message) }); }
      continue; // the team row above is stale now; alerts and top-ups run on the next pass
    }
    const provider = providerOf(t);
    const cur = CUR[provider];
    const value = creditValue(Number(t.credits || 0), cur);
    const at = b.auto_topup || {};
    const canCharge = provider === "stripe" ? !!(b.stripe_pm && b.stripe_mode === MODE) : !!(b.authorization_code && b.email);
    if (at.enabled && canCharge && value < Number(at.threshold ?? DEFAULT_THRESHOLD[cur])) {
      const last = at.last_attempt ? new Date(at.last_attempt).getTime() : 0;
      if (now.getTime() - last > 3600e3) {
        const pack = PACKS[Number(at.pack ?? 1)] || PACKS[1];
        await saveBilling(t.id, { auto_topup: { ...at, last_attempt: now.toISOString() } });
        try { out.push({ team: t.id, topup: provider === "stripe" ? await chargeCredits(t.id, pack.emails, pack.price.USD, true) : await paystackCredits(t.id, pack.emails, pack.price.NGN, true) }); }
        catch (e) { out.push({ team: t.id, topup: "error", error: String((e as Error).message) }); }
      }
    }
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
    const lowAt = Number(at.threshold ?? DEFAULT_THRESHOLD[cur]);
    if (al.credits_low && Number(t.credits || 0) > 0 && value < lowAt && !at.enabled && !sent.kinds.includes("credits_low")) fire.push("credits_low");
    if (!fire.length) continue;
    const to = b.details?.email || b.email;
    const from = env("SYSTEM_FROM");
    if (to && from) {
      for (const k of fire) {
        const subject = k === "credits_low" ? `${t.name}: Delivrie credits are running low` : `${t.name}: you've used ${k === "p100" ? "all" : "80%"} of this month's ${p!.emails.toLocaleString("en-US")} emails`;
        const text = k === "credits_low" ? `You have ${fmt(value, cur)} of credit left (about ${Number(t.credits).toLocaleString("en-US")} emails). Top up or turn on auto top-up: ${APP_URL}/billing/credits`
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

// 1st of the month: last month's overage for every paid team. Credits pay first; the rest goes on the saved card.
// Safe to re-run: credits are taken once per team-month and Stripe calls carry idempotency keys.
async function overageRun() {
  const from = monthStart(new Date(), 1), to = monthStart();
  const tag = `${from.getUTCFullYear()}${String(from.getUTCMonth() + 1).padStart(2, "0")}`;
  const { data: teams } = await db.from("teams").select("id,name,plan_transactional,plan_marketing,credits,billing").in("plan_transactional", Object.keys(PLANS));
  const results: Any[] = [];
  for (const t of teams || []) {
    const b = t.billing || {};
    const provider = providerOf(t);
    const cur = CUR[provider];
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
    const { data: done } = provider === "stripe"
      ? await db.from("billing_invoices").select("status").eq("team_id", t.id).eq("kind", "overage").like("reference", "in_%").gte("paid_at", to.toISOString()).eq("status", "success").limit(1)
      : await db.from("billing_invoices").select("status").eq("reference", reference).eq("status", "success").limit(1);
    if (done?.length) continue;
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
          await recordInvoice({ team_id: t.id, reference: creditRef, kind: "overage", plan: t.plan_transactional, description: `${lines.join(" · ")} · paid from credits (${n.toLocaleString("en-US")} emails)`, amount: apply, currency: cur, status: "success" });
        }
      }
    }
    amount = Math.max(0, amount - fromCredits);
    if (!amount) { results.push({ team: t.id, credits: fromCredits, status: "paid_from_credits" }); continue; }
    if (fromCredits) lines.push("credits applied");
    if (provider === "paystack") {
      amount += vatOf(amount);
      if (VAT_RATE) lines.push(`incl. VAT ${VAT_RATE}%`);
    }
    const canCharge = provider === "stripe" ? !!(b.stripe_pm && b.stripe_mode === MODE) : !!(b.authorization_code && b.email);
    if (!canCharge) {
      await recordInvoice({ team_id: t.id, reference, kind: "overage", plan: t.plan_transactional, description: lines.join(" · ") + " (no saved card)", amount, currency: cur, status: "failed" });
      results.push({ team: t.id, amount, status: "no_card" });
      continue;
    }
    if (provider === "paystack") {
      try {
        const metadata = { team_id: t.id, kind: "overage", description: lines.join(" · ") };
        const tx = await ps("POST", "/transaction/charge_authorization", { email: b.email, amount, currency: "NGN", authorization_code: b.authorization_code, reference, metadata });
        await applyCharge({ ...tx, reference, currency: "NGN", amount, metadata });
        results.push({ team: t.id, amount, status: tx.status });
      } catch (e) {
        results.push({ team: t.id, amount, status: "error", error: String((e as Error).message) });
      }
      continue;
    }
    try {
      const inv = await chargeInvoice(t.id, [{ amount, description: `Overage ${tag.slice(0, 4)}-${tag.slice(4)}: ${lines.join(" · ")}` }], { kind: "overage", plan: t.plan_transactional, description: lines.join(" · "), month: tag }, `overage-${tag}-${t.id}`);
      await applyInvoice(inv);
      results.push({ team: t.id, amount, status: inv.status });
    } catch (e) {
      results.push({ team: t.id, amount, status: "error", error: String((e as Error).message) });
    }
  }
  return { month: tag, charged: results };
}

// ---------------------------------------------------------------- routes
async function cronAuth(req: Request) {
  const secret = await setting("cron_secret");
  if (!secret || req.headers.get("x-cron-secret") !== secret) throw new HttpError(401, "Unauthorized");
}

// Every object Delivrie creates in Stripe (customers, prices, checkouts, subscriptions, invoices) carries
// metadata app=delivrie. The Stripe account may also serve other products, and Stripe sends their events to this
// webhook too: anything tagged for another app is ignored, and untagged objects are only handled when they belong
// to a known Delivrie team (objects made before the tag existed).
const APP_TAG = { app: "delivrie" } as const;
const otherApp = (o: Any) => !!o?.metadata?.app && o.metadata.app !== APP_TAG.app;

async function stripeWebhook(req: Request) {
  const raw = await req.text();
  if (!(await verifyStripeSignature(raw, req.headers.get("stripe-signature") || "", WHSEC))) {
    // Says which part is wrong (never the secret itself), so a bad setup is easy to spot in the logs.
    const sig = req.headers.get("stripe-signature") || "";
    console.error("stripe webhook rejected:", !WHSEC ? "STRIPE_WEBHOOK_SECRET is not set" : !WHSEC.startsWith("whsec_") ? "STRIPE_WEBHOOK_SECRET doesn't start with whsec_ (wrong value pasted?)" : !sig ? "no Stripe-Signature header" : "signature doesn't match: the secret is from a different webhook destination or mode");
    return json({ error: "invalid signature" }, 400);
  }
  const evt = JSON.parse(raw);
  const o = evt.data?.object || {};
  if (MODE && (evt.livemode ? "live" : "test") !== MODE) return json({ received: true, ignored: "other mode" });
  if (otherApp(o) || otherApp(o.subscription_details) || otherApp(o.parent?.subscription_details)) return json({ received: true, ignored: "other app" });
  try {
    switch (evt.type) {
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded":
        await applySession(o.id);
        break;
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted":
        await syncSubscription(o.id);
        break;
      case "invoice.paid":
      case "invoice.payment_failed":
        await applyInvoice(o.id);
        break;
      case "payment_method.attached":
      case "customer.updated": {
        // Card changed in the customer portal: keep the label and default in step.
        if (evt.type === "payment_method.attached" && !o.customer) break;
        const cus = evt.type === "customer.updated" ? o : await stripe("GET", `/customers/${o.customer}`);
        const teamId = cus.metadata?.team_id || await teamForCustomer(cus.id);
        const pmId = cus.invoice_settings?.default_payment_method;
        if (teamId && pmId) { const pm = await stripe("GET", `/payment_methods/${pmId}`); await saveBilling(teamId, { stripe_pm: pm.id, card: cardLabel(pm.card) }); }
        break;
      }
    }
  } catch (e) {
    console.error("stripe webhook", evt.type, e);
    return json({ received: true, error: String((e as Error).message) }, 500); // Stripe retries
  }
  return json({ received: true });
}

async function handle(req: Request, path: string): Promise<Response> {
  await loadFlags();
  if (path === "/stripe/webhook" && req.method === "POST") return stripeWebhook(req);
  if (path === "/webhook" && req.method === "POST") return paystackWebhook(req);
  if (path === "/cron/overage" && req.method === "POST") { await cronAuth(req); return json(await overageRun()); }
  if (path === "/cron/watch" && req.method === "POST") { await cronAuth(req); return json(await watchRun()); }
  if (path === "/cron/health" && req.method === "POST") {
    // For delivrie.io/status: can we reach Stripe and Paystack with our keys? Says test or live, never the keys.
    await cronAuth(req);
    const check = async (on: boolean, mode: string | null, call: () => Promise<unknown>) => {
      if (!on) return { ok: false, configured: false };
      const t0 = Date.now();
      try { await call(); return { ok: true, configured: true, mode, latency_ms: Date.now() - t0 }; }
      catch (e) { return { ok: false, configured: true, mode, error: (e as Error).message.slice(0, 200) }; }
    };
    const [st, pk] = await Promise.all([
      check(!!SK, MODE, () => stripe("GET", "/products", { limit: 1 })),
      check(!!PSK, PS_MODE, () => ps("GET", "/bank?currency=NGN&perPage=1")),
    ]);
    const used = [st, pk].filter((x) => x.configured);
    return json({ ok: used.length > 0 && used.every((x) => x.ok), configured: used.length > 0, mode: MODE, webhook: !!WHSEC, stripe: st, paystack: pk });
  }
  if (path === "/geo" && req.method === "GET") {
    // Which provider a new team here would get. Country only, from Vercel's geolocation via middleware.js.
    const cc = (req.headers.get("x-dlv-country") || "").toUpperCase().slice(0, 2) || null;
    return json({ country: cc, provider: providerOf(null, cc), currency: CUR[providerOf(null, cc)], enabled: { stripe: FLAGS.stripe, paystack: FLAGS.paystack } });
  }
  const a = await auth(req);
  const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
  // Set by middleware.js from Vercel's geolocation; only used before a team has paid with either provider.
  const country = (req.headers.get("x-dlv-country") || "").toUpperCase().slice(0, 2) || null;
  const view = () => summary(a.teamId, a.admin, country);

  if (path === "/summary" && req.method === "GET") return json(await view());

  if (path === "/checkout" && req.method === "POST") {
    requireAdmin(a);
    const kind = body.kind === "marketing" ? "marketing" : "transactional";
    const plan = String(body.plan || "");
    const interval = INTERVALS.includes(body.interval) ? body.interval : "monthly";
    const p = catalog(kind)[plan];
    if (!p) throw new HttpError(400, kind === "marketing" ? "Choose Growth or Pro marketing." : "Choose Starter, Pro or Scale.");
    const t = await team(a.teamId);
    const cur = kind === "marketing" ? (t.billing?.marketing || {}) : (t.billing || {});
    const current = kind === "marketing" ? t.plan_marketing : t.plan_transactional;
    assertOpen();
    if (providerOf(t, country) === "paystack") {
      if (current === plan && cur.status === "active" && cur.provider === "paystack" && (cur.interval || "monthly") === interval) throw new HttpError(400, `You're already on ${p.name}.`);
      // A plan still running on Stripe can't be bought again in Naira without paying twice for the same days.
      if (cur.provider === "stripe" && runningSub(cur)) {
        const until = cur.cancel_at || cur.next_payment_date;
        const when = until ? new Date(until).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "the end of its billing period";
        throw new HttpError(400, cur.status === "cancelling" ? `Your current plan is paid until ${when}. You can choose a new plan in Naira after that.` : `Your current plan renews through Stripe. Cancel it under Payment methods, then choose a new plan in Naira when it ends on ${when}.`);
      }
      const code = await planCode(kind, plan, interval);
      const init = await ps("POST", "/transaction/initialize", {
        email: t.billing?.details?.email || t.billing?.email || a.user.email,
        amount: p[interval as "monthly" | "yearly"].NGN, currency: "NGN", plan: code,
        callback_url: `${APP_URL}/billing`,
        metadata: { team_id: a.teamId, kind, plan, interval, currency: "NGN", user_id: a.user.id, cancel_action: `${APP_URL}/billing?canceled=1` },
      });
      return json({ url: init.authorization_url, reference: init.reference });
    }
    const onStripe = cur.provider === "stripe" && cur.stripe_subscription && ["active", "cancelling", "past_due"].includes(cur.status);
    if (onStripe && current === plan && (cur.interval || "monthly") === interval && cur.status === "active") throw new HttpError(400, `You're already on ${p.name}.`);
    const price = await priceId(kind, plan, interval);

    // Already subscribed on Stripe: change the plan in place. The difference is charged (or credited) now.
    if (onStripe) {
      const sub = await stripe("GET", `/subscriptions/${cur.stripe_subscription}`);
      const item = sub.items.data[0];
      const updated = await stripe("POST", `/subscriptions/${sub.id}`, {
        items: [{ id: item.id, price }], proration_behavior: "always_invoice", payment_behavior: "error_if_incomplete",
        cancel_at_period_end: false, metadata: { team_id: a.teamId, kind, plan, interval, ...APP_TAG },
      }, `change-${sub.id}-${price}-${Date.now().toString(36)}`);
      await syncSubscription(updated.id);
      return json({ changed: true, ...(await view()) });
    }

    const customer = await customerFor(a.teamId, a.user.email);
    const tax = await taxReady();
    const meta = { team_id: a.teamId, kind, plan, interval, ...APP_TAG };
    // Continuing a Naira (Paystack) plan in dollars: Stripe starts charging when the paid Naira period ends.
    const trialEnd = cur.provider === "paystack" && ["active", "cancelling"].includes(cur.status) && cur.plan && cur.plan !== "free" ? trialEndFor(cur.cancel_at || cur.next_payment_date) : null;
    const s = await stripe("POST", "/checkout/sessions", {
      mode: "subscription", customer, client_reference_id: a.teamId,
      line_items: [{ price, quantity: 1 }],
      success_url: `${APP_URL}/billing?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${APP_URL}/billing?canceled=1`,
      metadata: meta,
      subscription_data: { metadata: meta, ...(trialEnd ? { trial_end: trialEnd } : {}) },
      automatic_tax: { enabled: tax },
      // The billing address is always collected and saved: Stripe needs it for tax IDs and Stripe Tax, and it
      // goes on receipts.
      customer_update: { address: "auto", name: "auto" }, billing_address_collection: "required",
      tax_id_collection: { enabled: true },
    });
    return json({ url: s.url });
  }

  // Top up credits: a pack or a custom amount; saved card (charged now), or Stripe Checkout.
  if ((path === "/topup" || path === "/credits") && req.method === "POST") {
    requireAdmin(a);
    assertOpen();
    const t = await team(a.teamId);
    const provider = providerOf(t, country);
    const currency = CUR[provider];
    let amount: number, emails: number;
    if (body.pack != null && body.pack !== "custom") {
      const pack = PACKS[Number(body.pack)];
      if (!pack) throw new HttpError(400, "Choose a credit pack.");
      amount = pack.price[currency]; emails = pack.emails;
    } else {
      amount = Math.round(Number(body.amount) * 100);
      if (!isFinite(amount) || amount < MIN_TOPUP[currency]) throw new HttpError(400, `The minimum top-up is ${fmt(MIN_TOPUP[currency], currency)}.`);
      if (amount > MAX_TOPUP[currency]) throw new HttpError(400, "That's above the largest top-up. Talk to sales for bigger volumes.");
      emails = emailsFor(amount, currency);
    }
    if (body.auto && typeof body.auto === "object") {
      const pack = Number(body.auto.pack ?? body.pack ?? 1);
      await saveBilling(a.teamId, { auto_topup: { ...(t.billing?.auto_topup || {}), enabled: !!body.auto.enabled, pack: PACKS[pack] ? pack : 1, threshold: Math.max(0, Math.round(Number(body.auto.threshold ?? DEFAULT_THRESHOLD[currency] / 100) * 100)) } });
    }
    const b = t.billing || {};
    if (provider === "paystack") {
      const method = ["card", "bank_transfer", "ussd"].includes(body.method) ? body.method : "checkout";
      if (method === "card" && b.authorization_code) {
        const status = await paystackCredits(a.teamId, emails, amount, false);
        if (status !== "success") throw new HttpError(402, "Your card was declined. Try checkout instead.");
        return json({ status, emails, ...(await view()) });
      }
      const vat = vatOf(amount);
      const init = await ps("POST", "/transaction/initialize", {
        email: b.details?.email || b.email || a.user.email, amount: amount + vat, currency: "NGN",
        ...(method === "bank_transfer" || method === "ussd" ? { channels: [method] } : {}),
        callback_url: `${APP_URL}/billing/credits`,
        metadata: { team_id: a.teamId, kind: "credits", emails, currency: "NGN", vat, user_id: a.user.id, cancel_action: `${APP_URL}/billing/credits?canceled=1` },
      });
      return json({ url: init.authorization_url, reference: init.reference });
    }
    if (body.method === "card" && b.stripe_pm && b.stripe_mode === MODE) {
      const status = await chargeCredits(a.teamId, emails, amount, false);
      if (status !== "success") throw new HttpError(402, "Your card was declined. Try checkout with another card.");
      return json({ status, emails, ...(await view()) });
    }
    const customer = await customerFor(a.teamId, a.user.email);
    const tax = await taxReady();
    const ref = `cs_ref_${a.teamId.slice(0, 8)}_${Date.now().toString(36)}`;
    const meta = { team_id: a.teamId, kind: "credits", emails: String(emails), ref, ...APP_TAG };
    const s = await stripe("POST", "/checkout/sessions", {
      mode: "payment", customer, client_reference_id: a.teamId,
      line_items: [{ quantity: 1, price_data: { currency: "usd", unit_amount: amount, tax_behavior: "exclusive", product_data: { name: `Delivrie credits · ${emails.toLocaleString("en-US")} emails` } } }],
      success_url: `${APP_URL}/billing/credits?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${APP_URL}/billing/credits?canceled=1`,
      metadata: meta,
      payment_intent_data: { setup_future_usage: "off_session", metadata: meta },
      invoice_creation: { enabled: true, invoice_data: { metadata: { ...meta, via: "checkout" } } },
      automatic_tax: { enabled: tax },
      customer_update: { address: "auto", name: "auto" }, billing_address_collection: "required",
      tax_id_collection: { enabled: true },
    });
    return json({ url: s.url });
  }

  if (path === "/verify" && req.method === "POST") {
    if (body.reference) {
      const ref = String(body.reference);
      const tx = await ps("GET", `/transaction/verify/${encodeURIComponent(ref)}`);
      const meta = parseMeta(tx.metadata);
      if (meta.team_id && meta.team_id !== a.teamId) throw new HttpError(403, "This payment belongs to a different team.");
      if (tx.status === "success") await applyCharge(tx);
      return json({ status: tx.status, kind: meta.kind || "transactional", ...(await view()) });
    }
    const id = String(body.session_id || "");
    if (!/^cs_(test|live)_[A-Za-z0-9]+$/.test(id)) throw new HttpError(400, "Missing checkout session.");
    const r = await applySession(id, a.teamId);
    return json({ status: r.status, kind: r.kind || "transactional", ...(await view()) });
  }

  // Stripe's customer portal: update the card, download receipts, edit billing details and tax IDs.
  if ((path === "/portal" || path === "/card") && req.method === "POST") {
    requireAdmin(a);
    const t = await team(a.teamId);
    // The card on a running plan is managed where that plan is billed, even if that provider is off for new payments.
    const where: Provider = runningSub(t.billing) && !t.billing.provider_override ? t.billing.provider : providerOf(t, country);
    if (where === "paystack") {
      // Paystack has no customer portal; its subscription page lets the customer change the card on a plan.
      const code = t.billing?.subscription_code || t.billing?.marketing?.subscription_code;
      if (!code) throw new HttpError(400, "Your card is saved when you next pay. To use a different card, top up or subscribe with it.");
      const d = await ps("GET", `/subscription/${code}/manage/link`);
      return json({ url: d.link });
    }
    if (!t.billing?.stripe_customer || t.billing.stripe_mode !== MODE) throw new HttpError(400, "Add a card by upgrading or topping up first.");
    try {
      const s = await stripe("POST", "/billing_portal/sessions", {
        customer: t.billing.stripe_customer, return_url: `${APP_URL}/billing/payment-methods`,
        ...(body.flow === "card" || path === "/card" ? { flow_data: { type: "payment_method_update" } } : {}),
      });
      return json({ url: s.url });
    } catch (e) {
      if (/configuration/i.test((e as Error).message)) throw new HttpError(503, "The billing portal isn't set up yet. Save the customer portal settings in the Stripe dashboard.");
      throw e;
    }
  }

  if (path === "/cancel" && req.method === "POST") {
    requireAdmin(a);
    const t = await team(a.teamId);
    const marketing = body.kind === "marketing";
    const b = marketing ? (t.billing?.marketing || {}) : (t.billing || {});
    if (b.provider === "stripe" && b.stripe_subscription) {
      await stripe("POST", `/subscriptions/${b.stripe_subscription}`, { cancel_at_period_end: true });
      await syncSubscription(b.stripe_subscription);
      await auditLog(a.teamId, a.user, "billing.plan_cancelled", t.name, { kind: marketing ? "marketing" : "transactional", plan: b.plan, provider: "stripe" }, req);
      return json(await view());
    }
    if (b.subscription_code && b.email_token) {
      await ps("POST", "/subscription/disable", { code: b.subscription_code, token: b.email_token });
      const end = b.next_payment_date || new Date().toISOString();
      if (marketing) await saveBilling(a.teamId, { marketing: { ...b, status: "cancelling", cancel_at: end } });
      else await saveBilling(a.teamId, { status: "cancelling", cancel_at: end });
      await auditLog(a.teamId, a.user, "billing.plan_cancelled", t.name, { kind: marketing ? "marketing" : "transactional", plan: b.plan, provider: "paystack" }, req);
      return json(await view());
    }
    throw new HttpError(400, "There's no active subscription to cancel.");
  }

  if (path === "/settings" && req.method === "POST") {
    requireAdmin(a);
    const t = await team(a.teamId);
    const b = t.billing || {};
    const provider = providerOf(t, country);
    const patch: Any = {};
    if (body.auto_topup) {
      const x = body.auto_topup, pack = Number(x.pack ?? b.auto_topup?.pack ?? 1);
      const saved = provider === "stripe" ? !!(b.stripe_pm && b.stripe_mode === MODE) : !!(b.authorization_code && b.email);
      if (x.enabled && !saved) throw new HttpError(400, "Auto top-up needs a saved card. Top up once with a card first.");
      patch.auto_topup = { ...(b.auto_topup || {}), enabled: !!x.enabled, pack: PACKS[pack] ? pack : 1, threshold: x.threshold != null ? Math.max(0, Math.round(Number(x.threshold) * 100)) : (b.auto_topup?.threshold ?? DEFAULT_THRESHOLD[CUR[provider]]) };
    }
    if (body.alerts) patch.alerts = { ...(b.alerts || {}), ...Object.fromEntries(["p80", "p100", "credits_low"].filter((k) => k in body.alerts).map((k) => [k, !!body.alerts[k]])) };
    await saveBilling(a.teamId, patch);
    await auditLog(a.teamId, a.user, "billing.settings_updated", t.name, { changed: Object.keys(patch), ...(patch.auto_topup ? { auto_topup: patch.auto_topup.enabled } : {}) }, req);
    return json(await view());
  }

  if (path === "/cap" && req.method === "POST") {
    requireAdmin(a);
    const v = body.amount == null || body.amount === "" ? null : Math.round(Number(body.amount) * 100);
    if (v != null && (!isFinite(v) || v < 0)) throw new HttpError(400, "Enter a positive amount, or leave it empty for no cap.");
    await saveBilling(a.teamId, { spend_cap: v || null });
    await auditLog(a.teamId, a.user, "billing.spending_cap_set", null, { amount: v || null }, req);
    return json(await view());
  }

  if (path === "/details" && req.method === "POST") {
    requireAdmin(a);
    const clip = (v: unknown, n = 200) => String(v ?? "").trim().slice(0, n);
    const email = clip(body.email, 254);
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(400, "Enter a valid billing email.");
    const t = await team(a.teamId);
    const next: Any = { ...(t.billing?.details || {}) };
    // Naira invoices show the address and tax ID saved here; Stripe keeps its own in the customer portal.
    for (const k of ["name", "country", "state", "address", "city", "postal_code", "tax_id_type", "tax_id"]) if (k in body) next[k] = clip(body[k]);
    if ("email" in body) next.email = email;
    await saveBilling(a.teamId, { details: next });
    await auditLog(a.teamId, a.user, "billing.details_updated", t.name, { changed: Object.keys(body).filter((k) => k !== "tax_id") }, req);
    if (email && t.billing?.stripe_customer && t.billing.stripe_mode === MODE) await stripe("POST", `/customers/${t.billing.stripe_customer}`, { email }).catch((e) => console.error("customer email", e.message));
    return json(await view());
  }

  throw new HttpError(404, "Not found");
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
