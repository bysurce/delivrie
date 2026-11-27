// Delivrie's starter templates and the brand kit that styles them.
// Templates use the "card" layout from blocks.js. applyBrand() fills in a team's logo, colours, font, address and
// social links; %BRAND% in any text becomes the brand name. Each variable has a sample value for previews.
import { FONTS } from "./blocks.js";

export const DEFAULT_BRAND = {
  name: "", logo_url: "", logo_height: 32, website: "", support_email: "",
  primary: "#18181b", button_text: "#ffffff",
  heading: "#18181b", text: "#3f3f46", muted: "#71717a",
  background: "#f4f4f5", card: "#ffffff", font: "System", radius: 8,
  address: "", social: { x: "", linkedin: "", instagram: "", facebook: "", youtube: "" },
};
export const BRAND_PLANS = ["starter", "pro", "scale", "enterprise"];
export const canBrand = (plan) => BRAND_PLANS.includes(plan || "free");

// Mix a hex colour with white (0..1 of the colour kept), for soft callout backgrounds.
function tint(hex, keep = 0.08) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || "").trim()); if (!m) return "#f6f6f8";
  const n = parseInt(m[1], 16), c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.round(255 - (255 - v) * keep));
  return "#" + c.map((v) => v.toString(16).padStart(2, "0")).join("");
}
const SOCIAL_LABEL = { x: "X", linkedin: "LinkedIn", instagram: "Instagram", facebook: "Facebook", youtube: "YouTube" };

/** Returns a copy of doc styled with the brand. teamName is used when the brand has no name. */
export function applyBrand(doc, brand: Record<string, any> = {}, teamName = "") {
  const b = { ...DEFAULT_BRAND, ...(brand || {}), social: { ...DEFAULT_BRAND.social, ...(brand?.social || {}) } };
  const name = b.name || teamName || "Your company";
  const out = structuredClone(doc || { blocks: [] });
  out.page = {
    ...(out.page || {}), layout: "card", width: 600,
    background: b.background, cardBackground: b.card, text: b.text, heading: b.heading, muted: b.muted,
    accent: b.primary, accentText: b.primary, link: b.primary, font: FONTS[b.font] || FONTS.System, radius: 14,
    border: "#e9e9ee", calloutBackground: tint(b.primary, 0.07),
  };
  const sub = (s) => typeof s === "string" ? s.replace(/%BRAND%/g, name).replace(/%SUPPORT%/g, b.support_email || (b.website ? `support@${b.website.replace(/^https?:\/\/(www\.)?/, "").replace(/\/.*$/, "")}` : "our support team")).replace(/%WEBSITE%/g, b.website || "https://example.com") : s;
  for (const blk of out.blocks || []) {
    for (const k of ["html", "text", "title", "reason", "href", "alt"]) if (blk[k] != null) blk[k] = sub(blk[k]);
    if (blk.items) blk.items = blk.items.map(sub);
    if (blk.rows) blk.rows = blk.rows.map((r) => ({ ...r, label: sub(r.label), value: sub(r.value) }));
    if (blk.columns) blk.columns = blk.columns.map((c) => ({ ...c, html: sub(c.html) }));
    if (blk.type === "logo") Object.assign(blk, { src: b.logo_url || "", text: name, alt: name, height: Number(b.logo_height) || 32, href: b.website || "" });
    if (blk.type === "button" && blk.brand !== false) Object.assign(blk, blk.secondary ? { fill: tint(b.primary, 0.1), color: b.heading } : { fill: b.primary, color: b.button_text }, { radius: Number(b.radius) });
    if (blk.type === "footer") blk.address = b.address || "";
    if (blk.style?.color === "#71717a") blk.style = { ...blk.style, color: b.muted };
    if (blk.type === "social") blk.links = Object.entries(b.social).filter(([, u]) => u).map(([k, u]) => ({ network: SOCIAL_LABEL[k] || k, label: SOCIAL_LABEL[k] || k, url: u }));
    if (blk.type === "callout" && blk.tone === "brand") { blk.background = tint(b.primary, 0.08); blk.accent = b.primary; }
  }
  return out;
}

