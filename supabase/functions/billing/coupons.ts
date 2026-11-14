// Coupon rules and price maths, kept free of I/O so they can be unit-tested (coupons_test.ts).

export type Coupon = {
  id: string;
  code: string;
  description?: string | null;
  percent_off: number;
  applies_to: "subscription" | "credits" | "any";
  plans?: string[] | null;
  intervals?: string[] | null;
  duration: "once" | "forever";
  max_redemptions?: number | null;
  redemptions: number;
  expires_at?: string | null;
  team_id?: string | null;
  auto_apply?: boolean;
  active: boolean;
};

export type CouponUse = {
  kind: "transactional" | "marketing" | "credits";
  plan?: string;
  interval?: string;
  teamId: string;
  usedByTeam: boolean; // the team already redeemed this coupon
  now?: Date;
};

// Amount after the discount, in the smallest unit (cents or kobo). Rounded down to a whole major unit for
// subscriptions so Paystack plan prices stay tidy ($8, not $8.37); credits keep exact minor units.
export function discounted(amount: number, percent: number, wholeUnits = false): number {
  const raw = Math.round(amount * (100 - percent) / 100);
  if (!wholeUnits) return raw;
  const whole = Math.floor(raw / 100) * 100;
  return whole > 0 ? whole : raw;
}

// Why this coupon can't be used here, or null if it can.
export function couponProblem(c: Coupon | null | undefined, u: CouponUse): string | null {
  if (!c) return "That coupon code doesn't exist.";
  const now = u.now || new Date();
  if (!c.active) return "That coupon is no longer active.";
  if (c.expires_at && new Date(c.expires_at) <= now) return "That coupon has expired.";
  if (c.team_id && c.team_id !== u.teamId) return "That coupon code doesn't exist.";
  if (c.max_redemptions != null && c.redemptions >= c.max_redemptions) return "That coupon has been fully used.";
  if (u.usedByTeam) return "Your team has already used that coupon.";
  const credits = u.kind === "credits";
  if (c.applies_to === "subscription" && credits) return "That coupon is for plans, not credit top-ups.";
  if (c.applies_to === "credits" && !credits) return "That coupon is for credit top-ups, not plans.";
  if (!credits) {
    if (c.plans?.length && (!u.plan || !c.plans.includes(u.plan))) return `That coupon only works on ${c.plans.map(title).join(", ")}.`;
    if (c.intervals?.length && (!u.interval || !c.intervals.includes(u.interval))) return `That coupon only works on ${c.intervals.join(" or ")} billing.`;
  }
  return null;
}

// The best automatic (assigned) discount that applies, if any.
export function bestAuto(coupons: Coupon[], used: Set<string>, u: Omit<CouponUse, "usedByTeam">): Coupon | null {
  return coupons
    .filter((c) => c.auto_apply && c.team_id === u.teamId && !couponProblem(c, { ...u, usedByTeam: used.has(c.id) }))
    .sort((a, b) => b.percent_off - a.percent_off || (a.duration === "forever" ? -1 : 1))[0] || null;
}

// Normalise what customers type: " summer-20 " -> "SUMMER-20".
export const normCode = (s: unknown) => String(s ?? "").trim().toUpperCase();

// One line customers see: "20% off your first payment" / "20% off every payment".
export function couponLabel(c: Pick<Coupon, "percent_off" | "duration" | "applies_to">): string {
  if (c.applies_to === "credits") return `${c.percent_off}% off credit top-ups`;
  return `${c.percent_off}% off ${c.duration === "forever" ? "every payment" : "your first payment"}`;
}

// When a full-price subscription should start after a discounted first payment.
export function nextPeriod(from: Date, interval: string): Date {
  const d = new Date(from);
  if (interval === "yearly") d.setUTCFullYear(d.getUTCFullYear() + 1);
  else d.setUTCMonth(d.getUTCMonth() + 1);
  return d;
}

const title = (s: string) => s.replace(/^\w/, (c) => c.toUpperCase());
