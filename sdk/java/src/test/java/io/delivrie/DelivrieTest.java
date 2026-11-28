package io.delivrie;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.ArrayList;
import java.util.ArrayDeque;
import java.util.Base64;
import java.util.Deque;
import java.util.List;
import java.util.Map;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;

/** Runs without a test framework: java -cp target/classes:target/test-classes io.delivrie.DelivrieTest */
public final class DelivrieTest {
  record Call(String method, String url, Map<String, String> headers, String body) {}

  static final List<Call> calls = new ArrayList<>();
  static final Deque<Object> responses = new ArrayDeque<>();
  static int passed = 0, failed = 0;

  static Delivrie client(Object... rs) {
    calls.clear(); responses.clear();
    for (Object r : rs) responses.add(r);
    return Delivrie.builder().apiKey("dlv_test").maxRetries(2).transport((m, u, h, b, t) -> {
      calls.add(new Call(m, u, h, b));
      Object r = responses.isEmpty() ? new Delivrie.Response(200, Map.of(), "{}") : responses.poll();
      if (r instanceof java.io.IOException e) throw e;
      return (Delivrie.Response) r;
    }).build();
  }

  static Delivrie.Response ok(String body) { return new Delivrie.Response(200, Map.of(), body); }

  static void eq(Object want, Object got) { if (want == null ? got != null : !want.equals(got)) throw new AssertionError("want " + want + ", got " + got); }

  static void test(String name, Runnable r) {
    try { r.run(); passed++; System.out.println("ok    " + name); }
    catch (Throwable e) { failed++; System.out.println("FAIL  " + name + "\n      " + e); }
  }

  static String path(Call c) { return c.method() + " " + c.url().replace("https://delivrie.io/api", ""); }

