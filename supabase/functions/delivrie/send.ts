import { AwsError, sesv2 } from "./aws.ts";
import { buildMime, EMAIL_RE, parseAddress, parseMime, b64ToBytes } from "./mime.ts";
import { creds } from "./ses.ts";
import { type Any, APP_URL, db, domainOf, emailOnly, FUNCTION_URL, hmacB64, hmacUrl, HttpError, randomToken, setting, SYSTEM_FROM, SYSTEM_REGION } from "./util.ts";
import { renderVars } from "./blocks.js";
import { addGlobalSuppression, screenRecipients } from "./hygiene.ts";

export const TEST_ADDRESSES: Record<string, string> = {
  "delivered@test.delivrie.io": "success@simulator.amazonses.com",
  "bounced@test.delivrie.io": "bounce@simulator.amazonses.com",
  "complained@test.delivrie.io": "complaint@simulator.amazonses.com",
  "suppressed@test.delivrie.io": "suppressionlist@simulator.amazonses.com",
};
const isSimulator = (a: unknown) => String(a).toLowerCase().endsWith("@simulator.amazonses.com");

// ---------------- status precedence ----------------
const RANK: Record<string, number> = { queued: 0, scheduled: 0, sent: 1, delivery_delayed: 2, delivered: 3, opened: 4, clicked: 5, bounced: 8, complained: 9, failed: 9, suppressed: 9, canceled: 9, received: 1 };
export function nextStatus(cur: string, ev: string) {
  if (["bounced", "complained", "failed"].includes(ev)) return ev;
  if (["bounced", "complained", "failed", "canceled", "suppressed"].includes(cur)) return cur;
  return (RANK[ev] ?? 0) > (RANK[cur] ?? 0) ? ev : cur;
}

// ---------------- webhooks ----------------
export async function emit(teamId: string, type: string, data: Any) {
  const { data: hooks } = await db.from("webhooks").select("id,events,status").eq("team_id", teamId).eq("status", "enabled");
  const targets = (hooks || []).filter((h: Any) => (h.events || []).includes(type) || (h.events || []).includes("*"));
  if (!targets.length) return;
  const eventId = "evt_" + randomToken(12);
  const payload = { type, created_at: new Date().toISOString(), data };
  const rows = targets.map((h: Any) => ({ webhook_id: h.id, team_id: teamId, event_id: eventId, event_type: type, payload }));
  const { data: inserted } = await db.from("webhook_deliveries").insert(rows).select("*");
  await Promise.all((inserted || []).map((d: Any) => attemptDelivery(d)));
}

const BACKOFF = [5, 300, 1800, 7200, 18000, 36000, 36000, 36000, 36000, 36000]; // seconds; covers ~72h

export async function signWebhook(secret: string, id: string, ts: number, body: string) {
  const raw = secret.startsWith("whsec_") ? secret.slice(6) : secret;
  return "v1," + await hmacB64(b64ToBytes(raw), `${id}.${ts}.${body}`);
}

// Called when an endpoint keeps failing (index.ts emails the team, at most once a day per webhook).
let onWebhookFailing: ((hook: Any, d: Any, status: number, body: string, next: string | null) => Promise<void>) | null = null;
export function setOnWebhookFailing(fn: typeof onWebhookFailing) { onWebhookFailing = fn; }