// ---------------------------------------------------------------- building blocks for the library
let n = 0;
const id = () => "b" + (++n).toString(36);
const logo = () => ({ id: id(), type: "logo", zone: "header", align: "left" });
const eyebrow = (html) => ({ id: id(), type: "eyebrow", html });
const title = (html) => ({ id: id(), type: "title", html });
const heading = (html) => ({ id: id(), type: "heading", html, style: { padding: "12 0 8 0" } });
const text = (html: string, style?: Record<string, any>) => ({ id: id(), type: "text", html, ...(style ? { style } : {}) });
const small = (html) => text(html, { fontSize: 14, color: "#71717a" });
const button = (label, href, extra = {}) => ({ id: id(), type: "button", text: label, href, width: "Auto", brand: true, ...extra });
const divider = () => ({ id: id(), type: "divider" });
const otp = (code) => ({ id: id(), type: "otp", code });
const rows = (list: any[][], total?: any) => ({ id: id(), type: "rows", rows: list.map(([label, value, strong]) => ({ label, value, ...(strong ? { strong: true } : {}) })), ...(total ? { total: { label: total[0], value: total[1] } } : {}) });
const callout = (html, extra = {}) => ({ id: id(), type: "callout", html, ...extra });
const bullets = (items) => ({ id: id(), type: "bulleted", items });
const steps = (items) => ({ id: id(), type: "numbered", items });
const image = (src: string, alt?: string) => ({ id: id(), type: "image", src, alt, width: 512, style: { radius: 10 } });
const social = () => ({ id: id(), type: "social", zone: "footer", align: "left", links: [] });
const txFooter = (why = "You’re receiving this email because you have an account with %BRAND%.") => ({ id: id(), type: "footer", zone: "footer", unsubscribe: false, reason: why, address: "" });
const mkFooter = () => ({ id: id(), type: "footer", zone: "footer", reason: "You’re receiving this because you subscribed to updates from %BRAND%.", address: "" });
const v = (name, sample, fallback = "") => ({ name, type: "string", fallback, sample });
const doc = (blocks) => ({ page: { layout: "card" }, blocks });

// Neutral placeholder images (hosted with the site) that the business replaces with its own.
const PH = (kind) => `https://delivrie.io/assets/email/placeholder-${kind}.jpg`;

export const CATEGORIES = ["Account", "Security", "Billing", "Commerce", "Marketing"];

