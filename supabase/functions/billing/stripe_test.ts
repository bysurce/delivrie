// deno test supabase/functions/billing/stripe_test.ts  (also runs under node --experimental-strip-types)
import { cardLabel, formEncode, hmacHex, periodEnd, priceKey, subState, trialEndFor, verifyStripeSignature } from "./stripe.ts";

const eq = (a: unknown, b: unknown, msg: string) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${msg}: got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`); };

// form encoding
eq(decodeURIComponent(formEncode({ mode: "subscription", line_items: [{ price: "price_1", quantity: 1 }], metadata: { team_id: "t 1" }, automatic_tax: { enabled: true }, skip: undefined })),
  "mode=subscription&line_items[0][price]=price_1&line_items[0][quantity]=1&metadata[team_id]=t 1&automatic_tax[enabled]=true", "nested form");
eq(formEncode({ "expand": ["subscription", "payment_intent.payment_method"] }), "expand%5B0%5D=subscription&expand%5B1%5D=payment_intent.payment_method", "arrays");

// webhook signatures (Stripe's scheme: HMAC-SHA256 of "t.body")
const secret = "whsec_test", body = '{"id":"evt_1"}', now = 1_800_000_000;
const sig = await hmacHex(secret, `${now}.${body}`);
eq(await verifyStripeSignature(body, `t=${now},v1=${sig}`, secret, 300, now), true, "valid signature");
eq(await verifyStripeSignature(body, `t=${now},v1=deadbeef,v1=${sig}`, secret, 300, now), true, "one of several v1 signatures");
eq(await verifyStripeSignature(body + " ", `t=${now},v1=${sig}`, secret, 300, now), false, "tampered body");
eq(await verifyStripeSignature(body, `t=${now},v1=${sig}`, "whsec_other", 300, now), false, "wrong secret");
eq(await verifyStripeSignature(body, `t=${now},v1=${sig}`, secret, 300, now + 301), false, "too old (replay)");
eq(await verifyStripeSignature(body, ``, secret, 300, now), false, "no header");
eq(await verifyStripeSignature(body, `t=${now},v1=${sig}`, "", 300, now), false, "no secret configured");

// subscription states
eq(subState({ status: "active" }), "active", "active");
eq(subState({ status: "trialing" }), "active", "trialing counts as active (customers switching from an older plan)");
eq(subState({ status: "active", cancel_at_period_end: true }), "cancelling", "cancelling");
eq(subState({ status: "past_due" }), "past_due", "past due");
eq(subState({ status: "unpaid" }), "past_due", "unpaid");
eq(subState({ status: "canceled" }), "canceled", "canceled");
eq(subState({ status: "incomplete" }), "incomplete", "incomplete");

eq(periodEnd({ current_period_end: 1_800_000_000 }), "2027-01-15T08:00:00.000Z", "period end on subscription");
eq(periodEnd({ items: { data: [{ current_period_end: 1_800_000_000 }] } }), "2027-01-15T08:00:00.000Z", "period end on item (newer API)");
eq(periodEnd({}), null, "no period");

eq(priceKey("transactional", "pro", "monthly", 2000), "delivrie_transactional_pro_monthly_2000", "price key");

const nowMs = Date.UTC(2026, 10, 18);
eq(trialEndFor("2026-12-12T15:53:00Z", nowMs), Date.UTC(2026, 11, 12, 15, 53) / 1000, "trial until the older plan's period ends");
eq(trialEndFor(new Date(nowMs + 24 * 3600e3).toISOString(), nowMs), null, "under 48h: no trial");
eq(trialEndFor(null, nowMs), null, "no paid period");

eq(cardLabel({ brand: "visa", last4: "4242" }), "Visa •••• 4242", "card label");
eq(cardLabel({ brand: "amex", last4: "0005" }), "American Express •••• 0005", "amex");
eq(cardLabel(null), null, "no card");
console.log("stripe helper tests passed");