export async function attemptDelivery(d: Any, force = false) {
  const { data: hook } = await db.from("webhooks").select("*").eq("id", d.webhook_id).single();
  if (!hook || (hook.status !== "enabled" && !force)) return;
  const body = JSON.stringify(d.payload);
  const ts = Math.floor(Date.now() / 1000);
  let status = 0, text = "";
  try {
    const sig = await signWebhook(hook.signing_secret, d.event_id, ts, body);
    const res = await fetch(hook.endpoint, {
      method: "POST", body, redirect: "manual", signal: AbortSignal.timeout(15000),
      headers: { "content-type": "application/json", "user-agent": "Delivrie-Webhooks/1.0", "webhook-id": d.event_id, "webhook-timestamp": String(ts), "webhook-signature": sig },
    });
    status = res.status; text = (await res.text()).slice(0, 4000);
  } catch (e) { status = 0; text = (e as Error).message.slice(0, 500); }
  const attempts = (d.attempts || 0) + 1;
  const ok = status >= 200 && status < 300;
  const age = (Date.now() - new Date(d.created_at).getTime()) / 1000;
  const wait = BACKOFF[Math.min(attempts - 1, BACKOFF.length - 1)];
  const giveUp = !ok && (age + wait > 72 * 3600);
  await db.from("webhook_deliveries").update({
    status_code: status, response_body: text, attempts, delivered: ok, updated_at: new Date().toISOString(),
    next_attempt_at: ok || giveUp ? null : new Date(Date.now() + wait * 1000).toISOString(),
  }).eq("id", d.id);
  if (!ok && attempts >= 4 && onWebhookFailing) await onWebhookFailing(hook, d, status, text, giveUp ? null : new Date(Date.now() + wait * 1000).toISOString()).catch((e) => console.error("webhook failing alert", e));
}

// ---------------- unsubscribe links ----------------
export async function unsubscribeToken(emailId: string) {
  return `${emailId}.${await hmacUrl(await setting("link_secret"), "unsub:" + emailId)}`;
}
export async function verifyUnsubscribeToken(t: string) {
  const [id, sig] = String(t || "").split(".");
  if (!id || !sig) return null;
  return (await hmacUrl(await setting("link_secret"), "unsub:" + id)) === sig ? id : null;
}

// ---------------- sending ----------------
function isTransient(e: unknown) {
  if (e instanceof AwsError) return e.status >= 500 || /Throttl|TooManyRequests|LimitExceeded/i.test(e.code);
  return true; // network
}

export async function systemDomain() { return SYSTEM_FROM ? domainOf(SYSTEM_FROM) : ""; }

