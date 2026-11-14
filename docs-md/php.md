# PHP and Laravel

Send email from PHP and Laravel with Delivrie: Laravel's SMTP mailer, Guzzle or curl, and webhook verification.

## Laravel

Laravel's mail system works with the [SMTP relay](/docs/smtp) out of the box, so `Mail::to(...)->send(...)`, notifications and password resets all go through Delivrie. Update `.env`:

```bash .env
MAIL_MAILER=smtp
MAIL_HOST=smtp.delivrie.io
MAIL_PORT=587
MAIL_ENCRYPTION=tls
MAIL_USERNAME=delivrie
MAIL_PASSWORD=dlv_your_key
MAIL_FROM_ADDRESS=hello@mail.acme.com
MAIL_FROM_NAME="Acme"
```

Then clear the config cache (`php artisan config:clear`) and send as usual:

```php
use Illuminate\Support\Facades\Mail;
use App\Mail\OrderShipped;

Mail::to($user)->send(new OrderShipped($order));
```

Already on Laravel's `resend` mailer? Set `RESEND_BASE_URL=https://delivrie.io/api` and `RESEND_API_KEY=dlv_your_key` instead; see [Migrate from Resend](/docs/migrate-from-resend).

## Plain PHP with the HTTP API

```php send.php
<?php
$ch = curl_init('https://delivrie.io/api/emails');
curl_setopt_array($ch, [
    CURLOPT_POST => true,
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_HTTPHEADER => [
        'Authorization: Bearer ' . getenv('DELIVRIE_API_KEY'),
        'Content-Type: application/json',
        'Idempotency-Key: order-1042-receipt',
    ],
    CURLOPT_POSTFIELDS => json_encode([
        'from' => 'Acme <orders@mail.acme.com>',
        'to' => 'ada@example.com',
        'subject' => 'Your receipt',
        'html' => '<p>Thanks for your order.</p>',
    ]),
]);
$body = json_decode(curl_exec($ch), true);
$status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);

if ($status >= 400) {
    throw new RuntimeException("{$body['name']}: {$body['message']}");
}
echo $body['id'];
```

With Guzzle:

```php
$client = new GuzzleHttp\Client(['base_uri' => 'https://delivrie.io/api/']);
$res = $client->post('emails', [
    'headers' => ['Authorization' => 'Bearer ' . getenv('DELIVRIE_API_KEY')],
    'json' => ['from' => 'Acme <hello@mail.acme.com>', 'to' => 'ada@example.com', 'subject' => 'Hi', 'text' => 'Hello'],
]);
$id = json_decode($res->getBody(), true)['id'];
```

## WordPress

Use any SMTP plugin (WP Mail SMTP, FluentSMTP, Post SMTP) with host `smtp.delivrie.io`, port `587`, encryption TLS, username `delivrie` and an API key as the password. See [SMTP](/docs/smtp).

## Verify webhooks

```php webhook.php
<?php
function verify_delivrie_webhook(string $payload, array $headers, string $secret, int $tolerance = 300): array {
    $id = $headers['webhook-id'] ?? '';
    $ts = $headers['webhook-timestamp'] ?? '';
    if (abs(time() - (int) $ts) > $tolerance) throw new Exception('timestamp too old');
    $key = base64_decode(preg_replace('/^whsec_/', '', $secret));
    $expected = base64_encode(hash_hmac('sha256', "$id.$ts.$payload", $key, true));
    foreach (explode(' ', $headers['webhook-signature'] ?? '') as $sig) {
        [$version, $value] = array_pad(explode(',', $sig, 2), 2, '');
        if ($version === 'v1' && hash_equals($expected, $value)) return json_decode($payload, true);
    }
    throw new Exception('invalid signature');
}

$event = verify_delivrie_webhook(
    file_get_contents('php://input'),
    array_change_key_case(getallheaders(), CASE_LOWER),
    getenv('DELIVRIE_WEBHOOK_SECRET'),
);
```

In Laravel, use `$request->getContent()` for the payload and `collect($request->headers->all())->map(fn ($v) => $v[0])->all()` for the headers, and exclude the route from CSRF protection.
