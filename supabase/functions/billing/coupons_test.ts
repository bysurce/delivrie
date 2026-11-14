// deno test supabase/functions/billing/coupons_test.ts  (also runs under node --experimental-strip-types)
import { bestAuto, type Coupon, couponLabel, couponProblem, discounted, nextPeriod, normCode } from "./coupons.ts";

const eq = (a: unknown, b: unknown, msg: string) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${msg}: got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`); };
const T = "team-a";
const base: Coupon = { id: "c1", code: "SAVE20", percent_off: 20, applies_to: "subscription", duration: "once", redemptions: 0, active: true };
const use = { kind: "transactional" as const, plan: "pro", interval: "monthly", teamId: T, usedByTeam: false };

// price maths
eq(discounted(20_00, 20, true), 16_00, "20% off $20");
eq(discounted(10_00, 15, true), 8_00, "15% off $10 rounds down to whole dollars");
eq(discounted(27_000_00, 10, true), 24_300_00, "10% off ₦27,000");
eq(discounted(10_00, 95, true), 50, "95% off $10 keeps cents when under $1");
eq(discounted(5_00, 15), 4_25, "credits keep exact cents");

// rules
eq(couponProblem(base, use), null, "valid");
eq(couponProblem(null, use), "That coupon code doesn't exist.", "missing");
eq(couponProblem({ ...base, active: false }, use), "That coupon is no longer active.", "inactive");
eq(couponProblem({ ...base, expires_at: "2020-01-01T00:00:00Z" }, use), "That coupon has expired.", "expired");
eq(couponProblem({ ...base, team_id: "team-b" }, use), "That coupon code doesn't exist.", "another team's private code doesn't leak");
eq(couponProblem({ ...base, max_redemptions: 3, redemptions: 3 }, use), "That coupon has been fully used.", "used up");
eq(couponProblem(base, { ...use, usedByTeam: true }), "Your team has already used that coupon.", "once per team");
eq(couponProblem(base, { ...use, kind: "credits" }), "That coupon is for plans, not credit top-ups.", "plan coupon on credits");
eq(couponProblem({ ...base, applies_to: "credits" }, use), "That coupon is for credit top-ups, not plans.", "credit coupon on plan");
eq(couponProblem({ ...base, applies_to: "any" }, { ...use, kind: "credits" }), null, "any on credits");
eq(couponProblem({ ...base, plans: ["scale"] }, use), "That coupon only works on Scale.", "plan restriction");
eq(couponProblem({ ...base, intervals: ["yearly"] }, use), "That coupon only works on yearly billing.", "interval restriction");
eq(couponProblem({ ...base, plans: ["scale"], applies_to: "any" }, { ...use, kind: "credits" }), null, "plan list ignored for credits");

// assigned discounts
const auto: Coupon[] = [
  { ...base, id: "a1", team_id: T, auto_apply: true, percent_off: 10 },
  { ...base, id: "a2", team_id: T, auto_apply: true, percent_off: 30 },
  { ...base, id: "a3", team_id: "team-b", auto_apply: true, percent_off: 50 },
  { ...base, id: "a4", team_id: T, auto_apply: false, percent_off: 60 },
];
eq(bestAuto(auto, new Set(), use)?.id, "a2", "best assigned discount");
eq(bestAuto(auto, new Set(["a2"]), use)?.id, "a1", "skips used ones");
eq(bestAuto(auto, new Set(["a1", "a2"]), use), null, "none left");

eq(normCode(" summer-20 "), "SUMMER-20", "normalise");
eq(couponLabel(base), "20% off your first payment", "label once");
eq(couponLabel({ ...base, duration: "forever" }), "20% off every payment", "label forever");
eq(nextPeriod(new Date("2026-11-14T10:00:00Z"), "monthly").toISOString(), "2026-12-14T10:00:00.000Z", "next month");
eq(nextPeriod(new Date("2026-11-14T10:00:00Z"), "yearly").toISOString(), "2027-11-14T10:00:00.000Z", "next year");
console.log("coupon tests passed");