/** Sends one queued email row through SES. Safe to call repeatedly. */
export async function deliver(emailId: string) {
  // claim the row (queued -> sending marker via attempts++) to avoid double sends
  const { data: e } = await db.from("emails").select("*").eq("id", emailId).single();
  if (!e || e.status !== "queued") return;
  // A team paused for its bounce or complaint rate can't send (automations and queued mail included); our own
  // notices to it, like the pause email, still go out.
  if (!(e.tags || []).some((t: Any) => t?.name === "system")) {
    const { data: tm } = await db.from("teams").select("sending_paused_at").eq("id", e.team_id).single();
    if (tm?.sending_paused_at) {
      await db.from("emails").update({ status: "failed", error: "Sending is paused for this account. Contact support@delivrie.io." }).eq("id", e.id);
      await db.from("email_events").insert({ email_id: e.id, team_id: e.team_id, type: "failed", data: { reason: "sending_paused" } });
      return;
    }
  }
  const { data: claimed } = await db.from("emails").update({ attempts: e.attempts + 1 }).eq("id", e.id).eq("attempts", e.attempts).eq("status", "queued").select("id");
  if (!claimed?.length) return;

  // recipients minus suppressions
  const all = [...(e.to || []), ...(e.cc || []), ...(e.bcc || [])].map(emailOnly);
  const { data: sup } = await db.from("suppressions").select("email").eq("team_id", e.team_id).in("email", all);
  const suppressed = new Set((sup || []).map((s: Any) => s.email.toLowerCase()));
  // Then addresses that can't receive mail (bounced for any team, fake or mail-less domains): see hygiene.ts.
  // Our test addresses go to the SES simulator below, so they're never screened.
  const blocked = await screenRecipients(all.filter((a) => !suppressed.has(a) && !TEST_ADDRESSES[a]));
  const keep = (list: string[] | null) => (list || []).filter((a) => !suppressed.has(emailOnly(a)) && !blocked.has(emailOnly(a)));
  if (blocked.size) await db.from("email_events").insert({ email_id: e.id, team_id: e.team_id, type: "suppressed", data: { recipients: [...blocked.keys()], reasons: Object.fromEntries(blocked) } });
  // Test addresses (delivered@ / bounced@ / complained@ test.delivrie.io) go to the SES mailbox simulator,
  // so they exercise the full event pipeline without touching sending reputation.
  const sim = (list: string[]) => list.map((a) => TEST_ADDRESSES[emailOnly(a)] || a);
  const to = sim(keep(e.to)), cc = sim(keep(e.cc)), bcc = sim(keep(e.bcc));
  if (!to.length && !cc.length && !bcc.length) {
    const why = blocked.size ? [...blocked].slice(0, 3).map(([a, r]) => `${a}: ${r}`).join("; ") : "";
    await db.from("emails").update({ status: "suppressed", error: why ? `Not sent, so it can't bounce. ${why}` : "All recipients are on the suppression list" }).eq("id", e.id);
    if (!blocked.size) await db.from("email_events").insert({ email_id: e.id, team_id: e.team_id, type: "suppressed", data: { recipients: all } });
    return;
  }

  // domain / region / configuration set
  const fromDomain = domainOf(e.from);
  let region = SYSTEM_REGION, configSet: string | undefined;
  if (fromDomain && fromDomain !== await systemDomain()) {
    const { data: dom } = await db.from("domains").select("*").eq("team_id", e.team_id).eq("name", fromDomain).maybeSingle();
    const parent = dom || (await db.from("domains").select("*").eq("team_id", e.team_id).eq("status", "verified")).data?.find((d: Any) => fromDomain.endsWith("." + d.name));
    if (!parent || parent.status !== "verified") {
      await fail(e, `The from domain ${fromDomain} is not verified`);
      return;
    }
    region = parent.region; configSet = parent.config_set || undefined;
    if (!e.domain_id) await db.from("emails").update({ domain_id: parent.id }).eq("id", e.id);
  }

  // broadcast personalisation happens at send time
  let html = e.html, text = e.text, subject = e.subject;
  const headers: Record<string, string> = { ...(e.headers || {}) };
  if (e.broadcast_id) {
    const { data: b } = await db.from("broadcasts").select("html,text,subject,team_id").eq("id", e.broadcast_id).single();
    const { data: c } = e.contact_id ? await db.from("contacts").select("*").eq("id", e.contact_id).single() : { data: null };
    const { data: props } = await db.from("contact_properties").select("key,fallback").eq("team_id", e.team_id);
    const token = await unsubscribeToken(e.id);
    const unsubscribeUrl = `${APP_URL}/unsubscribe?t=${token}`;
    const vars = { ...(c?.properties || {}), first_name: c?.first_name, last_name: c?.last_name, email: c?.email, contact_id: c?.id, unsubscribe_url: unsubscribeUrl, preferences_url: unsubscribeUrl, RESEND_UNSUBSCRIBE_URL: unsubscribeUrl };
    const defs = [...(props || []).map((p: Any) => ({ name: p.key, fallback: p.fallback })), { name: "first_name", fallback: "there" }];
    html = renderVars(b?.html || "", vars, defs);
    text = renderVars(b?.text || "", vars, defs);
    subject = renderVars(b?.subject || e.subject, vars, defs);
    headers["List-Unsubscribe"] = `<${FUNCTION_URL}/public/unsubscribe/one-click?t=${token}>, <mailto:unsubscribe@${fromDomain || "delivrie.dev"}?subject=unsubscribe>`;
    headers["List-Unsubscribe-Post"] = "List-Unsubscribe=One-Click";
  }
  headers["X-Entity-Ref-ID"] = e.id;

  const raw = buildMime({ from: e.from, to, cc, replyTo: e.reply_to || undefined, subject, html, text, headers, attachments: e.attachments?.filter((a: Any) => a.content) || [] });
  const rawB64 = btoa(raw); // MIME output is 7-bit ASCII
  const tags = [{ Name: "email_id", Value: e.id }, { Name: "team_id", Value: e.team_id }];
  for (const t of (e.tags || []).slice(0, 8)) if (/^[A-Za-z0-9_-]{1,256}$/.test(t.name) && /^[A-Za-z0-9_-]{1,256}$/.test(String(t.value))) tags.push({ Name: t.name, Value: String(t.value) });
  try {
    const res = await sesv2(creds(), region, "POST", "/v2/email/outbound-emails", {
      FromEmailAddress: parseAddress(e.from).email,
      Destination: { ToAddresses: to.map(emailOnly), CcAddresses: cc.map(emailOnly), BccAddresses: bcc.map(emailOnly) },
      Content: { Raw: { Data: rawB64 } },
      EmailTags: tags,
      ...(configSet ? { ConfigurationSetName: configSet } : {}),
    });
    const now = new Date().toISOString();
    // strip attachment payloads once sent; keep metadata
    const attMeta = (e.attachments || []).map((a: Any) => ({ filename: a.filename, content_type: a.content_type, size: a.content ? Math.floor(a.content.length * 0.75) : a.size }));
    await db.from("emails").update({ status: "sent", sent_at: now, ses_message_id: res.MessageId, html, text, subject, attachments: attMeta, error: null }).eq("id", e.id);
    await db.from("email_events").insert({ email_id: e.id, team_id: e.team_id, type: "sent", data: { message_id: res.MessageId } });
    await emit(e.team_id, "email.sent", payloadFor({ ...e, subject }));
  } catch (err) {
    if (isTransient(err) && e.attempts + 1 < 5) {
      const wait = [30, 120, 600, 1800][e.attempts] || 1800;
      console.error("send retry", e.id, err);
      await db.from("emails").update({ scheduled_at: new Date(Date.now() + wait * 1000).toISOString(), error: "Temporary problem delivering; retrying automatically." }).eq("id", e.id);
      return;
    }
    console.error("send failed", e.id, err);
    await fail(e, customerError(err));
  }
}

