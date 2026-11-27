// Every Delivrie email with sample data, for checking how they look in a real inbox (see /email-previews in index.ts).
import * as E from "./emails.ts";
import type { Rendered } from "./brand-email.ts";

export function emailPreviews(): [string, Rendered][] {
  const fill = (r: Rendered): Rendered => ({ subject: r.subject, html: r.html.replaceAll("{{ .Token }}", "482915").replaceAll("{{ .Email }}", "maya@acme.com").replaceAll("{{ .NewEmail }}", "maya@acme.io").replaceAll("{{ .SiteURL }}", "https://delivrie.io").replaceAll("{{ .TokenHash }}", "preview"), text: r.text.replaceAll("{{ .Token }}", "482915").replaceAll("{{ .Email }}", "maya@acme.com") });
  const recs = [{ name: "SPF", host: "send.acme.com", ok: true }, { name: "DKIM", host: "delivrie._domainkey.acme.com", ok: false }, { name: "DMARC", host: "_dmarc.acme.com", ok: true }];
    const all: Record<string, Rendered> = {
    "01-verify": E.authEmails.confirmation(), "02-welcome": E.welcome({ name: "Maya Okafor", domain: "acme.com" }), "03-signin-code": E.authEmails.magic_link(), "04-reset": E.authEmails.recovery(),
    "05-team-invite": E.teamInvite({ inviter: "Daniel Eze", inviterEmail: "daniel@acme.com", team: "Acme", role: "member", link: "https://delivrie.io/invite/x" }),
    "06-new-signin": E.newSignIn({ name: "Maya", device: "Chrome on macOS", location: "Abuja, Nigeria", time: "2026-11-26T07:42:00Z", ip: "102.89.•••.14" }),
    "07-api-key": E.apiKeyCreated({ team: "Acme", name: "Production", access: "Sending only", domain: "acme.com", prefix: "dlv_7f2a", by: "Maya Okafor" }),
    "08-2fa": E.twoFactorOn({ name: "Maya" }),
    "09-domain-verified": E.domainVerified({ domain: "acme.com", domainId: "d1", records: recs.map((r) => ({ ...r, ok: true })) }),
    "10-dns-failed": E.dnsCheckFailed({ name: "Maya", domain: "acme.com", domainId: "d1", records: recs, missing: { host: "delivrie._domainkey", type: "TXT", value: "p=MIGfMA0GCSqGSIb3DQEBAQUAA4GN…" } }),
    "11-bounce": E.bounceWarning({ team: "Acme", rate: 0.031, complaintRate: 0.0008, sent: 12480, bounced: 387, source: "the “October update” broadcast", pauseAt: 0.04 }),
    "12-paused": E.sendingPaused({ name: "Maya", team: "Acme", reason: "Your bounce rate reached 4.6% over the last 7 days.", rate: 0.046, queued: 1204, pausedAt: "2026-11-27T13:10:00Z" }),
    "13-receipt": E.receipt({ number: "#DLV-48213", lines: [["Pro plan · monthly", 2000], ["Extra emails (0)", 0]], total: 2000, paidAt: "2026-11-27", method: "Visa •• 4242", next: "2026-12-27", invoiceUrl: "https://pay.stripe.com/x" }),
    "14-payment-failed": E.paymentFailed({ amount: 2000, method: "Visa ending 4242", plan: "Pro", nextRetry: "2026-11-30", graceUntil: "2026-12-04" }),
    "15-usage": E.usageAlert({ name: "Maya", team: "Acme", plan: "Pro", used: 48000, limit: 60000, full: false, overPer1000: 0.45, nextPlan: "Scale", resets: "2026-12-01" }),
    "16-upgraded": E.planUpgraded({ name: "Maya", team: "Acme", plan: "Scale", features: ["100,000 emails a month, no daily limit", "1,000 custom domains", "Multiple team members", "Priority support"], nextInvoice: "2026-12-27" }),
    "17-webhook": E.webhookFailing({ name: "Maya", endpoint: "https://acme.com/hooks", event: "email.delivered", status: 500, attempts: 37, since: "2026-11-27T08:10:00Z", nextRetry: "2026-11-27T14:30:00Z", body: '{ "error": "Internal Server Error" }', webhookId: "w1" }),
    "18-support-reply": E.supportReply({ ticket: "#DLV-2041", agent: "Tolu", initials: "TO", body: "Hi Maya, the headers on em_8f2k1q show dmarc=none, so Gmail soft-fails your receipts.\n\nAdd this TXT record at _dmarc.acme.com and your next send should land in the inbox:\n\n```\nv=DMARC1; p=none; rua=mailto:dmarc@acme.com\n```", link: "https://delivrie.io/emails?support=x", dashboard: true }),
    "19-resolved": E.supportResolved({ ticket: "#DLV-2041", agent: "Tolu", summary: "DMARC is verified and your last send reached Gmail inboxes.", rate: { bad: "#", okay: "#", great: "#" } }),
    "20-whats-new": E.whatsNew({ name: "Maya", month: "November", intro: "November was a big one. Here’s what shipped:", items: [{ title: "Inbox threading", text: "Replies land in one thread, with Message-ID threading done for you." }, { title: "Contact support", text: "Ask the assistant or a person, right from the dashboard." }], link: "https://delivrie.io/changelog", signoff: ["Matthew", "Delivrie"], unsubscribe: "https://delivrie.io/settings" }),
    "21-survey": E.survey({ name: "Maya", text: "We’re planning 2027 and want to build what matters to you. Tell us in a 5-minute survey which features would change your work.", link: "https://delivrie.io/survey", thanks: "Everyone who finishes gets $25 in sending credit, added to your next invoice.", unsubscribe: "https://delivrie.io/settings" }),
    "22-admin-request": E.supportNewRequest({ ticket: "#DLV-2045", who: "Maya Okafor", org: "Acme", topic: "Deliverability", body: "Gmail flags our receipts as spam since Monday.", link: "https://delivrie.io/admin/support?t=x", fresh: true }),
  };
  return Object.entries(all).map(([k, v]) => [k, fill(v)]);
}
