package delivrie

import (
	"context"
	"os"
	"testing"
	"time"
)

// Runs against the real API when DELIVRIE_TEST_KEY is set (the Live API test workflow sets it); skipped otherwise.
func TestLive(t *testing.T) {
	key := os.Getenv("DELIVRIE_TEST_KEY")
	if key == "" {
		t.Skip("DELIVRIE_TEST_KEY not set")
	}
	from := os.Getenv("DELIVRIE_TEST_FROM")
	if from == "" {
		from = "Delivrie CI <onboarding@delivrie.io>"
	}
	run := os.Getenv("GITHUB_RUN_ID")
	c := New(key)
	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()

	sent, err := c.Emails.Send(ctx, &SendEmailRequest{From: from, To: []string{"delivered@test.delivrie.io"}, Subject: "[CI " + run + "] Go SDK send", Text: "Live API test " + run})
	if err != nil || len(sent.ID) < 10 {
		t.Fatalf("send: %+v %v", sent, err)
	}
	key2 := "go-live-" + run + "-" + time.Now().Format("150405.000")
	a, err := c.Emails.Send(ctx, &SendEmailRequest{From: from, To: []string{"delivered@test.delivrie.io"}, Subject: "[CI " + run + "] Go idempotent", Text: "x"}, WithIdempotencyKey(key2))
	if err != nil {
		t.Fatal(err)
	}
	b, err := c.Emails.Send(ctx, &SendEmailRequest{From: from, To: []string{"delivered@test.delivrie.io"}, Subject: "[CI " + run + "] Go idempotent", Text: "x"}, WithIdempotencyKey(key2))
	if err != nil || a.ID != b.ID {
		t.Fatalf("idempotent retry gave %s then %s (%v)", a.ID, b.ID, err)
	}
	_, err = c.Emails.Send(ctx, &SendEmailRequest{From: from, To: []string{"delivered@test.delivrie.io"}, Subject: "no body"})
	if e, ok := err.(*Error); !ok || e.StatusCode != 422 || e.Name != "validation_error" {
		t.Fatalf("expected a validation_error, got %v", err)
	}
}
