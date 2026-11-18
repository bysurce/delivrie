# Troubleshooting and FAQ

Answers to the most common Delivrie questions: emails not arriving, going to spam, API errors, webhooks not firing, SMTP connection problems, limits and billing.

## Sending

**My request returns 200 but the email never arrives.**
Open the email in [Emails](https://delivrie.io/emails) (or `GET /emails/:id`) and check its status:
- `suppressed`: every recipient is on your [suppression list](/docs/suppressions).
- `bounced`: the event says why; usually the address doesn't exist.
- `failed`: the `error` field says why, often that the sending domain stopped being verified.
- `delivered`: the recipient's server accepted it. Ask them to check spam and any filters; see the [Deliverability guide](/docs/deliverability).
- `queued` or `sent` for more than a few minutes: check [status](https://delivrie.io/status), then contact us.

**I get "The from domain ... is not verified".**
The domain in `from` must be verified in this team. Check for typos (`mail.acme.com` vs `acme.com`), check the key belongs to the right team, and see [Why isn't my domain verifying?](/docs/domain-not-verifying) While testing, use `onboarding@delivrie.io`.

**I get "... can only send to members of your team".**
You're sending from `onboarding@delivrie.io`, which can only email your teammates and the [test addresses](/docs/test-mode). Verify your own domain to email anyone.

**Can I send from Gmail, Yahoo or Outlook addresses?**
No. You can only send from domains you own and verify. Those providers' DMARC policies would send such mail to spam anyway.

**Emails go to spam.**
Follow [If mail goes to spam](/docs/deliverability). Most often it's a new domain with no history, missing DMARC, or content that looks promotional.

**How do I send to many people at once?**
For different content per person, use [batch sending](/docs/send-email) (100 per request). For the same message to a list, use [broadcasts](/docs/broadcasts). Don't put many recipients in one email's `to`: they'd all see each other.

**Is there a request rate limit?**
There's no fixed per-second limit today. Plan limits are on emails per day and month: see [Plans and limits](/docs/limits). For large sends, use batches or broadcasts rather than thousands of parallel requests.

## API and code

**401 errors.**
`missing_api_key`: the `Authorization` header is missing, often because the environment variable isn't set where the code runs. `invalid_api_key`: the key was deleted, mistyped, or has extra spaces or quotes around it.

**403 restricted_api_key.**
A sending access key can only send. Use a full access key for other endpoints, or check the key's domain restriction.

**CORS errors in the browser.**
Don't call the API from the browser; your key would be public. See [CORS and browser apps](/docs/cors).

**"Request body must be valid JSON".**
Send `Content-Type: application/json` and a JSON body. In cURL, check your quotes; in code, use `JSON.stringify` or your client's JSON option.

**Where can I see exactly what I sent?**
[Logs](https://delivrie.io/logs) has every API request with its request and response bodies, including failures.

## Webhooks

**My endpoint isn't receiving events.**
Check the endpoint is subscribed to those events and enabled, uses `https://`, is publicly reachable (not `localhost`), and returns `2xx` within 15 seconds without redirecting. The endpoint's page in [Webhooks](https://delivrie.io/webhooks) shows each attempt with its status code and response. Use **Send test event** to try it.

**Signature verification fails.**
You're almost certainly verifying a parsed and re-serialised body. Verify the raw body, exactly as received, and use the right endpoint's `whsec_` secret. See [Verify signatures](/docs/webhooks).

**I get the same event twice.**
Retries can deliver an event more than once. Skip events whose `webhook-id` you've already handled.

## SMTP

**Connection times out.** Your host probably blocks port 587 or 465. Use `2587` or `2465`. See [SMTP](/docs/smtp).

**535 authentication failed.** The username must be `delivrie` and the password a valid API key.

## Account and billing

**What happens when I reach my limit?** See [When you reach a limit](/docs/limits).

**Can I change plans any time?** Yes, in [Billing](https://delivrie.io/billing). Teams in Nigeria pay in naira through Paystack; everyone else pays in US dollars through Stripe.

**How long are emails and logs kept?** Email content, sent and received, and API request logs: 30 days on every plan. Recipients, status and events stay after content is deleted. Use [webhooks](/docs/webhooks) to keep your own records.

**Can several people use one account?** Yes: invite teammates in Settings. Free includes one member; Starter and Pro five; Scale unlimited.

## Still stuck?

- Ask in the chat in the bottom corner of the dashboard. Replies arrive there and by email.
- Email [support@delivrie.io](mailto:support@delivrie.io) with the email id or request id from [Logs](https://delivrie.io/logs), so we can find it quickly.
- Check [status](https://delivrie.io/status) for anything affecting everyone.