// Provider errors are logged for us; customers get a plain explanation without provider names, regions or account details.
function customerError(err: unknown): string {
  const code = err instanceof AwsError ? err.code : "", msg = (err as Error)?.message || "";
  if (/not verified|identit/i.test(msg)) return "The from address isn't on a verified domain. Verify the domain in Domains, then send again.";
  if (/AccountSendingPaused|SendingPaused|sending is paused/i.test(code + msg)) return "Sending is paused on this account. Contact support@delivrie.io.";
  if (/MailFromDomainNotVerified/i.test(code + msg)) return "The domain's bounce (return-path) record isn't verified yet. Check the DNS records in Domains.";
  if (/too large|size|MessageTooLong/i.test(code + msg)) return "The email is too large. Emails, including attachments, must be under 40 MB.";
  if (/Throttl|rate|quota|Daily message quota/i.test(code + msg)) return "Sending limit reached. The email couldn't be sent; try again later.";
  if (/Illegal address|InvalidParameter|address/i.test(code + msg)) return "One of the addresses isn't valid.";
  return "The email couldn't be sent. Contact support@delivrie.io if this keeps happening.";
}

async function fail(e: Any, message: string) {
  await db.from("emails").update({ status: "failed", error: message }).eq("id", e.id);
  await db.from("email_events").insert({ email_id: e.id, team_id: e.team_id, type: "failed", data: { reason: message } });
  await emit(e.team_id, "email.failed", { ...payloadFor(e), failed: { reason: message } });
}

export function payloadFor(e: Any) {
  return { email_id: e.id, from: e.from, to: e.to, subject: e.subject, created_at: e.created_at, ...(e.broadcast_id ? { broadcast_id: e.broadcast_id } : {}), ...(e.tags?.length ? { tags: Object.fromEntries(e.tags.map((t: Any) => [t.name, t.value])) } : {}) };
}

// ---------------- SES events (SNS) ----------------
const MAP: Record<string, string> = { Send: "", Delivery: "delivered", Bounce: "bounced", Complaint: "complained", Open: "opened", Click: "clicked", DeliveryDelay: "delivery_delayed", Reject: "failed", "Rendering Failure": "failed" };

