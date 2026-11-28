package io.delivrie;

import java.util.Map;

/** Runs against the real API when DELIVRIE_TEST_KEY is set (the Live API test workflow sets it). */
public final class LiveTest {
  public static void main(String[] args) {
    String key = System.getenv("DELIVRIE_TEST_KEY");
    if (key == null || key.isEmpty()) { System.out.println("DELIVRIE_TEST_KEY not set, skipped"); return; }
    String from = System.getenv().getOrDefault("DELIVRIE_TEST_FROM", "Delivrie CI <onboarding@delivrie.io>");
    String run = System.getenv().getOrDefault("GITHUB_RUN_ID", String.valueOf(System.currentTimeMillis() / 1000));
    Delivrie d = new Delivrie(key);
    int fail = 0;
    Map<String, Object> mail = Map.of("from", from, "to", "delivered@test.delivrie.io", "subject", "[CI " + run + "] Java SDK", "text", "Live API test " + run);
    try {
      String k = "java-live-" + run + "-" + System.nanoTime();
      Object a = d.emails().send(mail, k).get("id"), b = d.emails().send(mail, k).get("id");
      if (!(a instanceof String s) || s.length() < 10 || !a.equals(b)) throw new IllegalStateException(a + " / " + b);
      System.out.println("ok    Java SDK: send, and an idempotent retry returns the same email");
    } catch (RuntimeException e) { fail++; System.out.println("FAIL  Java SDK: send\n      " + e.getMessage()); }
    try {
      d.emails().send(Map.of("from", from, "to", "not-an-address", "subject", "x", "text", "x"));
      fail++; System.out.println("FAIL  Java SDK: expected a validation error");
    } catch (DelivrieException e) {
      if (e.status() == 422 && "validation_error".equals(e.name())) System.out.println("ok    Java SDK: API errors throw DelivrieException");
      else { fail++; System.out.println("FAIL  Java SDK: got " + e.status() + " " + e.name()); }
    }
    if (fail > 0) System.exit(1);
  }
}
