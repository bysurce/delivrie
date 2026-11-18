// Delivrie billing on Stripe, in US dollars: Starter/Pro/Scale (monthly or yearly), the marketing add-on,
// pay-as-you-go credits and month-end overage. Stripe Tax adds sales tax/VAT where it applies.
//
// Routes (served at https://delivrie.io/api/billing/* via a Vercel rewrite):
//   GET  /summary         plan, prices, subscription and invoices for the current team
//   POST /checkout        { plan, interval, kind? } -> Stripe Checkout URL; with a Stripe subscription already
//                         running, the plan changes in place (the difference is charged or credited now)
//   POST /topup           { pack | amount, method: card|checkout, auto? } -> credits (saved card is charged
//                         directly through an invoice; otherwise a Checkout URL). /credits is an alias.
//   POST /verify          { session_id } -> applies a finished Checkout (the webhook does the same)
//   POST /portal          { flow?: "card" } -> Stripe customer portal (card, receipts, billing details)
//   POST /cancel          { kind? } -> stop renewing; the plan stays until the paid period ends
//   POST /settings        { auto_topup?: { enabled, pack, threshold }, alerts?: { p80, p100, credits_low } }
//   POST /cap             { amount } -> monthly overage spending cap in USD (empty clears it)
//   POST /details         { email } -> billing email (also set on the Stripe customer)
//   POST /stripe/webhook  Stripe events (Stripe-Signature, STRIPE_WEBHOOK_SECRET)
//   POST /cron/watch      auto top-ups and usage alert emails (pg_cron every 15 minutes, x-cron-secret)
//   POST /cron/overage    month-end overage charges (pg_cron, x-cron-secret)
//   POST /cron/health     can we reach Stripe? (status page, x-cron-secret)
//   POST /webhook         Paystack events: only to wind down subscriptions that started on Paystack in naira
//
// Secrets: STRIPE_SECRET_KEY (sk_test_… or sk_live_…), STRIPE_WEBHOOK_SECRET (whsec_…), APP_URL, SYSTEM_FROM,
// PAYSTACK_SECRET_KEY (legacy, until the last naira subscription has ended).
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
const APP_URL = (env("APP_URL") || "https://delivrie.io").replace(/\/$/, "");
const STRIPE_VERSION = "2024-06-20";