export async function handleSesEvent(msg: Any) {
  if (msg.notificationType === "Received" || msg.receipt) return handleInbound(msg);
  const type = MAP[msg.eventType ?? msg.notificationType];
  if (!type) return;
  const emailId = msg.mail?.tags?.email_id?.[0];
  let e: Any = null;
  if (emailId) e = (await db.from("emails").select("*").eq("id", emailId).maybeSingle()).data;
  if (!e && msg.mail?.messageId) e = (await db.from("emails").select("*").eq("ses_message_id", msg.mail.messageId).maybeSingle()).data;
  if (!e) return;
  let data: Any = {};
  if (type === "delivered") data = { mx_host: msg.delivery?.reportingMTA?.replace(/^dns;\s*/, "") || msg.delivery?.remoteMtaIp, smtp_response: msg.delivery?.smtpResponse, latency_ms: msg.delivery?.processingTimeMillis, recipients: msg.delivery?.recipients };
  if (type === "bounced") data = { type: msg.bounce?.bounceType, sub_type: msg.bounce?.bounceSubType, recipients: msg.bounce?.bouncedRecipients, message: msg.bounce?.bouncedRecipients?.[0]?.diagnosticCode };
  if (type === "complained") data = { feedback_type: msg.complaint?.complaintFeedbackType, user_agent: msg.complaint?.userAgent, recipients: msg.complaint?.complainedRecipients };
  if (type === "opened") data = { user_agent: msg.open?.userAgent, ip: msg.open?.ipAddress };
  if (type === "clicked") data = { link: msg.click?.link, user_agent: msg.click?.userAgent, ip: msg.click?.ipAddress };
  if (type === "delivery_delayed") data = { type: msg.deliveryDelay?.delayType, recipients: msg.deliveryDelay?.delayedRecipients, expiration: msg.deliveryDelay?.expirationTime };
  if (type === "failed") data = { reason: msg.reject?.reason || msg.failure?.errorMessage };
  const at = msg[Object.keys(msg).find((k) => msg[k]?.timestamp && k !== "mail") || ""]?.timestamp || new Date().toISOString();
  await db.from("email_events").insert({ email_id: e.id, team_id: e.team_id, type, data, created_at: at });
  await db.from("emails").update({ status: nextStatus(e.status, type) }).eq("id", e.id);

  // suppression & contact hygiene
  // A real hard bounce: not the simulator, and not SES skipping an address already on a suppression list (those
  // aren't delivery attempts and don't count against reputation).
  const realHard = type === "bounced" && msg.bounce?.bounceType === "Permanent" && !["OnAccountSuppressionList", "OnSuppressionList"].includes(msg.bounce?.bounceSubType);
  if (type === "bounced" && msg.bounce?.bounceType === "Permanent") {
    for (const r of msg.bounce.bouncedRecipients || []) {
      if (isSimulator(r.emailAddress)) continue;
      await db.from("suppressions").upsert({ team_id: e.team_id, email: String(r.emailAddress).toLowerCase(), reason: "bounce" }, { onConflict: "team_id,email", ignoreDuplicates: true });
      await addGlobalSuppression(String(r.emailAddress), "bounce", e.team_id);
    }
  }
  if (type === "complained") {
    for (const r of msg.complaint?.complainedRecipients || []) {
      const addr = String(r.emailAddress).toLowerCase();
      if (isSimulator(addr)) continue;
      await db.from("suppressions").upsert({ team_id: e.team_id, email: addr, reason: "complaint" }, { onConflict: "team_id,email", ignoreDuplicates: true });
      await addGlobalSuppression(addr, "complaint", e.team_id);
      await db.from("contacts").update({ unsubscribed: true }).eq("team_id", e.team_id).eq("email", addr);
    }
  }
  // A bad sender is stopped as its bounces arrive, not hours later (see the bounce breaker in index.ts).
  if ((realHard && !isSimulator(msg.bounce?.bouncedRecipients?.[0]?.emailAddress)) || (type === "complained" && !isSimulator(msg.complaint?.complainedRecipients?.[0]?.emailAddress))) {
    if (onBadSignal) await onBadSignal(e.team_id).catch((err) => console.error("bounce breaker", err));
  }
  const hookType = { delivered: "email.delivered", bounced: "email.bounced", complained: "email.complained", opened: "email.opened", clicked: "email.clicked", delivery_delayed: "email.delivery_delayed", failed: "email.failed" }[type]!;
  await emit(e.team_id, hookType, { ...payloadFor(e), ...(type === "bounced" ? { bounce: data } : {}), ...(type === "clicked" ? { click: data } : {}) });
}

