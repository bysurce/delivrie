# Test addresses

Test deliveries, bounces, complaints and suppressions with Delivrie's test addresses, without risking your sender reputation.

Send to these addresses to test your integration end to end. They go through the full pipeline, so you get real statuses and real [webhook](/docs/webhooks) events, but no real inbox receives them and they never hurt your reputation.

| Address | What happens | Events you get |
| --- | --- | --- |
| `delivered@test.delivrie.io` | Accepted and delivered | `email.sent`, `email.delivered` |
| `bounced@test.delivrie.io` | Rejected as a hard bounce | `email.sent`, `email.bounced` |
| `complained@test.delivrie.io` | Delivered, then marked as spam | `email.sent`, `email.delivered`, `email.complained` |
| `suppressed@test.delivrie.io` | Rejected as if on the provider's suppression list | `email.sent`, `email.bounced` |

Use the addresses exactly as written. Variations like `delivered+signup@test.delivrie.io` aren't test addresses and would be sent for real.

## Who can send to them

Send from a verified domain, or from the shared sender `onboarding@delivrie.io` before you've verified one.

## Things to know

- Test sends count toward your plan's allowance like any other email.
- Bounces and complaints from test addresses are **not** added to your suppression list, so you can repeat tests.
- Use them in CI: they give you a real round trip (send, then webhook) without emailing anyone.

```ts
// A test that checks your bounce handling end to end
await delivrie.emails.send({
  from: "Acme <onboarding@delivrie.io>",
  to: "bounced@test.delivrie.io",
  subject: "Bounce test",
  text: "This should bounce.",
});
// Your webhook endpoint should receive email.bounced within a few seconds.
```