// Prices follow the pricing page, in cents. Objects keep a currency key so the dashboard reads p.monthly.USD.
type Price = Record<string, number>;
export const PLANS: Record<string, { name: string; emails: number; monthly: Price; yearly: Price; overage: Price }> = {
  starter: { name: "Starter", emails: 20_000, monthly: { USD: 10_00 }, yearly: { USD: 100_00 }, overage: { USD: 45 } },
  pro: { name: "Pro", emails: 60_000, monthly: { USD: 20_00 }, yearly: { USD: 200_00 }, overage: { USD: 45 } },
  scale: { name: "Scale", emails: 100_000, monthly: { USD: 45_00 }, yearly: { USD: 450_00 }, overage: { USD: 40 } },
};
// Marketing add-on, priced by contacts. "free" (Starter, 1,000 contacts) needs no subscription.
export const MARKETING: Record<string, { name: string; contacts: number; monthly: Price; yearly: Price; extra?: Price }> = {
  growth: { name: "Growth", contacts: 5_000, monthly: { USD: 20_00 }, yearly: { USD: 200_00 } },
  pro: { name: "Pro marketing", contacts: 10_000, monthly: { USD: 40_00 }, yearly: { USD: 400_00 }, extra: { USD: 3_50 } },
};
// Pay-as-you-go credit packs: one credit sends one email. Credits never expire.
export const PACKS: { emails: number; price: Price; note?: string }[] = [
  { emails: 8_300, price: { USD: 5_00 }, note: "Minimum" },
  { emails: 41_600, price: { USD: 25_00 } },
  { emails: 172_400, price: { USD: 100_00 }, note: "Save 3%" },
  { emails: 925_900, price: { USD: 500_00 }, note: "Save 10%" },
];
// What naira subscribers who started on Paystack pay until they move to USD (shown on their billing page only).
const LEGACY_NGN: Record<string, { monthly: number; yearly: number }> = {
  starter: { monthly: 10_000_00, yearly: 100_000_00 }, pro: { monthly: 27_000_00, yearly: 270_000_00 }, scale: { monthly: 45_000_00, yearly: 450_000_00 },
  growth: { monthly: 20_000_00, yearly: 200_000_00 },
};
// Credits are stored as emails; their value uses the pay-as-you-go rate of $0.60 per 1,000 emails.
const CREDIT_RATE = 0.06; // cents per email
const creditValue = (emails: number) => Math.floor(emails * CREDIT_RATE);
const emailsFor = (amount: number) => Math.floor(amount / CREDIT_RATE);
const MIN_TOPUP = 5_00, MAX_TOPUP = 10_000_00, DEFAULT_THRESHOLD = 2_00;
const PLAN_LIMITS: Record<string, { domains: number; members: number; retention_days: number; day: number }> = {
  free: { domains: 1, members: 1, retention_days: 30, day: 133 },
  starter: { domains: 10, members: 5, retention_days: 30, day: 0 },
  pro: { domains: 10, members: 5, retention_days: 30, day: 0 },
  scale: { domains: 1000, members: 0, retention_days: 30, day: 0 },
};
const MARKETING_CONTACTS: Record<string, number> = { free: 1_000, growth: 5_000, pro: 10_000 };
const INTERVALS = ["monthly", "yearly"];
const catalog = (kind: string) => (kind === "marketing" ? MARKETING : PLANS) as Record<string, { name: string; monthly: Price; yearly: Price }>;
const usd = (n: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: n % 100 ? 2 : 0 }).format(n / 100);

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
      product_data: { name, metadata: { kind, plan } },
      metadata: { kind, plan, interval },
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
}

// One Stripe customer per team (per mode, so test and live never mix).
async function customerFor(teamId: string, fallbackEmail?: string) {
  const t = await team(teamId);
  const b = t.billing || {};
  if (b.stripe_customer && b.stripe_mode === MODE) return b.stripe_customer as string;
  const c = await stripe("POST", "/customers", { email: b.details?.email || b.email || fallbackEmail, name: t.name, metadata: { team_id: teamId } }, `customer-${MODE}-${teamId}`);
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
  await db.from("billing_invoices").upsert({ currency: "USD", paid_at: new Date().toISOString(), ...row }, { onConflict: "reference" });
  return prev?.status === "success"; // already applied before
}

// Credits are applied once per payment reference, however many times the webhook or /verify sees it.
async function applyCredits(teamId: string, reference: string, emails: number, amount: number, opts: { auto?: boolean; url?: string | null; tax?: number; card?: string | null; status?: string }) {
  const ok = (opts.status || "success") === "success";
  const done = await recordInvoice({ team_id: teamId, reference, kind: "credits", plan: null, description: `${opts.auto ? "Auto top-up" : "Credit top-up"} · ${emails.toLocaleString("en-US")} emails`, amount, status: ok ? "success" : "failed", card: opts.card, url: opts.url, tax: opts.tax });
  if (ok && !done && emails > 0) await db.rpc("add_credits", { p_team: teamId, p_n: emails });
}

