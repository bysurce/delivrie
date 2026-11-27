// Every email Delivrie sends its own customers, one builder per use case (Figma: "Email · Headers" → Email use cases).
// Copy follows the designs, with the numbers and promises that are actually true of the product (US dollars,
// the real plan allowances, the real bounce limits).
import { bar, button, callout, checks, code, digits, esc, greet, items, p, quote, rating, records, renderEmail, type Rendered, rows, small, steps } from "./brand-email.ts";

const SITE = "https://delivrie.io";
const first = (n?: string | null) => String(n || "").trim().split(/\s+/)[0] || "";
const n = (x: number) => Number(x || 0).toLocaleString("en-US");
export const usd = (cents: number) => `$${(Number(cents || 0) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const day = (d: string | Date) => new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const when = (d: string | Date) => `${new Date(d).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "UTC" })} UTC`;
const plural = (k: number, one: string, many = one + "s") => `${n(k)} ${k === 1 ? one : many}`;

// ------------------------------------------------------------ Account
/** Supabase Auth templates. `token` etc. are Go template placeholders ({{ .Token }}), filled in by Supabase. */
export const authEmails = {
  confirmation: () => renderEmail({ subject: "Verify your email address", preheader: "Your Delivrie confirmation code is inside.", illustration: "envelope", headline: "Verify your\nemail address",
    blocks: [p("You’re one step from sending your first email. Enter this code on the Delivrie sign-up page so we know it’s really you."), digits("{{ .Token }}"), small("Didn’t sign up for Delivrie with {{ .Email }}? You can safely ignore this email.")] }),
  magic_link: () => renderEmail({ subject: "Your Delivrie sign-in code", preheader: "Enter this code to sign in.", label: "SIGN IN", illustration: "key", headline: "Your sign-in code",
    blocks: [p("Enter this code on the Delivrie sign-in page. It expires in 10 minutes."), digits("{{ .Token }}"), small("Wasn’t you? Ignore this email. No one can sign in without the code.")] }),
  recovery: () => renderEmail({ subject: "Reset your Delivrie password", preheader: "Your password reset code is inside.", label: "ACCOUNT", illustration: "key", headline: "Reset your password",
    blocks: [p("We got a request to reset the password for {{ .Email }}. Enter this code on the reset page, then choose a new password. It expires in 10 minutes."), digits("{{ .Token }}"), small("Didn’t ask for this? Your password hasn’t changed and you can ignore this email.")] }),
  email_change: () => renderEmail({ subject: "Confirm your new email address", preheader: "Your email change code is inside.", label: "ACCOUNT", illustration: "envelope", headline: "Confirm your\nnew email address",
    blocks: [p("You asked to change your Delivrie email from {{ .Email }} to {{ .NewEmail }}. Enter this code to confirm it."), digits("{{ .Token }}"), small("Didn’t ask for this? Ignore this email and your address stays the same.")] }),
  reauthentication: () => renderEmail({ subject: "Your Delivrie verification code", preheader: "Confirm it’s you.", label: "SECURITY", illustration: "shield", headline: "Confirm it’s you",
    blocks: [p("Enter this code to finish the change you’re making to your Delivrie account."), digits("{{ .Token }}"), small("Didn’t do this? Change your password from Profile and reply to this email.")] }),
  invite: () => renderEmail({ subject: "You’ve been invited to Delivrie", preheader: "Accept your invite to Delivrie.", label: "TEAM", illustration: "team", headline: "You’re invited\nto Delivrie",
    blocks: [p("You’ve been invited to a Delivrie workspace with {{ .Email }}. Accept to set your password and get started."), button("Accept invite", "{{ .SiteURL }}/confirm?token_hash={{ .TokenHash }}&type=invite"), small("Not expecting it? You can ignore this email.")] }),
};

export const welcome = (o: { name?: string | null; domain?: string | null; plan?: string }) => renderEmail({
  subject: `Welcome to Delivrie${o.name ? `, ${first(o.name)}` : ""}`, preheader: "Three steps and you’re sending.", label: "WELCOME", illustration: "launch", headline: `Welcome to Delivrie${o.name ? `, ${first(o.name)}` : ""}`,
  blocks: [p(`Your account is ready. Three steps and you’re sending${o.domain ? ` from ${o.domain}` : " from your own domain"}:`),
    steps([["Add your domain", `Add ${o.domain || "your domain"} and copy three DNS records to your provider.`], ["Create an API key", "Store it as DELIVRIE_API_KEY. We only show it once."], ["Send your first email", "Use the SDK or a single curl call."]]),
    code("npm install delivrie"), button("Open your dashboard", `${SITE}/onboarding`), small("Free plan: 4,000 emails a month and 1 domain. No card needed.")],
});

export const teamInvite = (o: { inviter: string; inviterEmail?: string | null; team: string; role: string; link: string }) => renderEmail({
  subject: `${first(o.inviter) || "Someone"} invited you to ${o.team} on Delivrie`, preheader: `Join ${o.team} on Delivrie.`, label: `TEAM · ${o.team}`, illustration: "team", headline: `${first(o.inviter) || "You’re"} invited you\nto ${o.team} on Delivrie`.replace("You’re invited you", "You’re invited"),
  blocks: [p(`${o.inviter || "A teammate"} added you to the ${o.team} workspace. You’ll be able to ${o.role === "admin" ? "manage the workspace, send email, read logs and edit templates" : "send email, read logs and edit templates"}.`),
    rows([["Workspace", o.team], ["Role", o.role === "admin" ? "Admin" : "Member"], ...(o.inviterEmail ? [["Invited by", o.inviterEmail] as [string, string]] : [])]),
    button("Accept invite", o.link), small("This invite expires in 7 days. Not expecting it? You can ignore this email.")],
});

// ------------------------------------------------------------ Security
export const newSignIn = (o: { name?: string | null; device: string; location?: string | null; time: string; ip: string }) => renderEmail({
  subject: "New sign-in to your Delivrie account", preheader: `${o.device}${o.location ? ` in ${o.location}` : ""}.`, link: { text: "Review activity", href: `${SITE}/profile` }, illustration: "shield", headline: "New sign-in to\nyour Delivrie account",
  blocks: [greet(o.name), p("Someone just signed in to your account from a new device or network. If this was you, there’s nothing to do."),
    rows([["Device", o.device], ...(o.location ? [["Location", o.location] as [string, string]] : []), ["Time", when(o.time)], ["IP address", o.ip]]),
    button("This wasn’t me", `${SITE}/profile?security=1`, { dark: true }), small("Change your password straight away, then reply to this email and we’ll help lock the account down.")],
});

export const apiKeyCreated = (o: { team: string; name: string; access: string; domain?: string | null; prefix: string; by: string }) => renderEmail({
  subject: `A new API key was created in ${o.team}`, preheader: `“${o.name}” was added by ${o.by}.`, label: "SECURITY", illustration: "key", headline: "A new API key\nwas created",
  blocks: [p(`A key was added to the ${o.team} workspace. Keys are shown once, so we never email the full value.`),
    rows([["Name", o.name], ["Access", o.access], ["Domain", o.domain || "All domains"], ["Key", `${o.prefix}••••••••`, { mono: true }], ["Created by", o.by]]),
    button("Manage API keys", `${SITE}/api-keys`), small("Didn’t create this key? Delete it now and rotate any secrets that used it.")],
});

export const twoFactorOn = (o: { name?: string | null }) => renderEmail({
  subject: "Two-factor sign-in is now on", preheader: "Your account now needs a code from your authenticator app.", link: { text: "Security settings", href: `${SITE}/profile` }, illustration: "shield", headline: "Two-factor sign-in\nis now on",
  blocks: [greet(o.name), p("From now on, signing in needs your password and a code from your authenticator app."),
    callout("Keep your authenticator safe", "If you lose your phone, reply to this email from this address and we’ll help you get back in after checking it’s you."),
    button("Open security settings", `${SITE}/profile`), small("Turned this on by mistake? You can switch it off in Security settings.")],
});

// ------------------------------------------------------------ Domains & sending
type Rec = { name: string; host: string; ok: boolean; status?: string };
export const domainVerified = (o: { domain: string; records: Rec[]; domainId: string }) => renderEmail({
  subject: `${o.domain} is verified. You’re ready to send.`, preheader: "All records checked out.", label: "DOMAINS", illustration: "globe", headline: `${o.domain} is verified.\nYou’re ready to send.`,
  blocks: [p(`All the records checked out. Mail from ${o.domain} is now signed and authenticated.`), records(o.records),
    code(`await delivrie.emails.send({\n  from: 'hello@${o.domain}',\n  to: 'you@example.com',\n  subject: 'It works',\n  html: '<p>Hello from Delivrie</p>',\n});`),
    button("Send a test email", `${SITE}/domains/${o.domainId}`)],
});

export const dnsCheckFailed = (o: { name?: string | null; domain: string; domainId: string; records: Rec[]; missing?: { host: string; type: string; value: string } | null }) => {
  const okCount = o.records.filter((r) => r.ok).length;
  return renderEmail({
    subject: `We couldn’t verify ${o.domain} yet`, preheader: `${okCount} of ${o.records.length} records found.`, link: { text: "Check again", href: `${SITE}/domains/${o.domainId}` }, illustration: "dns", headline: `We couldn’t verify\n${o.domain} yet`,
    blocks: [greet(o.name), p(`We found ${okCount} of the ${o.records.length} records. ${o.records.filter((r) => !r.ok).map((r) => r.name).join(" and ")} ${o.records.filter((r) => !r.ok).length === 1 ? "is" : "are"} missing or ${o.records.filter((r) => !r.ok).length === 1 ? "doesn’t" : "don’t"} match what we expect.`),
      records(o.records),
      ...(o.missing ? [p(`Add this ${o.missing.type} record at your DNS provider:`), code(`${o.missing.host}   ${o.missing.type}   ${o.missing.value}`)] : []),
      button("Check DNS again", `${SITE}/domains/${o.domainId}`), small("DNS changes can take up to 48 hours. We’ll keep checking and email you when it passes.")],
  });
};

export const bounceWarning = (o: { team: string; rate: number; complaintRate: number; sent: number; bounced: number; source?: string | null; pauseAt: number }) => renderEmail({
  subject: `Your bounce rate hit ${(o.rate * 100).toFixed(1)}%`, preheader: `Sending pauses at ${(o.pauseAt * 100).toFixed(0)}%.`, label: "DELIVERABILITY · WARNING", illustration: "envelope", headline: `Your bounce rate\nhit ${(o.rate * 100).toFixed(1)}%`,
  blocks: [p(`Over the last 7 days, ${(o.rate * 100).toFixed(1)}% of emails from ${o.team} hard-bounced. Inbox providers start filtering senders whose bounces climb, and we pause sending at ${(o.pauseAt * 100).toFixed(0)}% to protect your domain.`),
    rows([["Bounce rate", `${(o.rate * 100).toFixed(1)}%`, { red: true }], ["Complaint rate", `${(o.complaintRate * 100).toFixed(2)}%`], ["Sent (7 days)", n(o.sent)], ["Hard bounces", n(o.bounced)]]),
    ...(o.source ? [p(`Most bounces came from ${o.source}. Remove invalid addresses before your next send.`)] : [p("Remove invalid addresses before your next send, and only email people who asked to hear from you.")]),
    button("Review bounces", `${SITE}/emails?status=bounced`), small(`If the rate passes ${(o.pauseAt * 100).toFixed(0)}%, we’ll pause sending until it’s reviewed.`)],
});

export const sendingPaused = (o: { name?: string | null; team: string; reason: string; rate?: number | null; queued?: number; pausedAt: string }) => renderEmail({
  subject: `Sending is paused for ${o.team}`, preheader: "Nothing is lost: queued emails go out once sending resumes.", link: { text: "Deliverability", href: `${SITE}/docs/deliverability` }, illustration: "shield", headline: `Sending from ${o.team}\nis paused`,
  blocks: [greet(o.name), p(`${o.reason} We paused sending to protect your domain’s reputation. Nothing is lost: queued emails go out once sending resumes.`),
    rows([...(o.rate != null ? [["Bounce rate", `${(o.rate * 100).toFixed(1)}%`, { red: true }] as [string, string, { red: boolean }]] : []), ...(o.queued != null ? [["Queued emails", n(o.queued)] as [string, string]] : []), ["Paused at", when(o.pausedAt)]]),
    checks(["Remove the hard-bounced addresses", "Re-confirm contacts you haven’t emailed in 6 months", "Reply to this email to request a review when you’re ready"]),
    button("Request a review", `mailto:support@delivrie.io?subject=${encodeURIComponent(`Review request: ${o.team}`)}`), small("Most reviews are done within 1 business day.")],
});

// ------------------------------------------------------------ Billing
export const receipt = (o: { number: string; lines: [string, number][]; total: number; paidAt: string; method?: string | null; next?: string | null; invoiceUrl?: string | null }) => renderEmail({
  subject: `Your Delivrie receipt ${o.number}`, preheader: `${usd(o.total)} paid. Thank you.`, label: `RECEIPT · ${o.number}`, illustration: "receipt", headline: "Thanks, your\npayment went through",
  blocks: [rows(o.lines.map(([k, v]) => [k, usd(v)] as [string, string]), { total: ["Total paid", usd(o.total)] }),
    rows([["Paid on", day(o.paidAt)], ...(o.method ? [["Method", o.method] as [string, string]] : []), ...(o.next ? [["Next payment", day(o.next)] as [string, string]] : [])]),
    ...(o.invoiceUrl ? [button("Download invoice (PDF)", o.invoiceUrl)] : []), small("Need your company name or tax ID on invoices? Add them in Billing.")],
});

export const paymentFailed = (o: { amount: number; method?: string | null; plan: string; nextRetry?: string | null; graceUntil?: string | null }) => renderEmail({
  subject: "Your Delivrie payment didn’t go through", preheader: "Update your card to keep your plan.", label: "BILLING · ACTION NEEDED", illustration: "card", headline: "Your payment\ndidn’t go through",
  blocks: [p(`We couldn’t charge ${usd(o.amount)}${o.method ? ` to your ${o.method}` : ""} for the ${o.plan} plan. Your bank declined the payment.`),
    rows([["Amount", usd(o.amount)], ...(o.method ? [["Card", o.method] as [string, string]] : []), ...(o.nextRetry ? [["Next retry", day(o.nextRetry)] as [string, string]] : []), ...(o.graceUntil ? [["Sending continues until", day(o.graceUntil), { red: true }] as [string, string, { red: boolean }]] : [])]),
    button("Update payment method", `${SITE}/billing`), small("Already sorted it with your bank? You can ignore this. We’ll retry automatically.")],
});

export const usageAlert = (o: { name?: string | null; team: string; plan: string; used: number; limit: number; full: boolean; overPer1000?: number | null; nextPlan?: string | null; resets: string }) => renderEmail({
  subject: o.full ? `${o.team} has used all of this month’s emails` : `You’ve used 80% of your monthly emails`, preheader: `${n(o.used)} of ${n(o.limit)} emails sent this month.`, link: { text: "See usage", href: `${SITE}/billing` }, illustration: "gauge",
  headline: o.full ? "You’ve used all of\nyour monthly emails" : "You’ve used 80% of\nyour monthly emails",
  blocks: [greet(o.name), p(`${o.team} has sent ${n(o.used)} of ${n(o.limit)} emails this month. Your quota resets on ${day(o.resets)}.`),
    bar(`${n(o.used)} sent`, n(o.limit), o.used / o.limit),
    callout(o.full ? "What happens now" : "What happens at 100%", o.plan === "free" ? "On the Free plan, sending stops until the month resets. Upgrade to keep sending." : `On ${o.plan}, extra emails cost ${o.overPer1000 != null ? `$${o.overPer1000.toFixed(2)}` : "a small fee"} per 1,000 and keep sending. Nothing stops. You can set a spending cap in Billing.`),
    ...(o.nextPlan ? [button(`Upgrade to ${o.nextPlan}`, `${SITE}/billing`)] : []), small("Want fewer of these? Change usage alerts in Billing.")],
});

export const planUpgraded = (o: { name?: string | null; team: string; plan: string; features: string[]; nextInvoice?: string | null }) => renderEmail({
  subject: `Welcome to the ${o.plan} plan`, preheader: `${o.team} is now on ${o.plan}.`, label: "BILLING", illustration: "launch", headline: `Welcome to the ${o.plan} plan`,
  blocks: [p(`Thanks${o.name ? `, ${first(o.name)}` : ""}.`), p(`${o.team} is now on ${o.plan}. Here’s what you have now:`), checks(o.features),
    button(`Explore ${o.plan}`, `${SITE}/billing`), small(o.nextInvoice ? `Your next invoice is on ${day(o.nextInvoice)}.` : "Your next invoice comes at the start of your next billing period.")],
});

// ------------------------------------------------------------ Developers
export const webhookFailing = (o: { name?: string | null; endpoint: string; event: string; status: number | null; attempts: number; since: string; nextRetry?: string | null; body?: string | null; webhookId: string }) => renderEmail({
  subject: "Your webhook endpoint is failing", preheader: `${o.endpoint} is returning errors.`, link: { text: "Open logs", href: `${SITE}/webhooks/${o.webhookId}` }, illustration: "webhook", headline: "Your webhook\nendpoint is failing",
  blocks: [greet(o.name), p(`Since ${when(o.since)}, requests to your endpoint are returning errors. We’re retrying with backoff.`),
    rows([["Endpoint", o.endpoint.replace(/^https?:\/\//, ""), { mono: true }], ["Event", o.event, { mono: true }], ["Response", o.status ? `HTTP ${o.status}` : "No response", { mono: true, red: true }], ["Failed attempts", n(o.attempts)], ...(o.nextRetry ? [["Next retry", when(o.nextRetry), { mono: true }] as [string, string, { mono: boolean }]] : [])]),
    ...(o.body ? [code(o.body.slice(0, 300))] : []), button("Open webhook logs", `${SITE}/webhooks/${o.webhookId}`), small("Fix the endpoint and we’ll deliver the queued events on the next retry.")],
});

// ------------------------------------------------------------ Support
export const supportReply = (o: { ticket: string; agent: string; initials: string; body: string; link: string; dashboard: boolean }) => renderEmail({
  subject: `${o.agent} replied to your conversation${o.ticket ? ` · ${o.ticket}` : ""}`, preheader: o.body.replace(/```[\s\S]*?```/g, " ").replace(/\s+/g, " ").slice(0, 120), label: `SUPPORT${o.ticket ? ` · ${o.ticket}` : ""}`, illustration: "support", headline: `${o.agent} replied to\nyour conversation`,
  blocks: [quote({ initials: o.initials, who: `${o.agent} · Delivrie Support`, body: o.body }), button("Open conversation", o.link), small(o.dashboard ? `Reply from Contact support in your dashboard, or reply to this email.` : `Reply from Contact support on delivrie.io, or reply to this email.`)],
});

export const supportResolved = (o: { ticket: string; agent: string; summary?: string | null; rate: { bad: string; okay: string; great: string } }) => renderEmail({
  subject: `Your conversation is resolved${o.ticket ? ` · ${o.ticket}` : ""}`, preheader: "How did we do? One click.", label: `SUPPORT${o.ticket ? ` · ${o.ticket}` : ""}`, illustration: "support", headline: "Your conversation is resolved",
  blocks: [p(`${o.agent} marked this as resolved${o.summary ? `: ${o.summary}` : "."}`), rating(o.rate), p("Something still off? Reply in the chat and the conversation reopens.")],
});

/** Internal: a new support request, to everyone on the support team. */
export const supportNewRequest = (o: { ticket: string; who: string; org?: string | null; topic?: string | null; body: string; attachments?: string | null; link: string; fresh: boolean; accepted?: string | null }) => renderEmail({
  subject: o.fresh ? `New support request ${o.ticket} · ${o.who}${o.topic ? ` · ${o.topic}` : ""}` : `${o.ticket} ${o.who} replied${o.accepted ? "" : " · not accepted yet"}`,
  preheader: o.body.replace(/\s+/g, " ").slice(0, 120), label: `SUPPORT · ${o.ticket}`, illustration: "support", headline: o.fresh ? `New request from\n${o.who}` : `${o.who} replied`,
  blocks: [quote({ initials: (o.who.match(/\b\w/g) || ["?"]).slice(0, 2).join("").toUpperCase(), who: `${o.who}${o.org ? ` · ${o.org}` : ""}${o.topic ? ` · ${o.topic}` : ""}`, body: o.body }),
    ...(o.attachments ? [small(`Attached: ${o.attachments}`)] : []),
    button(o.fresh || !o.accepted ? "Open and accept it" : "Reply in Delivrie", o.link), ...(o.fresh ? [small("Everyone on the support team got this. Whoever accepts it first takes it; the others see who did.")] : [])],
});

// ------------------------------------------------------------ Product (these carry an unsubscribe link)
export const whatsNew = (o: { name?: string | null; month: string; intro: string; items: { title: string; text: string }[]; link: string; signoff: [string, string]; unsubscribe: string }) => renderEmail({
  subject: `What’s new in Delivrie · ${o.month}`, preheader: o.items.map((x) => x.title).join(", "), label: o.month.toUpperCase(), illustration: "launch", headline: "What’s new in Delivrie", footer: "product", unsubscribe: o.unsubscribe,
  blocks: [greet(o.name), p(o.intro), items(o.items), button(`See ${o.month}’s updates`, o.link), p(`${esc(o.signoff[0])}<br>${esc(o.signoff[1])}`, { html: true })],
});

export const survey = (o: { name?: string | null; text: string; link: string; thanks?: string | null; unsubscribe: string }) => renderEmail({
  subject: "Help us decide what to build next", preheader: "A 5-minute survey.", link: { text: "Take the survey", href: o.link }, illustration: "survey", headline: "Help us decide\nwhat to build next", footer: "product", unsubscribe: o.unsubscribe,
  blocks: [greet(o.name), p(o.text), button("Take the survey", o.link), ...(o.thanks ? [callout("As a thank you", o.thanks)] : []), p("Thank you, and happy sending.<br>The Delivrie team", { html: true })],
});

export type { Rendered };
