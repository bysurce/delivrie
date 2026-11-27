package delivrie_test

import (
	"context"
	"fmt"
	"log"
	"os"

	delivrie "github.com/bysurce/delivrie/sdk/go"
)

func Example() {
	client := delivrie.New(os.Getenv("DELIVRIE_API_KEY"))
	sent, err := client.Emails.Send(context.Background(), &delivrie.SendEmailRequest{
		From:    "Acme <hi@acme.com>",
		To:      []string{"ada@example.com"},
		Subject: "Your receipt",
		HTML:    "<p>Thanks for your order.</p>",
	}, delivrie.WithIdempotencyKey("order-1042"))
	if err != nil {
		log.Fatal(err)
	}
	fmt.Println(sent.ID)
}
