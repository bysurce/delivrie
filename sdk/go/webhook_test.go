package delivrie

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"errors"
	"net/http"
	"strconv"
	"testing"
	"time"
)

const testSecret = "whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw"

func sign(id string, ts int64, body string) string {
	key, _ := base64.StdEncoding.DecodeString(testSecret[6:])
	m := hmac.New(sha256.New, key)
	m.Write([]byte(id + "." + strconv.FormatInt(ts, 10) + "." + body))
	return "v1," + base64.StdEncoding.EncodeToString(m.Sum(nil))
}

func headers(id string, ts int64, sig string) http.Header {
	h := http.Header{}
	h.Set("webhook-id", id)
	h.Set("webhook-timestamp", strconv.FormatInt(ts, 10))
	h.Set("webhook-signature", sig)
	return h
}

func TestVerifyWebhook(t *testing.T) {
	now := time.Unix(1_800_000_000, 0)
	body := `{"type":"email.delivered","created_at":"2026-11-27T10:00:00Z","data":{"email_id":"em_1"}}`
	ev, err := VerifyWebhookAt([]byte(body), headers("msg_1", now.Unix(), "v1,bm90IGl0 "+sign("msg_1", now.Unix(), body)), testSecret, now, DefaultWebhookTolerance)
	if err != nil || ev.Type != "email.delivered" {
		t.Fatalf("got %+v %v", ev, err)
	}
	cases := map[string]http.Header{
		"tampered":  headers("msg_1", now.Unix(), sign("msg_1", now.Unix(), body+" ")),
		"old":       headers("msg_1", now.Unix()-600, sign("msg_1", now.Unix()-600, body)),
		"other id":  headers("msg_2", now.Unix(), sign("msg_1", now.Unix(), body)),
		"no header": {},
	}
	for name, h := range cases {
		if _, err := VerifyWebhookAt([]byte(body), h, testSecret, now, DefaultWebhookTolerance); !errors.Is(err, ErrWebhookVerification) {
			t.Errorf("%s: expected a verification error, got %v", name, err)
		}
	}
}