// Set by index.ts: checks a team right after one of its emails hard-bounces or draws a complaint.
let onBadSignal: ((teamId: string) => Promise<void>) | null = null;
export function setOnBadSignal(fn: (teamId: string) => Promise<void>) { onBadSignal = fn; }

// Set by index.ts: throws when the team is over its plan's sending allowance. Forwards are sends, so they obey it.
let quotaCheck: ((teamId: string, n: number) => Promise<void>) | null = null;
export function setQuotaCheck(fn: (teamId: string, n: number) => Promise<void>) { quotaCheck = fn; }

const FORWARD_MAX_BYTES = 10 * 1024 * 1024;

// Automatic forwarding: send a copy of a received email on to the domain's forwarding addresses (for example a
// Gmail inbox). The copy comes from the address that received it, so it passes SPF, DKIM and DMARC, and its
// Reply-To is the original sender, so a reply from the mail app goes straight back to them.
async function autoForward(d: Any, e: Any, rcpt: string, parsed: Any, msg: Any) {
  const to: string[] = (d.receiving_forward_to || []).filter((a: string) => EMAIL_RE.test(a));
  if (!to.length) return;
  const skip = async (reason: string) => { await db.from("email_events").insert({ email_id: e.id, team_id: d.team_id, type: "forward_skipped", data: { reason, to } }); };
  // Never relay spam or viruses, and never forward a forward (two domains forwarding to each other would loop).
  if (msg.receipt?.spamVerdict?.status === "FAIL" || msg.receipt?.virusVerdict?.status === "FAIL") return skip("flagged_as_spam");
  // Read the full parsed headers: only the first 60 are stored on the email, and these can sit after them.
  const hdr: Record<string, string> = parsed?.headers || e.headers || {};
  if (hdr["x-delivrie-forwarded-for"]) return skip("already_forwarded");
  // The same message arriving again (a mailbox that forwards back here, or one email to two addresses) is
  // forwarded once.
  const mid = hdr["message-id"];
  if (mid) {
    const { data: seen } = await db.from("emails").select("id").eq("team_id", d.team_id).eq("direction", "inbound").eq("headers->>message-id", mid).neq("id", e.id).limit(1);
    if (seen?.length) return skip("duplicate_message");
  }
  if (d.status !== "verified" || d.sending_enabled === false) return skip("domain_cannot_send");
  try { if (quotaCheck) await quotaCheck(d.team_id, 1); } catch { return skip("sending_limit_reached"); }
  const sender = parseAddress(e.from || "");
  const senderEmail = emailOnly(e.from || "");
  const name = `${(sender.name || senderEmail || "Unknown sender").replace(/["<>\\\r\n]/g, "").slice(0, 80)} via ${d.name}`;
  const replyTo = [hdr["reply-to"] ? emailOnly(hdr["reply-to"]) : senderEmail].filter((a) => EMAIL_RE.test(a));
  let attachments = (parsed?.attachments || []).filter((a: Any) => a.content).map((a: Any) => ({ filename: a.filename, content: a.content, content_type: a.content_type, ...(a.content_id ? { content_id: a.content_id } : {}) }));
  let note = "";
  if (attachments.reduce((n: number, a: Any) => n + a.content.length * 0.75, 0) > FORWARD_MAX_BYTES) {
    note = `Attachments were too large to forward: ${attachments.map((a: Any) => a.filename).join(", ")}.`;
    attachments = [];
  }
  const html = e.html ? (note ? `<p style="color:#6b6f76">${note}</p>` : "") + e.html : null;
  const text = e.text || (e.html ? null : "(no content)");
  const { data: row, error } = await db.from("emails").insert({
    team_id: d.team_id, domain_id: d.id, from: `"${name}" <${emailOnly(rcpt)}>`, to, reply_to: replyTo.length ? replyTo : null,
    subject: e.subject || "(no subject)", html, text: text && note ? `${note}\n\n${text}` : text,
    headers: { "X-Delivrie-Forwarded-For": emailOnly(rcpt), ...(senderEmail ? { "X-Original-From": senderEmail } : {}) },
    tags: [{ name: "auto_forward", value: e.id }], attachments, status: "queued",
  }).select("id").single();
  if (error || !row) { console.error("auto-forward insert failed", error?.message); return skip("could_not_queue"); }
  await db.from("email_events").insert({ email_id: e.id, team_id: d.team_id, type: "forwarded", data: { to, email_id: row.id } });
  await deliver(row.id);
}

