package delivrie

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"strings"
	"time"
)

// ErrWebhookVerification is wrapped by every error VerifyWebhook returns, so you can check errors.Is.
var ErrWebhookVerification = errors.New("delivrie: webhook verification failed")

type verifyError struct{ msg string }

func (e *verifyError) Error() string { return "delivrie: webhook verification failed: " + e.msg }
func (e *verifyError) Unwrap() error { return ErrWebhookVerification }

// DefaultWebhookTolerance is how far a webhook's timestamp may be from now before it's rejected as a replay.
const DefaultWebhookTolerance = 5 * time.Minute

// VerifyWebhook checks that a webhook request came from Delivrie and isn't a replay, then returns the parsed event.
// Pass the raw request body exactly as received (read it before decoding), the request headers, and the endpoint's
// signing secret (starts with whsec_). Delivrie signs with the Standard Webhooks scheme.
//
//	body, _ := io.ReadAll(r.Body)
//	event, err := delivrie.VerifyWebhook(body, r.Header, os.Getenv("DELIVRIE_WEBHOOK_SECRET"))
//	if err != nil { http.Error(w, "invalid signature", 400); return }
func VerifyWebhook(payload []byte, headers http.Header, secret string) (*WebhookEvent, error) {
	return VerifyWebhookAt(payload, headers, secret, time.Now(), DefaultWebhookTolerance)
}

// VerifyWebhookAt is VerifyWebhook with an explicit clock and tolerance, for tests.
func VerifyWebhookAt(payload []byte, headers http.Header, secret string, now time.Time, tolerance time.Duration) (*WebhookEvent, error) {
	if secret == "" {
		return nil, &verifyError{"missing signing secret"}
	}
	id, ts, sigs := headers.Get("webhook-id"), headers.Get("webhook-timestamp"), headers.Get("webhook-signature")
	if id == "" || ts == "" || sigs == "" {
		return nil, &verifyError{"missing webhook-id, webhook-timestamp or webhook-signature header"}
	}
	sec, err := strconv.ParseInt(ts, 10, 64)
	if err != nil {
		return nil, &verifyError{"invalid webhook-timestamp header"}
	}
	if d := now.Sub(time.Unix(sec, 0)); d > tolerance || d < -tolerance {
		return nil, &verifyError{"timestamp is too old or in the future"}
	}
	key, err := base64.StdEncoding.DecodeString(strings.TrimPrefix(secret, "whsec_"))
	if err != nil {
		return nil, &verifyError{"signing secret isn't valid base64"}
	}
	mac := hmac.New(sha256.New, key)
	mac.Write([]byte(id + "." + ts + "."))
	mac.Write(payload)
	expected := mac.Sum(nil)
	// Several space-separated signatures can arrive during secret rotation; any valid one is enough.
	ok := false
	for _, part := range strings.Fields(sigs) {
		v, sig, found := strings.Cut(part, ",")
		if !found || v != "v1" {
			continue
		}
		if got, err := base64.StdEncoding.DecodeString(sig); err == nil && hmac.Equal(got, expected) {
			ok = true
			break
		}
	}
	if !ok {
		return nil, &verifyError{"signature doesn't match"}
	}
	event := &WebhookEvent{}
	if err := json.Unmarshal(payload, event); err != nil {
		return nil, &verifyError{"body is not valid JSON"}
	}
	return event, nil
}