  public static void main(String[] args) throws Exception {
    test("json round trip", () -> {
      Object v = Json.parse("{\"a\":[1,2.5,\"x\\n\\u00e9\",true,null],\"b\":{\"c\":-3},\"big\":12345678901234567890}");
      eq("{\"a\":[1,2.5,\"x\\né\",true,null],\"b\":{\"c\":-3},\"big\":12345678901234567890}", Json.write(v));
      eq(1L, ((List<?>) ((Map<?, ?>) v).get("a")).get(0));
    });
    test("send email", () -> {
      Delivrie d = client(ok("{\"id\":\"e1\"}"));
      Map<String, Object> out = d.emails().send(Map.of("from", "Acme <hi@acme.com>", "to", List.of("ada@example.com"), "subject", "Hi"), "k1");
      eq("e1", out.get("id"));
      Call c = calls.get(0);
      eq("POST /emails", path(c));
      eq("Bearer dlv_test", c.headers().get("Authorization"));
      eq("k1", c.headers().get("Idempotency-Key"));
      eq("application/json", c.headers().get("Content-Type"));
      eq(true, c.headers().get("User-Agent").startsWith("delivrie-java/"));
      eq(List.of("ada@example.com"), ((Map<?, ?>) Json.parse(c.body())).get("to"));
    });
    test("ids are encoded, queries sent, POSTs without a body send {}", () -> {
      Delivrie d = client();
      d.contacts().get("ada+1@example.com");
      d.segments().contacts("s 1", Map.of("limit", 5));
      d.broadcasts().cancel("b1");
      d.broadcasts().send("b1");
      eq("GET /contacts/ada%2B1%40example.com", path(calls.get(0)));
      eq("GET /segments/s%201/contacts?limit=5", path(calls.get(1)));
      eq("{}", calls.get(2).body());
      eq("{}", calls.get(3).body());
    });
    test("new endpoints", () -> {
      Delivrie d = client();
      d.broadcasts().duplicate("b1", Map.of("name", "Copy"));
      d.broadcasts().links("b1");
      d.templates().editContent("welcome", Map.of("ops", List.of(Map.of("op", "delete", "id", "x"))));
      d.apiKeys().update("k1", Map.of("name", "Prod"));
      d.emails().receivedAttachments("e1");
      d.segments().removeContacts("s1", Map.of("contacts", List.of("a@b.com")));
      d.contacts().importContacts(Map.of("csv", "email\na@b.com"));
      d.ai().draft(Map.of("url", "https://acme.com"));
      Map<String, Object> q = new java.util.LinkedHashMap<>(); q.put("needs_reply", true); q.put("q", "label:billing");
      d.inbox().threads(q);
      eq(List.of("POST /broadcasts/b1/duplicate", "GET /broadcasts/b1/links", "POST /templates/welcome/content", "PATCH /api-keys/k1", "GET /emails/received/e1/attachments", "DELETE /segments/s1/contacts", "POST /contacts/imports", "POST /ai/draft", "GET /inbox/threads?needs_reply=true&q=label%3Abilling"),
          calls.stream().map(DelivrieTest::path).toList());
    });
    test("errors", () -> {
      Delivrie d = client(new Delivrie.Response(422, Map.of(), "{\"statusCode\":422,\"name\":\"validation_error\",\"message\":\"Missing `to`\"}"));
      try { d.emails().send(Map.of("from", "a")); throw new AssertionError("no exception"); }
      catch (DelivrieException e) { eq(422, e.status()); eq("validation_error", e.name()); eq("Missing `to`", e.getMessage()); }
    });
    test("retries safe requests and idempotent sends only", () -> {
      Delivrie d = client(new Delivrie.Response(503, Map.of(), "oops"), ok("{\"object\":\"list\",\"data\":[]}"));
      eq("list", d.domains().list().get("object"));
      eq(2, calls.size());
      d = client(new Delivrie.Response(503, Map.of(), "oops"), ok("{}"));
      try { d.emails().send(Map.of("from", "a")); throw new AssertionError("no exception"); } catch (DelivrieException e) { eq(503, e.status()); }
      eq(1, calls.size());
      d = client(new Delivrie.Response(429, Map.of("retry-after", "0"), "{}"), ok("{\"id\":\"e2\"}"));
      eq("e2", d.emails().send(Map.of("from", "a"), "k").get("id"));
      d = client(new java.io.IOException("reset"), ok("{}"));
      d.domains().list();
      eq(2, calls.size());
    });
    test("array responses are wrapped", () -> eq(List.of(1L), client(ok("[1]")).logs().list().get("data")));
    test("attachment from a file", () -> {
      try {
        Path f = Files.createTempFile("invoice", ".pdf");
        Files.writeString(f, "PDF");
        Map<String, Object> a = Delivrie.attachment(f);
        eq("UERG", a.get("content"));
        eq(f.getFileName().toString(), a.get("filename"));
      } catch (java.io.IOException e) { throw new RuntimeException(e); }
    });
    test("missing key", () -> {
      if (System.getenv("DELIVRIE_API_KEY") != null) return;
      try { new Delivrie(""); throw new AssertionError("no exception"); } catch (IllegalArgumentException expected) { /* ok */ }
    });
    test("webhooks", () -> {
      try {
        byte[] key = "secret-key-bytes".getBytes(StandardCharsets.UTF_8);
        String secret = "whsec_" + Base64.getEncoder().encodeToString(key);
        String body = "{\"type\":\"email.delivered\",\"data\":{\"email_id\":\"e1\"}}";
        Mac mac = Mac.getInstance("HmacSHA256");
        mac.init(new SecretKeySpec(key, "HmacSHA256"));
        String sig = "v1," + Base64.getEncoder().encodeToString(mac.doFinal(("msg_1.1700000000." + body).getBytes(StandardCharsets.UTF_8)));
        Map<String, Object> h = Map.of("Webhook-Id", "msg_1", "webhook-timestamp", "1700000000", "WEBHOOK-SIGNATURE", List.of("v1,bm9wZQ== " + sig));
        eq("email.delivered", Webhook.verify(body, h, secret, 300, 1700000100).get("type"));
        for (Runnable bad : List.<Runnable>of(
            () -> Webhook.verify(body + " ", h, secret, 300, 1700000000),
            () -> Webhook.verify(body, h, secret, 300, 1700001000),
            () -> Webhook.verify(body, Map.of(), secret, 300, 1700000000),
            () -> Webhook.verify(body, h, "whsec_" + Base64.getEncoder().encodeToString("other".getBytes()), 300, 1700000000))) {
          try { bad.run(); throw new AssertionError("accepted a bad webhook"); } catch (WebhookVerificationException expected) { /* ok */ }
        }
      } catch (Exception e) { throw new RuntimeException(e); }
    });
    System.out.println(passed + " passed, " + failed + " failed");
    if (failed > 0) System.exit(1);
  }
}