async function handleInbound(msg: Any) {
  const recipients: string[] = msg.receipt?.recipients || msg.mail?.destination || [];
  const raw = msg.content ? new TextDecoder().decode(b64ToBytes(msg.content)) : "";
  const parsed = raw ? parseMime(raw, true) : null;
  const attMeta = (parsed?.attachments || []).map((a) => ({ filename: a.filename, content_type: a.content_type, size: a.size }));
  const seenTeams = new Set<string>();
  for (const rcpt of recipients) {
    const dom = domainOf(rcpt);
    const { data: doms } = await db.from("domains").select("id,team_id,name,status,sending_enabled,receiving_subdomain,receiving_mode,receiving_addresses,receiving_forward_to").eq("receiving_enabled", true);
    // Longest match first so a subdomain set up on its own wins over its parent.
    const d = (doms || []).sort((a: Any, b: Any) => b.name.length - a.name.length).find((x: Any) => dom === x.name || dom.endsWith("." + x.name));
    if (!d || seenTeams.has(d.team_id)) continue;
    if (d.receiving_subdomain && dom !== `${d.receiving_subdomain}.${d.name}`) continue;
    // "Only specific addresses": mail to anything not on the list is dropped.
    if (d.receiving_mode === "specific" && !(d.receiving_addresses || []).includes(String(rcpt).toLowerCase())) continue;
    seenTeams.add(d.team_id);
    const common = msg.mail?.commonHeaders || {};
    const { data: e } = await db.from("emails").insert({
      team_id: d.team_id, domain_id: d.id, direction: "inbound", status: "received",
      from: parsed?.from || common.from?.[0] || msg.mail?.source || "",
      to: parsed?.to?.length ? parsed.to : (common.to || recipients),
      cc: parsed?.cc || common.cc || null,
      subject: parsed?.subject || common.subject || "", html: parsed?.html, text: parsed?.text,
      headers: parsed?.headers ? Object.fromEntries(Object.entries(parsed.headers).slice(0, 60)) : {},
      attachments: attMeta, ses_message_id: msg.mail?.messageId, sent_at: msg.mail?.timestamp,
    }).select().single();
    if (e) {
      await db.from("email_events").insert({ email_id: e.id, team_id: d.team_id, type: "received", data: { spam: msg.receipt?.spamVerdict?.status, virus: msg.receipt?.virusVerdict?.status, spf: msg.receipt?.spfVerdict?.status, dkim: msg.receipt?.dkimVerdict?.status, dmarc: msg.receipt?.dmarcVerdict?.status } });
      await emit(d.team_id, "email.received", { email_id: e.id, from: e.from, to: e.to, subject: e.subject, created_at: e.created_at, message_id: e.headers?.["message-id"] || null, attachments: (e.attachments || []).map((a: Any) => ({ filename: a.filename, content_type: a.content_type, size: a.size })) });
      await autoForward(d, e, rcpt, parsed, msg).catch((err) => console.error("auto-forward failed", e.id, err));
    }
  }
}

// ---------------- validation shared by API + dashboard ----------------
export interface SendBody { from: string; to: string | string[]; subject?: string; html?: string; text?: string; cc?: string | string[]; bcc?: string | string[]; reply_to?: string | string[]; headers?: Record<string, string>; tags?: { name: string; value: string }[]; attachments?: Any[]; scheduled_at?: string; template?: { id: string; variables?: Record<string, unknown> } }

export function validateRecipients(list: string[], field: string) {
  if (list.length > 50) throw new HttpError(422, "validation_error", `${field} can have at most 50 addresses`);
  for (const a of list) if (!EMAIL_RE.test(emailOnly(a))) throw new HttpError(422, "validation_error", `Invalid \`${field}\` address: ${a}`);
}