export const LIBRARY = [
  // ---------------------------------------------------------------- Account
  { id: "welcome", name: "Welcome", category: "Account", desc: "Greet new sign-ups and point them to the first step.",
    subject: "Welcome to %BRAND%, {{first_name|there}}", preview: "Here’s how to get started in five minutes.",
    variables: [v("first_name", "Ada", "there"), v("dashboard_url", "https://example.com/dashboard", "https://example.com")],
    content: doc([logo(), title("Welcome to %BRAND%, {{first_name|there}}"), text("We’re glad you’re here. Your account is ready, and getting set up takes about five minutes."),
      steps(["<b>Complete your profile</b> so your team knows who you are.", "<b>Connect your first project</b> to see your data come in.", "<b>Invite a teammate.</b> Everything is better together."]),
      button("Go to your dashboard", "{{{dashboard_url}}}"), divider(), small("Questions? Just reply to this email. A real person reads every one."), social(), txFooter()]) },
  { id: "verify-email", name: "Verify email", category: "Account", desc: "Confirm a new email address with one click.",
    subject: "Confirm your email address", preview: "One click to confirm, and you’re in.",
    variables: [v("verify_url", "https://example.com/verify?t=abc123"), v("first_name", "Ada", "there")],
    content: doc([logo(), title("Confirm your email"), text("Hi {{first_name|there}}, please confirm this is your email address so we can keep your %BRAND% account secure."),
      button("Confirm email address", "{{{verify_url}}}"), small("This link expires in 24 hours. If you didn’t create an account, you can safely ignore this email."), txFooter("You’re receiving this because this address was used to sign up for %BRAND%.")]) },
  { id: "magic-link", name: "Sign-in link", category: "Account", desc: "Passwordless sign-in with a one-time link.",
    subject: "Your %BRAND% sign-in link", preview: "Click to sign in. The link expires in 10 minutes.",
    variables: [v("login_url", "https://example.com/login?t=abc123")],
    content: doc([logo(), title("Sign in to %BRAND%"), text("Click the button below to sign in. This link can only be used once and expires in 10 minutes."),
      button("Sign in", "{{{login_url}}}", { width: "Full" }), small("If you didn’t try to sign in, you can ignore this email. Someone may have typed your address by mistake."), txFooter()]) },
  { id: "team-invite", name: "Team invitation", category: "Account", desc: "Invite someone to join a workspace.",
    subject: "{{inviter_name|A teammate}} invited you to {{team_name|their team}} on %BRAND%", preview: "Accept the invitation to start collaborating.",
    variables: [v("inviter_name", "Sam Carter", "A teammate"), v("team_name", "Northwind Labs", "their team"), v("invite_url", "https://example.com/invite/abc123")],
    content: doc([logo(), title("Join {{team_name|the team}} on %BRAND%"), text("<b>{{inviter_name|A teammate}}</b> has invited you to collaborate in <b>{{team_name|their team}}</b>."),
      button("Accept invitation", "{{{invite_url}}}"), small("This invitation expires in 7 days. If you weren’t expecting it, you can ignore this email."), txFooter("You’re receiving this because someone invited you to %BRAND%.")]) },
  { id: "account-deleted", name: "Account closed", category: "Account", desc: "Confirm an account was closed, with a way back.",
    subject: "Your %BRAND% account has been closed", preview: "We’re sorry to see you go.",
    variables: [v("first_name", "Ada", "there"), v("restore_url", "https://example.com/restore")],
    content: doc([logo(), title("Your account has been closed"), text("Hi {{first_name|there}}, as requested, we’ve closed your %BRAND% account and stopped all billing."),
      callout("Changed your mind? You can restore your account and data within <b>30 days</b>. After that, everything is permanently deleted.", { tone: "brand" }),
      button("Restore my account", "{{{restore_url}}}", { secondary: true }), small("Thanks for giving us a try. If you have a moment, reply and tell us what we could do better."), txFooter("You’re receiving this because your %BRAND% account was closed.")]) },

  // ---------------------------------------------------------------- Security
  { id: "otp", name: "Verification code", category: "Security", desc: "A one-time code for sign-in or two-factor checks.",
    subject: "{{code}} is your %BRAND% verification code", preview: "Your code expires in 10 minutes.",
    variables: [v("code", "482913")],
    content: doc([logo(), title("Your verification code"), text("Enter this code to continue. It expires in 10 minutes."), otp("{{code}}"),
      small("If you didn’t request this code, someone may be trying to access your account. You can ignore this email, and consider changing your password."), txFooter()]) },
  { id: "password-reset", name: "Password reset", category: "Security", desc: "Let people choose a new password securely.",
    subject: "Reset your %BRAND% password", preview: "Use this link to choose a new password.",
    variables: [v("first_name", "Ada", "there"), v("reset_url", "https://example.com/reset?t=abc123")],
    content: doc([logo(), title("Reset your password"), text("Hi {{first_name|there}}, we received a request to reset the password for your %BRAND% account. Use the button below to choose a new one."),
      button("Choose a new password", "{{{reset_url}}}"), small("This link expires in 30 minutes. If you didn’t ask for a reset, you can ignore this email; your password won’t change."), txFooter()]) },
  { id: "password-changed", name: "Password changed", category: "Security", desc: "Confirm a password change and flag it if unexpected.",
    subject: "Your %BRAND% password was changed", preview: "If this wasn’t you, secure your account now.",
    variables: [v("first_name", "Ada", "there"), v("changed_at", "14 Nov 2026, 9:41 am UTC"), v("secure_url", "https://example.com/security")],
    content: doc([logo(), title("Your password was changed"), text("Hi {{first_name|there}}, the password for your %BRAND% account was changed on <b>{{changed_at}}</b>."),
      callout("<b>Wasn’t you?</b> Secure your account right away: reset your password and sign out of other devices.", { background: "#fff4ed", accent: "#ea580c" }),
      button("Secure my account", "{{{secure_url}}}"), small("If you made this change, there’s nothing else to do."), txFooter()]) },
  { id: "new-signin", name: "New sign-in alert", category: "Security", desc: "Tell people about a sign-in from a new device.",
    subject: "New sign-in to your %BRAND% account", preview: "We noticed a sign-in from a new device.",
    variables: [v("device", "Chrome on macOS"), v("location", "London, United Kingdom"), v("time", "14 Nov 2026, 9:41 am UTC"), v("ip", "81.2.69.160"), v("secure_url", "https://example.com/security")],
    content: doc([logo(), title("New sign-in detected"), text("Your %BRAND% account was just accessed from a device we haven’t seen before."),
      rows([["Device", "{{device}}"], ["Location", "{{location}}"], ["Time", "{{time}}"], ["IP address", "{{ip}}"]]),
      text("If this was you, you can ignore this email. If not, secure your account now."), button("Review account security", "{{{secure_url}}}"), txFooter()]) },

  // ---------------------------------------------------------------- Billing
  { id: "receipt", name: "Payment receipt", category: "Billing", desc: "Confirm a payment with a clean breakdown.",
    subject: "Your %BRAND% receipt #{{receipt_number}}", preview: "Thanks for your payment.",
    variables: [v("receipt_number", "R-20931"), v("date", "14 Nov 2026"), v("plan", "Pro plan, monthly"), v("amount", "$20.00"), v("tax", "$0.00"), v("total", "$20.00"), v("payment_method", "Visa ending 4242"), v("receipt_url", "https://example.com/billing/receipts/R-20931")],
    content: doc([logo(), eyebrow("Receipt #{{receipt_number}}"), title("Thanks for your payment"), text("We’ve received your payment. Here’s your receipt for your records."),
      rows([["{{plan}}", "{{amount}}"], ["Tax", "{{tax}}"]], ["Total paid", "{{total}}"]),
      rows([["Date", "{{date}}"], ["Payment method", "{{payment_method}}"]]),
      button("View receipt", "{{{receipt_url}}}", { secondary: true }), small("Questions about this charge? Reply to this email or contact %SUPPORT%."), txFooter()]) },
  { id: "invoice", name: "Invoice", category: "Billing", desc: "Send an invoice with line items and a due date.",
    subject: "Invoice {{invoice_number}} from %BRAND%, due {{due_date}}", preview: "Your invoice is ready.",
    variables: [v("customer_name", "Acme Inc."), v("invoice_number", "INV-0042"), v("due_date", "28 Nov 2026"), v("item_1", "Pro plan (Nov 2026)"), v("item_1_amount", "$20.00"), v("item_2", "Extra emails (12,000)"), v("item_2_amount", "$5.40"), v("total", "$25.40"), v("pay_url", "https://example.com/pay/INV-0042")],
    content: doc([logo(), eyebrow("Invoice {{invoice_number}}"), title("{{total}} due {{due_date}}"), text("Hi {{customer_name}}, here’s your invoice from %BRAND%."),
      rows([["{{item_1}}", "{{item_1_amount}}"], ["{{item_2}}", "{{item_2_amount}}"]], ["Amount due", "{{total}}"]),
      button("Pay invoice", "{{{pay_url}}}"), small("You can also download a PDF copy from the payment page."), txFooter()]) },
  { id: "payment-failed", name: "Payment failed", category: "Billing", desc: "Ask customers to update a card that was declined.",
    subject: "Action needed: your %BRAND% payment didn’t go through", preview: "Update your payment method to keep your account active.",
    variables: [v("first_name", "Ada", "there"), v("amount", "$20.00"), v("retry_date", "17 Nov 2026"), v("billing_url", "https://example.com/billing")],
    content: doc([logo(), title("Your payment didn’t go through"), text("Hi {{first_name|there}}, we tried to charge <b>{{amount}}</b> for your %BRAND% subscription, but the payment was declined."),
      callout("We’ll try again on <b>{{retry_date}}</b>. To avoid any interruption, please update your payment method before then.", { background: "#fef2f2", accent: "#dc2626" }),
      button("Update payment method", "{{{billing_url}}}"), small("Common causes are an expired card, insufficient funds or your bank blocking an international payment."), txFooter()]) },
  { id: "trial-ending", name: "Trial ending", category: "Billing", desc: "Remind people their trial ends soon.",
    subject: "Your %BRAND% trial ends in {{days_left|3}} days", preview: "Choose a plan to keep everything you’ve set up.",
    variables: [v("first_name", "Ada", "there"), v("days_left", "3", "3"), v("end_date", "17 Nov 2026"), v("plans_url", "https://example.com/pricing")],
    content: doc([logo(), title("Your trial ends in {{days_left|3}} days"), text("Hi {{first_name|there}}, your %BRAND% trial ends on <b>{{end_date}}</b>. Choose a plan to keep your projects, settings and data."),
      bullets(["Everything you’ve set up stays exactly as it is", "Cancel any time, with no long-term contract", "Pay monthly, or yearly to save two months"]),
      button("Choose a plan", "{{{plans_url}}}"), small("Not ready yet? Reply and we’ll extend your trial."), txFooter()]) },
  { id: "subscription-renewed", name: "Subscription renewed", category: "Billing", desc: "Confirm a renewal and what’s included.",
    subject: "Your %BRAND% subscription has renewed", preview: "Thanks for staying with us.",
    variables: [v("plan", "Pro"), v("amount", "$20.00"), v("period", "15 Nov – 14 Dec 2026"), v("billing_url", "https://example.com/billing")],
    content: doc([logo(), title("Your subscription has renewed"), text("Thanks for being a %BRAND% customer. Your <b>{{plan}}</b> plan has renewed for another period."),
      rows([["Plan", "{{plan}}"], ["Billing period", "{{period}}"], ["Amount", "{{amount}}", true]]),
      button("Manage billing", "{{{billing_url}}}", { secondary: true }), txFooter()]) },

  // ---------------------------------------------------------------- Commerce
  { id: "order-confirmation", name: "Order confirmation", category: "Commerce", desc: "Confirm an order with items and totals.",
    subject: "Order #{{order_number}} confirmed", preview: "Thanks for your order. Here’s what happens next.",
    variables: [v("first_name", "Ada", "there"), v("order_number", "1042"), v("item_1", "Linen shirt × 1"), v("item_1_price", "$48.00"), v("item_2", "Canvas tote × 2"), v("item_2_price", "$24.00"), v("shipping", "$6.00"), v("total", "$78.00"), v("address", "548 Market St, San Francisco, CA 94104"), v("order_url", "https://example.com/orders/1042")],
    content: doc([logo(), eyebrow("Order #{{order_number}}"), title("Thanks for your order, {{first_name|there}}"), text("We’ve got your order and we’re getting it ready. We’ll email you again when it ships."),
      rows([["{{item_1}}", "{{item_1_price}}"], ["{{item_2}}", "{{item_2_price}}"], ["Shipping", "{{shipping}}"]], ["Total", "{{total}}"]),
      heading("Delivering to"), text("{{address}}", { color: "#71717a" }),
      button("View your order", "{{{order_url}}}"), txFooter("You’re receiving this because you placed an order with %BRAND%.")]) },
  { id: "order-shipped", name: "Order shipped", category: "Commerce", desc: "Share tracking details when an order ships.",
    subject: "Your order #{{order_number}} is on its way", preview: "Track your package.",
    variables: [v("order_number", "1042"), v("carrier", "UPS"), v("tracking_number", "1Z999AA10123456784"), v("eta", "Tuesday, 18 Nov"), v("tracking_url", "https://example.com/track/1Z999AA10123456784")],
    content: doc([logo(), title("Your order is on its way"), text("Good news: order <b>#{{order_number}}</b> has shipped and should arrive by <b>{{eta}}</b>."),
      rows([["Carrier", "{{carrier}}"], ["Tracking number", "{{tracking_number}}"], ["Estimated delivery", "{{eta}}", true]]),
      button("Track package", "{{{tracking_url}}}"), small("Tracking can take up to 24 hours to update."), txFooter("You’re receiving this because you placed an order with %BRAND%.")]) },
  { id: "abandoned-cart", name: "Cart reminder", category: "Commerce", desc: "Bring shoppers back to items they left behind.",
    subject: "You left something in your cart", preview: "Your items are saved, but not for long.",
    variables: [v("first_name", "Ada", "there"), v("item_name", "Linen shirt"), v("item_price", "$48.00"), v("item_image", PH("product")), v("cart_url", "https://example.com/cart")],
    content: doc([logo(), title("Still thinking it over?"), text("Hi {{first_name|there}}, you left something in your cart. We’ve saved it for you."),
      image("{{{item_image}}}", "{{item_name}}"), rows([["{{item_name}}", "{{item_price}}", true]]),
      button("Return to cart", "{{{cart_url}}}", { width: "Full" }), small("Items in your cart aren’t reserved and may sell out."), mkFooter()]) },

  // ---------------------------------------------------------------- Marketing
  { id: "newsletter", name: "Newsletter", category: "Marketing", desc: "A clean digest for regular updates.",
    subject: "%BRAND% monthly: {{headline|What’s new}}", preview: "The highlights from this month.",
    variables: [v("headline", "Three things we shipped in November", "What’s new"), v("hero_image", PH("feature")), v("read_url", "https://example.com/blog")],
    content: doc([logo(), eyebrow("Monthly update"), title("{{headline|What’s new this month}}"), image("{{{hero_image}}}", "Feature image"),
      text("Here’s a quick look at what we’ve been working on, and what’s coming next."),
      heading("New: faster exports"), text("Exports now finish in seconds, even for large accounts. Try it from any report."),
      heading("Tip of the month"), text("Save filters you use often and they’ll appear in your sidebar for one-click access."),
      button("Read the full update", "{{{read_url}}}"), social(), mkFooter()]) },
  { id: "product-launch", name: "Product announcement", category: "Marketing", desc: "Announce a launch or major feature.",
    subject: "Introducing {{feature_name|our newest feature}}", preview: "Available today for every %BRAND% account.",
    variables: [v("feature_name", "Smart Reports", "our newest feature"), v("hero_image", PH("screenshot")), v("learn_url", "https://example.com/new")],
    content: doc([logo(), eyebrow("New"), title("Introducing {{feature_name|our newest feature}}"), text("The fastest way to see what’s working, available today on every %BRAND% plan."),
      image("{{{hero_image}}}", "{{feature_name}}"),
      bullets(["<b>Answers in seconds:</b> ask a question and get a chart back", "<b>Always up to date:</b> reports refresh as new data arrives", "<b>Share anywhere:</b> send a link or schedule a weekly email"]),
      button("Try it now", "{{{learn_url}}}"), social(), mkFooter()]) },
  { id: "feedback", name: "Feedback request", category: "Marketing", desc: "Ask customers how you’re doing.",
    subject: "Quick question, {{first_name|there}}", preview: "Two minutes to help us improve.",
    variables: [v("first_name", "Ada", "there"), v("survey_url", "https://example.com/survey")],
    content: doc([logo(), title("How are we doing?"), text("Hi {{first_name|there}}, you’ve been using %BRAND% for a little while now, and we’d love to hear what you think."),
      text("It takes about two minutes, and we read every response."), button("Share your feedback", "{{{survey_url}}}"),
      small("Thank you for helping us make %BRAND% better."), mkFooter()]) },
  { id: "event-invite", name: "Event invitation", category: "Marketing", desc: "Invite people to a webinar, meetup or launch.",
    subject: "You’re invited: {{event_name}}", preview: "Save your seat.",
    variables: [v("event_name", "Building with AI: a live workshop"), v("date", "Thursday, 27 November 2026"), v("time", "5:00 pm UTC (12:00 pm ET)"), v("location", "Online, link sent after you register"), v("rsvp_url", "https://example.com/events/rsvp")],
    content: doc([logo(), eyebrow("You’re invited"), title("{{event_name}}"), text("Join the %BRAND% team for a live session with demos, practical tips and time for your questions."),
      rows([["Date", "{{date}}"], ["Time", "{{time}}"], ["Where", "{{location}}"]]),
      button("Save my seat", "{{{rsvp_url}}}"), small("Can’t make it? Register anyway and we’ll send you the recording."), social(), mkFooter()]) },
  { id: "win-back", name: "We miss you", category: "Marketing", desc: "Re-engage customers who haven’t been back.",
    subject: "It’s been a while, {{first_name|there}}", preview: "Here’s what’s new since you’ve been away.",
    variables: [v("first_name", "Ada", "there"), v("offer", "20% off your next month", ""), v("return_url", "https://example.com")],
    content: doc([logo(), title("We’ve missed you, {{first_name|there}}"), text("A lot has changed at %BRAND% since your last visit. Here are a few things you might like:"),
      bullets(["A redesigned dashboard that’s twice as fast", "New integrations with the tools you already use", "Templates to get started in minutes"]),
      callout("Come back this week and get <b>{{offer|a special welcome-back offer}}</b>.", { tone: "brand" }),
      button("See what’s new", "{{{return_url}}}"), mkFooter()]) },
];

export const BLANK = { id: "blank", name: "Blank", category: "Start", desc: "Start from an empty branded layout.", subject: "", preview: "", variables: [], content: doc([logo(), text(""), txFooter()]) };

/** Sample values for previews. */
export const samples = (tpl) => Object.fromEntries((tpl.variables || []).map((x) => [x.name, x.sample ?? x.fallback ?? ""]));
