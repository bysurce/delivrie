package io.delivrie;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Base64;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;

/**
 * Verifies webhook requests. Delivrie signs with the Standard Webhooks scheme: webhook-id, webhook-timestamp and
 * webhook-signature headers, the signature being "v1,&lt;base64 HMAC-SHA256 of id.timestamp.body&gt;" keyed with the
 * endpoint's whsec_ signing secret.
 *
 * <pre>{@code
 * Map<String, Object> event = Webhook.verify(body, headers, System.getenv("DELIVRIE_WEBHOOK_SECRET"));
 * }</pre>
 */
public final class Webhook {
  private Webhook() {}

  /** Verifies with a 5-minute tolerance. Headers can be any letter case; values may be strings or lists. */
  public static Map<String, Object> verify(String payload, Map<String, ?> headers, String secret) {
    return verify(payload, headers, secret, 300, System.currentTimeMillis() / 1000);
  }

  @SuppressWarnings("unchecked")
  public static Map<String, Object> verify(String payload, Map<String, ?> headers, String secret, long toleranceSeconds, long nowSeconds) {
    if (secret == null || secret.isEmpty()) throw new WebhookVerificationException("Missing signing secret");
    String id = header(headers, "webhook-id"), ts = header(headers, "webhook-timestamp"), sigs = header(headers, "webhook-signature");
    if (id == null || ts == null || sigs == null) throw new WebhookVerificationException("Missing webhook-id, webhook-timestamp or webhook-signature header");
    if (!ts.matches("\\d+")) throw new WebhookVerificationException("Invalid webhook-timestamp header");
    if (Math.abs(nowSeconds - Long.parseLong(ts)) > toleranceSeconds) throw new WebhookVerificationException("Webhook timestamp is too old or in the future");
    byte[] key;
    try {
      key = Base64.getDecoder().decode(secret.startsWith("whsec_") ? secret.substring(6) : secret);
    } catch (IllegalArgumentException e) {
      throw new WebhookVerificationException("Signing secret isn't valid base64");
    }
    byte[] expected;
    try {
      Mac mac = Mac.getInstance("HmacSHA256");
      mac.init(new SecretKeySpec(key, "HmacSHA256"));
      expected = mac.doFinal((id + "." + ts + "." + payload).getBytes(StandardCharsets.UTF_8));
    } catch (Exception e) {
      throw new WebhookVerificationException("Couldn't compute the signature: " + e.getMessage());
    }
    // Several space-separated signatures can arrive during secret rotation; any valid one is enough.
    boolean ok = false;
    for (String part : sigs.trim().split("\\s+")) {
      String[] vs = part.split(",", 2);
      if (vs.length != 2 || !vs[0].equals("v1")) continue;
      try {
        if (MessageDigest.isEqual(expected, Base64.getDecoder().decode(vs[1]))) { ok = true; break; }
      } catch (IllegalArgumentException ignored) { /* not base64 */ }
    }
    if (!ok) throw new WebhookVerificationException("Signature doesn't match");
    try {
      Object event = Json.parse(payload);
      if (event instanceof Map<?, ?> m) return (Map<String, Object>) m;
    } catch (IllegalArgumentException ignored) { /* falls through */ }
    throw new WebhookVerificationException("Body is not valid JSON");
  }

  private static String header(Map<String, ?> headers, String name) {
    for (Map.Entry<String, ?> e : headers.entrySet()) {
      if (e.getKey() == null || !e.getKey().toLowerCase(Locale.ROOT).equals(name)) continue;
      Object v = e.getValue();
      if (v instanceof List<?> l) v = l.isEmpty() ? null : l.get(0);
      if (v instanceof String[] a) v = a.length == 0 ? null : a[0];
      String s = v == null ? null : v.toString();
      return s == null || s.isEmpty() ? null : s;
    }
    return null;
  }
}
