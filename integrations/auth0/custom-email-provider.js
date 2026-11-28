/**
 * Auth0 → Delivrie: send Auth0's emails (verification, password reset, welcome, MFA codes, invitations) through
 * Delivrie. In Auth0: Branding → Email Provider → Custom Provider, paste this as the Action code, and add the secrets
 *   DELIVRIE_API_KEY  a Delivrie API key (sending access is enough)
 *   DELIVRIE_FROM     optional, e.g. "Acme <auth@mail.acme.com>" on a verified domain; otherwise Auth0's "From"
 * Guide: https://delivrie.io/docs/auth0
 *
 * @param {Event} event Details about the notification (event.notification: to, from, subject, html, text, message_type, locale)
 * @param {CustomEmailProviderAPI} api Methods to drop or retry the notification
 */
exports.onExecuteCustomEmailProvider = async (event, api) => {
  const n = event.notification;
  const from = event.secrets.DELIVRIE_FROM || n.from;
  // Each notification gets one key, so Auth0's retries never send twice.
  const idempotencyKey = `auth0-${n.message_type}-${n.to}-${event.request?.id || ""}-${(n.subject || "").slice(0, 40)}`.slice(0, 250);
  let res;
  try {
    res = await fetch("https://delivrie.io/api/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${event.secrets.DELIVRIE_API_KEY}`,
        "Content-Type": "application/json",
        "Idempotency-Key": idempotencyKey,
      },
      body: JSON.stringify({
        from,
        to: n.to,
        subject: n.subject,
        html: n.html,
        text: n.text,
        tags: [{ name: "source", value: "auth0" }, { name: "auth0_type", value: String(n.message_type || "email").replace(/[^A-Za-z0-9_-]/g, "_") }],
      }),
    });
  } catch (e) {
    return api.notification.retry(`Couldn't reach Delivrie: ${e.message}`);
  }
  if (res.ok) return;
  const body = await res.json().catch(() => ({}));
  const reason = `Delivrie ${res.status} ${body.name || ""}: ${body.message || ""}`.slice(0, 1000);
  // Rate limits and server errors are worth retrying; a bad address or an unverified sender isn't.
  if (res.status === 429 || res.status >= 500) api.notification.retry(reason);
  else api.notification.drop(reason);
};