// Make the card from a payment the default for invoices (auto top-ups, overage, renewals).
async function rememberCard(teamId: string, customer: string, pm: Any) {
  if (!pm?.id) return;
  await stripe("POST", `/customers/${customer}`, { invoice_settings: { default_payment_method: pm.id } }).catch((e) => console.error("default card", e.message));
  await saveBilling(teamId, { stripe_pm: pm.id, card: cardLabel(pm.card) || "Card", provider_card: "stripe" });
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
  const b = t.billing || {};
  const cur = kind === "marketing" ? (b.marketing || {}) : b;
  // Ignore events for a subscription that has since been replaced by a newer one.
  if (cur.stripe_subscription && cur.stripe_subscription !== sub.id && sub.status !== "active" && sub.status !== "trialing") return teamId;
  const state = subState(sub);
  if (state === "incomplete") return teamId;
  const end = periodEnd(sub);
  const fields: Any = {
    provider: "stripe", stripe_subscription: sub.id, plan: state === "canceled" ? "free" : plan, interval, currency: "USD",
    status: state, next_payment_date: end, cancel_at: state === "cancelling" ? (sub.cancel_at ? new Date(sub.cancel_at * 1000).toISOString() : end) : null,
    trial_end: sub.status === "trialing" && sub.trial_end ? new Date(sub.trial_end * 1000).toISOString() : null,
  };
  if (sub.default_payment_method?.card) Object.assign(fields, { card: cardLabel(sub.default_payment_method.card) });
  if (kind === "marketing") {
    await saveBilling(teamId, { marketing: { ...(b.marketing || {}), ...fields, subscription_code: null, email_token: null } });
    await db.from("teams").update({ plan_marketing: state === "canceled" ? "free" : plan }).eq("id", teamId);
  } else {
    const newPlan = state === "canceled" ? "free" : plan;
    fields.plan_since = t.plan_transactional === newPlan && b.plan_since ? b.plan_since : new Date().toISOString();
    // Moving off Paystack: stop the naira subscription so it never renews.
    if (b.provider === "paystack" && b.subscription_code && b.email_token && state !== "canceled") {
      await ps("POST", "/subscription/disable", { code: b.subscription_code, token: b.email_token }).catch((e) => console.error("paystack disable", e.message));
      Object.assign(fields, { subscription_code: null, email_token: null, authorization_code: null, plan_code: null });
    }
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
  const base = { customer: b.stripe_customer, collection_method: "charge_automatically", auto_advance: false, default_payment_method: b.stripe_pm, pending_invoice_items_behavior: "exclude", metadata: { team_id: teamId, ...metadata }, description: lines.map((l) => l.description).join(" · ") };
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

// ---------------------------------------------------------------- Paystack (legacy: naira subscriptions only)
async function ps(method: string, path: string, body?: unknown): Promise<Any> {
  if (!PSK) throw new HttpError(503, "Paystack isn't configured.");
  const r = await fetch("https://api.paystack.co" + path, { method, headers: { authorization: `Bearer ${PSK}`, "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.status === false) throw new HttpError(r.status >= 500 ? 502 : 400, String(j.message || `Paystack returned ${r.status}`));
  return j.data;
}
async function paystackPlan(code?: string | null) {
  if (!code) return null;
  const v = await setting(`paystack_code:${code}`);
  if (!v) return null;
  const parts = v.split(":");
  if (parts.length === 2) return { kind: "transactional", plan: parts[0], interval: "monthly" };
  return { kind: parts[0], plan: parts[1], interval: parts[2] };
}
// Renewals of naira subscriptions that haven't moved to Stripe yet are still recorded.
async function paystackCharge(tx: Any) {
  const code = tx.plan_object?.plan_code || tx.plan?.plan_code || (typeof tx.plan === "string" && tx.plan ? tx.plan : null);
  const info = await paystackPlan(code);
  if (!info) return;
  const { data } = await db.from("teams").select("id,billing").eq("billing->>customer_code", tx.customer?.customer_code || "-").limit(1);
  const teamId = data?.[0]?.id;
  if (!teamId) return;
  await recordInvoice({ team_id: teamId, reference: tx.reference, kind: info.kind, plan: info.plan, description: `${catalog(info.kind)[info.plan]?.name || info.plan} · ${info.interval}`, amount: tx.amount, currency: tx.currency, status: tx.status === "success" ? "success" : "failed", card: tx.authorization?.last4 ? `${tx.authorization.brand || "Card"} •••• ${tx.authorization.last4}` : null, paid_at: tx.paid_at });
}
async function paystackWebhook(req: Request) {
  const raw = await req.text();
  const sig = req.headers.get("x-paystack-signature") || "";
  if (!PSK || !sig) return json({ error: "invalid signature" }, 401);
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(PSK), { name: "HMAC", hash: "SHA-512" }, false, ["sign"]);
  const mac = Array.from(new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(raw)))).map((x) => x.toString(16).padStart(2, "0")).join("");
  if (mac !== sig) return json({ error: "invalid signature" }, 401);
  const evt = JSON.parse(raw), d = evt.data || {};
  try {
    if (evt.event === "charge.success") await paystackCharge(d);
    if (evt.event === "invoice.update" || evt.event === "invoice.create") {
      const { data } = await db.from("teams").select("id").eq("billing->>subscription_code", d.subscription?.subscription_code || "-");
      for (const r of data || []) if (d.subscription?.next_payment_date) await saveBilling(r.id, { next_payment_date: d.subscription.next_payment_date });
    }
    if (evt.event === "subscription.not_renew" || evt.event === "subscription.disable") {
      const { data: rows } = await db.from("teams").select("id,billing").eq("billing->>subscription_code", d.subscription_code || "-");
      for (const r of rows || []) {
        const end = r.billing?.next_payment_date || d.next_payment_date;
        if (end && new Date(end) > new Date()) await saveBilling(r.id, { status: "cancelling", cancel_at: end });
        else await saveBilling(r.id, { status: "canceled", plan: "free" }, "free");
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
const overageCost = (plan: string, used: number) => {
  const p = PLANS[plan];
  if (!p) return { over: 0, cost: 0 };
  const over = Math.max(0, used - p.emails);
  return { over, cost: Math.ceil(over / 1000) * p.overage.USD };
};

// ---------------------------------------------------------------- summary
function subView(b: Any, kind: string) {
  if (!b?.plan || b.plan === "free") return null;
  const legacy = b.provider === "paystack";
  const L = legacy ? LEGACY_NGN[b.plan] : null;
  const p = catalog(kind)[b.plan];
  const yearly = b.interval === "yearly";
  return {
    plan: b.plan, interval: b.interval || "monthly", provider: b.provider || null, status: b.status, card: b.card || null,
    currency: legacy ? (b.currency || "NGN") : "USD",
    price: legacy && L ? (yearly ? L.yearly : L.monthly) : p ? p[yearly ? "yearly" : "monthly"].USD : 0,
    next_payment_date: b.next_payment_date || null, cancel_at: b.cancel_at || null, trial_end: b.trial_end || null,
    can_manage: !!(b.stripe_subscription || b.subscription_code),
  };
}

async function summary(teamId: string, admin: boolean) {
  const t = await team(teamId);
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
    SK ? taxReady() : Promise.resolve(false),
  ]);
  const credits = Number(t.credits || 0);
  const value = creditValue(credits);
  const ov = overageCost(plan, used);
  const L = PLAN_LIMITS[plan] || PLAN_LIMITS.free;
  const firstPlanInvoice = (invoices || []).filter((i: Any) => i.status === "success" && i.plan === plan && i.kind !== "credits" && i.kind !== "overage").map((i: Any) => i.paid_at).sort()[0];
  const sub = subView(b, "transactional");
  const msub = subView(b.marketing, "marketing");
  const daysIn = Math.round((to.getTime() - from.getTime()) / 864e5), dayN = Math.min(daysIn, Math.floor((now.getTime() - from.getTime()) / 864e5) + 1);
  const projected = dayN ? Math.round(used / dayN * daysIn) : used;
  const projOver = overageCost(plan, projected);
  const renewal = sub && sub.status === "active" && sub.currency === "USD" && sub.next_payment_date && new Date(sub.next_payment_date) < to ? sub.price : 0;
  const creditsApplied = Math.min(value, projOver.cost);
  const stripeReady = b.stripe_mode === MODE;
  return {
    plan,
    plan_marketing: t.plan_marketing || "free",
    admin,
    provider: "stripe",
    payments_ready: !!SK,
    mode: MODE,
    tax_ready: tax,
    currencies: ["USD"],
    currency: "USD",
    plans: Object.entries(PLANS).map(([id, p]) => ({ id, ...p })),
    marketing: Object.entries(MARKETING).map(([id, p]) => ({ id, ...p })),
    packs: PACKS,
    credits,
    credit_value: value,
    credit_rate: { USD: CREDIT_RATE },
    min_topup: { USD: MIN_TOPUP },
    vat_rate: 0,
    usage: { month: used, today, included: PLANS[plan]?.emails ?? (plan === "free" ? 4000 : 0), day_limit: L.day, contacts: contactsQ.count || 0, ...ov, currency: "USD" },
    period: { start: from.toISOString(), end: new Date(to.getTime() - 1).toISOString(), day: dayN, days: daysIn, projected, projected_over: projOver.over, projected_cost: projOver.cost },
    daily: (daily as Any[]).map((r) => ({ day: r.day, n: Number(r.n) })),
    limits: {
      domains: { used: domainsQ.count || 0, limit: L.domains },
      members: { used: membersQ.count || 0, limit: L.members },
      contacts: { used: contactsQ.count || 0, limit: MARKETING_CONTACTS[t.plan_marketing || "free"] || 0 },
      retention_days: L.retention_days,
    },
    next_invoice: { date: renewal ? sub!.next_payment_date : to.toISOString(), plan: renewal, plan_currency: "USD", overage: projOver.cost, overage_units: Math.ceil(projOver.over / 1000), credits: creditsApplied, vat: 0, total: renewal + projOver.cost - creditsApplied, currency: "USD" },
    customer_since: t.created_at,
    plan_since: b.plan_since || firstPlanInvoice || (plan === "free" ? t.created_at : null),
    auto_topup: { enabled: false, pack: 1, threshold: DEFAULT_THRESHOLD, ...(b.auto_topup || {}) },
    alerts: { p80: true, p100: true, credits_low: true, ...(b.alerts || {}) },
    spend_cap: b.spend_cap || null,
    card: stripeReady || b.provider === "paystack" ? (b.card || null) : null,
    can_charge_card: !!(stripeReady && b.stripe_pm),
    has_customer: !!(stripeReady && b.stripe_customer),
    subscription: sub,
    marketing_subscription: msub,
    // Teams still paying in naira through Paystack: shown a prompt to continue in USD before their period ends.
    legacy: sub?.provider === "paystack" && sub.status !== "canceled" ? { plan: sub.plan, ends: sub.next_payment_date, price: sub.price, currency: sub.currency, switch_free_until: trialEndFor(sub.next_payment_date) ? sub.next_payment_date : null } : null,
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
    const value = creditValue(Number(t.credits || 0));
    const at = b.auto_topup || {};
    if (at.enabled && b.stripe_pm && b.stripe_mode === MODE && value < Number(at.threshold ?? DEFAULT_THRESHOLD)) {
      const last = at.last_attempt ? new Date(at.last_attempt).getTime() : 0;
      if (now.getTime() - last > 3600e3) {
        const pack = PACKS[Number(at.pack ?? 1)] || PACKS[1];
        await saveBilling(t.id, { auto_topup: { ...at, last_attempt: now.toISOString() } });
        try { out.push({ team: t.id, topup: await chargeCredits(t.id, pack.emails, pack.price.USD, true) }); }
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
    const lowAt = Number(at.threshold ?? DEFAULT_THRESHOLD);
    if (al.credits_low && Number(t.credits || 0) > 0 && value < lowAt && !at.enabled && !sent.kinds.includes("credits_low")) fire.push("credits_low");
    if (!fire.length) continue;
    const to = b.details?.email || b.email;
    const from = env("SYSTEM_FROM");
    if (to && from) {
      for (const k of fire) {
        const subject = k === "credits_low" ? `${t.name}: Delivrie credits are running low` : `${t.name}: you've used ${k === "p100" ? "all" : "80%"} of this month's ${p!.emails.toLocaleString("en-US")} emails`;
        const text = k === "credits_low" ? `You have ${usd(value)} of credit left (about ${Number(t.credits).toLocaleString("en-US")} emails). Top up or turn on auto top-up: ${APP_URL}/billing/credits`
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
    if (b.provider === "paystack") { results.push({ team: t.id, status: "skipped_naira_plan" }); continue; }
    const used = await usage(t.id, from, to);
    const { over, cost } = overageCost(t.plan_transactional, used);
    let amount = cost;
    const lines = over ? [`${over.toLocaleString("en-US")} emails over ${PLANS[t.plan_transactional].name}`] : [];
    if (t.plan_marketing === "pro") {
      const { count } = await db.from("contacts").select("id", { count: "exact", head: true }).eq("team_id", t.id);
      const extra = Math.max(0, (count || 0) - MARKETING.pro.contacts);
      if (extra) { amount += Math.ceil(extra / 1000) * MARKETING.pro.extra!.USD; lines.push(`${extra.toLocaleString("en-US")} extra contacts`); }
    }
    if (!amount) continue;
    const { data: done } = await db.from("billing_invoices").select("status").eq("team_id", t.id).eq("kind", "overage").like("reference", "in_%").gte("paid_at", to.toISOString()).eq("status", "success").limit(1);
    if (done?.length) continue;
    const creditRef = `ovc_${tag}_${t.id.slice(0, 8)}`;
    const { data: paid } = await db.from("billing_invoices").select("amount").eq("reference", creditRef).maybeSingle();
    let fromCredits = Number(paid?.amount || 0);
    if (!paid && Number(t.credits || 0) > 0) {
      const apply = Math.min(creditValue(Number(t.credits)), amount);
      const n = Math.min(Number(t.credits), Math.ceil(apply / CREDIT_RATE));
      if (apply > 0 && n > 0) {
        const { data: ok } = await db.rpc("use_credits", { p_team: t.id, p_n: n });
        if (ok) {
          fromCredits = apply;
          await recordInvoice({ team_id: t.id, reference: creditRef, kind: "overage", plan: t.plan_transactional, description: `${lines.join(" · ")} · paid from credits (${n.toLocaleString("en-US")} emails)`, amount: apply, status: "success" });
        }
      }
    }
    amount = Math.max(0, amount - fromCredits);
    if (!amount) { results.push({ team: t.id, credits: fromCredits, status: "paid_from_credits" }); continue; }
    if (fromCredits) lines.push("credits applied");
    if (!b.stripe_pm || b.stripe_mode !== MODE) {
      await recordInvoice({ team_id: t.id, reference: `ovg_${tag}_${t.id.slice(0, 8)}`, kind: "overage", plan: t.plan_transactional, description: lines.join(" · ") + " (no saved card)", amount, status: "failed" });
      results.push({ team: t.id, amount, status: "no_card" });
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

async function stripeWebhook(req: Request) {
  const raw = await req.text();
  if (!(await verifyStripeSignature(raw, req.headers.get("stripe-signature") || "", WHSEC))) return json({ error: "invalid signature" }, 400);
  const evt = JSON.parse(raw);
  const o = evt.data?.object || {};
  if (MODE && (evt.livemode ? "live" : "test") !== MODE) return json({ received: true, ignored: "other mode" });
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
  if (path === "/stripe/webhook" && req.method === "POST") return stripeWebhook(req);
  if (path === "/webhook" && req.method === "POST") return paystackWebhook(req);
  if (path === "/cron/overage" && req.method === "POST") { await cronAuth(req); return json(await overageRun()); }
  if (path === "/cron/watch" && req.method === "POST") { await cronAuth(req); return json(await watchRun()); }
  if (path === "/cron/health" && req.method === "POST") {
    // For delivrie.io/status: can we reach Stripe with our key? Says test or live mode, never the key.
    await cronAuth(req);
    if (!SK) return json({ ok: false, configured: false });
    const t0 = Date.now();
    try { await stripe("GET", "/products", { limit: 1 }); return json({ ok: true, configured: true, mode: MODE, webhook: !!WHSEC, latency_ms: Date.now() - t0 }); }
    catch (e) { return json({ ok: false, configured: true, mode: MODE, error: (e as Error).message.slice(0, 200) }); }
  }
  const a = await auth(req);
  const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};

  if (path === "/summary" && req.method === "GET") return json(await summary(a.teamId, a.admin));

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
    const onStripe = cur.provider === "stripe" && cur.stripe_subscription && ["active", "cancelling", "past_due"].includes(cur.status);
    if (onStripe && current === plan && (cur.interval || "monthly") === interval && cur.status === "active") throw new HttpError(400, `You're already on ${p.name}.`);
    const price = await priceId(kind, plan, interval);

    // Already subscribed on Stripe: change the plan in place. The difference is charged (or credited) now.
    if (onStripe) {
      const sub = await stripe("GET", `/subscriptions/${cur.stripe_subscription}`);
      const item = sub.items.data[0];
      const updated = await stripe("POST", `/subscriptions/${sub.id}`, {
        items: [{ id: item.id, price }], proration_behavior: "always_invoice", payment_behavior: "error_if_incomplete",
        cancel_at_period_end: false, metadata: { team_id: a.teamId, kind, plan, interval },
      }, `change-${sub.id}-${price}-${Date.now().toString(36)}`);
      await syncSubscription(updated.id);
      return json({ changed: true, ...(await summary(a.teamId, a.admin)) });
    }

    const customer = await customerFor(a.teamId, a.user.email);
    const tax = await taxReady();
    // Naira (Paystack) customers switching: USD billing starts when their paid naira period ends.
    const trialEnd = kind === "transactional" && t.billing?.provider === "paystack" && t.billing?.status === "active" ? trialEndFor(t.billing.next_payment_date) : null;
    const meta = { team_id: a.teamId, kind, plan, interval };
    const s = await stripe("POST", "/checkout/sessions", {
      mode: "subscription", customer, client_reference_id: a.teamId,
      line_items: [{ price, quantity: 1 }],
      success_url: `${APP_URL}/billing?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${APP_URL}/billing?canceled=1`,
      metadata: meta,
      subscription_data: { metadata: meta, ...(trialEnd ? { trial_end: trialEnd } : {}) },
      automatic_tax: { enabled: tax },
      ...(tax ? { customer_update: { address: "auto", name: "auto" }, billing_address_collection: "required" } : {}),
      tax_id_collection: { enabled: true },
      ...(tax ? {} : { customer_update: { name: "auto" } }),
    });
    return json({ url: s.url });
  }

  // Top up credits: a pack or a custom amount; saved card (charged now), or Stripe Checkout.
  if ((path === "/topup" || path === "/credits") && req.method === "POST") {
    requireAdmin(a);
    let amount: number, emails: number;
    if (body.pack != null && body.pack !== "custom") {
      const pack = PACKS[Number(body.pack)];
      if (!pack) throw new HttpError(400, "Choose a credit pack.");
      amount = pack.price.USD; emails = pack.emails;
    } else {
      amount = Math.round(Number(body.amount) * 100);
      if (!isFinite(amount) || amount < MIN_TOPUP) throw new HttpError(400, "The minimum top-up is $5.");
      if (amount > MAX_TOPUP) throw new HttpError(400, "That's above the largest top-up. Talk to sales for bigger volumes.");
      emails = emailsFor(amount);
    }
    const t = await team(a.teamId);
    if (body.auto && typeof body.auto === "object") {
      const pack = Number(body.auto.pack ?? body.pack ?? 1);
      await saveBilling(a.teamId, { auto_topup: { ...(t.billing?.auto_topup || {}), enabled: !!body.auto.enabled, pack: PACKS[pack] ? pack : 1, threshold: Math.max(0, Math.round(Number(body.auto.threshold ?? DEFAULT_THRESHOLD / 100) * 100)) } });
    }
    const b = t.billing || {};
    if (body.method === "card" && b.stripe_pm && b.stripe_mode === MODE) {
      const status = await chargeCredits(a.teamId, emails, amount, false);
      if (status !== "success") throw new HttpError(402, "Your card was declined. Try checkout with another card.");
      return json({ status, emails, ...(await summary(a.teamId, a.admin)) });
    }
    const customer = await customerFor(a.teamId, a.user.email);
    const tax = await taxReady();
    const ref = `cs_ref_${a.teamId.slice(0, 8)}_${Date.now().toString(36)}`;
    const meta = { team_id: a.teamId, kind: "credits", emails: String(emails), ref };
    const s = await stripe("POST", "/checkout/sessions", {
      mode: "payment", customer, client_reference_id: a.teamId,
      line_items: [{ quantity: 1, price_data: { currency: "usd", unit_amount: amount, tax_behavior: "exclusive", product_data: { name: `Delivrie credits · ${emails.toLocaleString("en-US")} emails` } } }],
      success_url: `${APP_URL}/billing/credits?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${APP_URL}/billing/credits?canceled=1`,
      metadata: meta,
      payment_intent_data: { setup_future_usage: "off_session", metadata: meta },
      invoice_creation: { enabled: true, invoice_data: { metadata: { ...meta, via: "checkout" } } },
      automatic_tax: { enabled: tax },
      ...(tax ? { customer_update: { address: "auto", name: "auto" }, billing_address_collection: "required" } : { customer_update: { name: "auto" } }),
      tax_id_collection: { enabled: true },
    });
    return json({ url: s.url });
  }

  if (path === "/verify" && req.method === "POST") {
    const id = String(body.session_id || "");
    if (!/^cs_(test|live)_[A-Za-z0-9]+$/.test(id)) throw new HttpError(400, "Missing checkout session.");
    const r = await applySession(id, a.teamId);
    return json({ status: r.status, kind: r.kind || "transactional", ...(await summary(a.teamId, a.admin)) });
  }

  // Stripe's customer portal: update the card, download receipts, edit billing details and tax IDs.
  if ((path === "/portal" || path === "/card") && req.method === "POST") {
    requireAdmin(a);
    const t = await team(a.teamId);
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
      return json(await summary(a.teamId, a.admin));
    }
    if (b.subscription_code && b.email_token) {
      await ps("POST", "/subscription/disable", { code: b.subscription_code, token: b.email_token });
      const end = b.next_payment_date || new Date().toISOString();
      if (marketing) await saveBilling(a.teamId, { marketing: { ...b, status: "cancelling", cancel_at: end } });
      else await saveBilling(a.teamId, { status: "cancelling", cancel_at: end });
      return json(await summary(a.teamId, a.admin));
    }
    throw new HttpError(400, "There's no active subscription to cancel.");
  }

  if (path === "/settings" && req.method === "POST") {
    requireAdmin(a);
    const t = await team(a.teamId);
    const b = t.billing || {};
    const patch: Any = {};
    if (body.auto_topup) {
      const x = body.auto_topup, pack = Number(x.pack ?? b.auto_topup?.pack ?? 1);
      if (x.enabled && !(b.stripe_pm && b.stripe_mode === MODE)) throw new HttpError(400, "Auto top-up needs a saved card. Top up once with a card first.");
      patch.auto_topup = { ...(b.auto_topup || {}), enabled: !!x.enabled, pack: PACKS[pack] ? pack : 1, threshold: x.threshold != null ? Math.max(0, Math.round(Number(x.threshold) * 100)) : (b.auto_topup?.threshold ?? DEFAULT_THRESHOLD) };
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
    const email = String(body.email ?? "").trim().slice(0, 254);
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(400, "Enter a valid billing email.");
    const t = await team(a.teamId);
    await saveBilling(a.teamId, { details: { ...(t.billing?.details || {}), email } });
    if (email && t.billing?.stripe_customer && t.billing.stripe_mode === MODE) await stripe("POST", `/customers/${t.billing.stripe_customer}`, { email }).catch((e) => console.error("customer email", e.message));
    return json(await summary(a.teamId, a.admin));
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
