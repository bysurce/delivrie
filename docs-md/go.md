# Go

Send email from Go with Delivrie using net/http, with typed request and error structs, and verify webhooks.

There's no Go module yet; `net/http` and `encoding/json` are all you need. (Already using `resend-go`? Set `RESEND_BASE_URL=https://delivrie.io/api/` and it talks to Delivrie; see [Migrate from Resend](/docs/migrate-from-resend).)

## Send an email

```go main.go
package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"time"
)

type Email struct {
	From    string   `json:"from"`
	To      []string `json:"to"`
	Subject string   `json:"subject"`
	HTML    string   `json:"html,omitempty"`
	Text    string   `json:"text,omitempty"`
	ReplyTo string   `json:"reply_to,omitempty"`
}

type APIError struct {
	StatusCode int    `json:"statusCode"`
	Name       string `json:"name"`
	Message    string `json:"message"`
}

func (e *APIError) Error() string { return e.Name + ": " + e.Message }

var client = &http.Client{Timeout: 30 * time.Second}

func Send(email Email, idempotencyKey string) (string, error) {
	body, _ := json.Marshal(email)
	req, _ := http.NewRequest("POST", "https://delivrie.io/api/emails", bytes.NewReader(body))
	req.Header.Set("Authorization", "Bearer "+os.Getenv("DELIVRIE_API_KEY"))
	req.Header.Set("Content-Type", "application/json")
	if idempotencyKey != "" {
		req.Header.Set("Idempotency-Key", idempotencyKey)
	}
	res, err := client.Do(req)
	if err != nil {
		return "", err
	}
	defer res.Body.Close()
	if res.StatusCode >= 400 {
		var apiErr APIError
		json.NewDecoder(res.Body).Decode(&apiErr)
		return "", &apiErr
	}
	var out struct{ ID string `json:"id"` }
	return out.ID, json.NewDecoder(res.Body).Decode(&out)
}

func main() {
	id, err := Send(Email{
		From:    "Acme <hello@mail.acme.com>",
		To:      []string{"ada@example.com"},
		Subject: "Welcome",
		HTML:    "<p>Welcome to Acme</p>",
	}, "welcome-42")
	if err != nil {
		fmt.Println("send failed:", err)
		return
	}
	fmt.Println("sent", id)
}
```

## Verify webhooks

```go webhook.go
import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"errors"
	"io"
	"net/http"
	"strconv"
	"strings"
	"time"
)

func VerifyWebhook(r *http.Request, secret string) ([]byte, error) {
	payload, err := io.ReadAll(r.Body)
	if err != nil {
		return nil, err
	}
	id, ts := r.Header.Get("webhook-id"), r.Header.Get("webhook-timestamp")
	t, err := strconv.ParseInt(ts, 10, 64)
	if err != nil || time.Since(time.Unix(t, 0)).Abs() > 5*time.Minute {
		return nil, errors.New("bad timestamp")
	}
	key, err := base64.StdEncoding.DecodeString(strings.TrimPrefix(secret, "whsec_"))
	if err != nil {
		return nil, err
	}
	mac := hmac.New(sha256.New, key)
	mac.Write([]byte(id + "." + ts + "."))
	mac.Write(payload)
	expected := base64.StdEncoding.EncodeToString(mac.Sum(nil))
	for _, sig := range strings.Split(r.Header.Get("webhook-signature"), " ") {
		if v, value, ok := strings.Cut(sig, ","); ok && v == "v1" && hmac.Equal([]byte(value), []byte(expected)) {
			return payload, nil
		}
	}
	return nil, errors.New("invalid signature")
}
```

Decode the returned payload into a struct with `Type string` and `Data json.RawMessage` fields, then switch on `Type`.
