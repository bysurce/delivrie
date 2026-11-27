package delivrie

import (
	"context"
	"net/http"
	"net/url"
	"strconv"
)

// Raw is a JSON object for endpoints whose shape varies (automations, metrics, inbox threads).
type Raw = map[string]any

// ---------------------------------------------------------------- emails

// EmailsService sends and inspects emails.
type EmailsService struct{ c *Client }

// Send sends one email. Pass WithIdempotencyKey to make retries safe.
func (s *EmailsService) Send(ctx context.Context, email *SendEmailRequest, opts ...RequestOption) (*SendEmailResponse, error) {
	out := &SendEmailResponse{}
	return out, s.c.Do(ctx, http.MethodPost, "/emails", email, out, opts...)
}

// SendBatch sends up to 100 emails in one request (no attachments or scheduling).
func (s *EmailsService) SendBatch(ctx context.Context, emails []SendEmailRequest, opts ...RequestOption) ([]SendEmailResponse, error) {
	var out struct {
		Data []SendEmailResponse `json:"data"`
	}
	err := s.c.Do(ctx, http.MethodPost, "/emails/batch", emails, &out, opts...)
	return out.Data, err
}

// Get returns an email and its events.
func (s *EmailsService) Get(ctx context.Context, id string) (*Email, error) {
	out := &Email{}
	return out, s.c.Do(ctx, http.MethodGet, "/emails/"+pathEscape(id), nil, out)
}

// List returns recent sent emails, newest first.
func (s *EmailsService) List(ctx context.Context, p *ListParams) (*List[EmailSummary], error) {
	out := &List[EmailSummary]{}
	return out, s.c.Do(ctx, http.MethodGet, "/emails", nil, out, withQuery(pageQuery(p)))
}

// ListReceived returns received (inbound) emails.
func (s *EmailsService) ListReceived(ctx context.Context, p *ListParams) (*List[EmailSummary], error) {
	out := &List[EmailSummary]{}
	return out, s.c.Do(ctx, http.MethodGet, "/emails/received", nil, out, withQuery(pageQuery(p)))
}

// Reschedule moves a scheduled email. when is an RFC 3339 time or a phrase like "in 2 hours".
func (s *EmailsService) Reschedule(ctx context.Context, id, when string) error {
	return s.c.Do(ctx, http.MethodPatch, "/emails/"+pathEscape(id), map[string]string{"scheduled_at": when}, nil)
}

// Cancel cancels a scheduled email.
func (s *EmailsService) Cancel(ctx context.Context, id string) error {
	return s.c.Do(ctx, http.MethodPost, "/emails/"+pathEscape(id)+"/cancel", struct{}{}, nil)
}

// Forward forwards a received email.
func (s *EmailsService) Forward(ctx context.Context, id string, req *ForwardEmailRequest) (*SendEmailResponse, error) {
	out := &SendEmailResponse{}
	return out, s.c.Do(ctx, http.MethodPost, "/emails/"+pathEscape(id)+"/forward", req, out)
}

// ---------------------------------------------------------------- domains

// DomainsService manages sending domains.
type DomainsService struct{ c *Client }

// Create adds a domain and returns the DNS records to add.
func (s *DomainsService) Create(ctx context.Context, req *CreateDomainRequest) (*Domain, error) {
	out := &Domain{}
	return out, s.c.Do(ctx, http.MethodPost, "/domains", req, out)
}

// Get returns a domain with its DNS records.
func (s *DomainsService) Get(ctx context.Context, id string) (*Domain, error) {
	out := &Domain{}
	return out, s.c.Do(ctx, http.MethodGet, "/domains/"+pathEscape(id), nil, out)
}

// List returns the account's domains.
func (s *DomainsService) List(ctx context.Context) (*List[Domain], error) {
	out := &List[Domain]{}
	return out, s.c.Do(ctx, http.MethodGet, "/domains", nil, out)
}

// Verify checks DNS now and returns the updated domain.
func (s *DomainsService) Verify(ctx context.Context, id string) (*Domain, error) {
	out := &Domain{}
	return out, s.c.Do(ctx, http.MethodPost, "/domains/"+pathEscape(id)+"/verify", struct{}{}, out)
}

// Update changes a domain's settings.
func (s *DomainsService) Update(ctx context.Context, id string, req *UpdateDomainRequest) (*Domain, error) {
	out := &Domain{}
	return out, s.c.Do(ctx, http.MethodPatch, "/domains/"+pathEscape(id), req, out)
}

// Delete removes a domain.
func (s *DomainsService) Delete(ctx context.Context, id string) (*Deleted, error) {
	out := &Deleted{}
	return out, s.c.Do(ctx, http.MethodDelete, "/domains/"+pathEscape(id), nil, out)
}

// ---------------------------------------------------------------- API keys

// APIKeysService manages API keys.
type APIKeysService struct{ c *Client }

// Create makes a key. The token in the response is shown once.
func (s *APIKeysService) Create(ctx context.Context, req *CreateAPIKeyRequest) (*CreateAPIKeyResponse, error) {
	out := &CreateAPIKeyResponse{}
	return out, s.c.Do(ctx, http.MethodPost, "/api-keys", req, out)
}

// List returns the account's keys (without the secret part).
func (s *APIKeysService) List(ctx context.Context) (*List[APIKey], error) {
	out := &List[APIKey]{}
	return out, s.c.Do(ctx, http.MethodGet, "/api-keys", nil, out)
}

// Delete revokes a key.
func (s *APIKeysService) Delete(ctx context.Context, id string) (*Deleted, error) {
	out := &Deleted{}
	return out, s.c.Do(ctx, http.MethodDelete, "/api-keys/"+pathEscape(id), nil, out)
}

// ---------------------------------------------------------------- webhooks

// WebhooksService manages webhook endpoints. To check incoming requests, use VerifyWebhook.
type WebhooksService struct{ c *Client }

// Create subscribes an endpoint. The signing secret in the response is shown once.
func (s *WebhooksService) Create(ctx context.Context, req *CreateWebhookRequest) (*CreateWebhookResponse, error) {
	out := &CreateWebhookResponse{}
	return out, s.c.Do(ctx, http.MethodPost, "/webhooks", req, out)
}

// List returns the account's webhooks.
func (s *WebhooksService) List(ctx context.Context) (*List[Webhook], error) {
	out := &List[Webhook]{}
	return out, s.c.Do(ctx, http.MethodGet, "/webhooks", nil, out)
}

// Deliveries returns recent delivery attempts for a webhook.
func (s *WebhooksService) Deliveries(ctx context.Context, id string) (*List[WebhookDelivery], error) {
	out := &List[WebhookDelivery]{}
	return out, s.c.Do(ctx, http.MethodGet, "/webhooks/"+pathEscape(id)+"/events", nil, out)
}

// Test sends a test event to the endpoint.
func (s *WebhooksService) Test(ctx context.Context, id string) (Raw, error) {
	out := Raw{}
	return out, s.c.Do(ctx, http.MethodPost, "/webhooks/"+pathEscape(id)+"/test", struct{}{}, &out)
}

// Replay sends a past delivery again.
func (s *WebhooksService) Replay(ctx context.Context, deliveryID string) (Raw, error) {
	out := Raw{}
	return out, s.c.Do(ctx, http.MethodPost, "/webhook-deliveries/"+pathEscape(deliveryID)+"/replay", struct{}{}, &out)
}

// ---------------------------------------------------------------- contacts, segments, topics

// ContactsService manages contacts.
type ContactsService struct{ c *Client }

// Create adds a contact.
func (s *ContactsService) Create(ctx context.Context, req *CreateContactRequest) (*Created, error) {
	out := &Created{}
	return out, s.c.Do(ctx, http.MethodPost, "/contacts", req, out)
}

// Get returns a contact by id or email address.
func (s *ContactsService) Get(ctx context.Context, idOrEmail string) (*Contact, error) {
	out := &Contact{}
	return out, s.c.Do(ctx, http.MethodGet, "/contacts/"+pathEscape(idOrEmail), nil, out)
}

// Update changes a contact, by id or email address.
func (s *ContactsService) Update(ctx context.Context, idOrEmail string, req *UpdateContactRequest) (*Created, error) {
	out := &Created{}
	return out, s.c.Do(ctx, http.MethodPatch, "/contacts/"+pathEscape(idOrEmail), req, out)
}

// List pages through contacts.
func (s *ContactsService) List(ctx context.Context, p *ListContactsParams) (*List[Contact], error) {
	q := url.Values{}
	if p != nil {
		q = pageQuery(&p.ListParams)
		if p.SegmentID != "" {
			q.Set("segment_id", p.SegmentID)
		}
	}
	out := &List[Contact]{}
	return out, s.c.Do(ctx, http.MethodGet, "/contacts", nil, out, withQuery(q))
}

// Delete removes a contact, by id or email address.
func (s *ContactsService) Delete(ctx context.Context, idOrEmail string) (*Deleted, error) {
	out := &Deleted{}
	return out, s.c.Do(ctx, http.MethodDelete, "/contacts/"+pathEscape(idOrEmail), nil, out)
}

// SegmentsService manages segments.
type SegmentsService struct{ c *Client }

// Create makes a segment.
func (s *SegmentsService) Create(ctx context.Context, name string) (*Created, error) {
	out := &Created{}
	return out, s.c.Do(ctx, http.MethodPost, "/segments", map[string]string{"name": name}, out)
}

// List returns the segments.
func (s *SegmentsService) List(ctx context.Context) (*List[Segment], error) {
	out := &List[Segment]{}
	return out, s.c.Do(ctx, http.MethodGet, "/segments", nil, out)
}

// Delete removes a segment (its contacts stay).
func (s *SegmentsService) Delete(ctx context.Context, id string) (*Deleted, error) {
	out := &Deleted{}
	return out, s.c.Do(ctx, http.MethodDelete, "/segments/"+pathEscape(id), nil, out)
}

// AddContacts adds contacts to a segment by email; they're created if needed.
func (s *SegmentsService) AddContacts(ctx context.Context, id string, emails ...string) (Raw, error) {
	list := make([]map[string]string, len(emails))
	for i, e := range emails {
		list[i] = map[string]string{"email": e}
	}
	out := Raw{}
	return out, s.c.Do(ctx, http.MethodPost, "/segments/"+pathEscape(id)+"/contacts", map[string]any{"contacts": list}, &out)
}

// TopicsService lists subscription topics.
type TopicsService struct{ c *Client }

// List returns the topics.
func (s *TopicsService) List(ctx context.Context) (*List[Topic], error) {
	out := &List[Topic]{}
	return out, s.c.Do(ctx, http.MethodGet, "/topics", nil, out)
}

// ---------------------------------------------------------------- broadcasts, templates

// BroadcastsService manages broadcasts.
type BroadcastsService struct{ c *Client }

// Create drafts a broadcast.
func (s *BroadcastsService) Create(ctx context.Context, req *CreateBroadcastRequest) (*Created, error) {
	out := &Created{}
	return out, s.c.Do(ctx, http.MethodPost, "/broadcasts", req, out)
}

// Get returns a broadcast.
func (s *BroadcastsService) Get(ctx context.Context, id string) (*Broadcast, error) {
	out := &Broadcast{}
	return out, s.c.Do(ctx, http.MethodGet, "/broadcasts/"+pathEscape(id), nil, out)
}

// List returns broadcasts.
func (s *BroadcastsService) List(ctx context.Context) (*List[Broadcast], error) {
	out := &List[Broadcast]{}
	return out, s.c.Do(ctx, http.MethodGet, "/broadcasts", nil, out)
}

// Send sends a broadcast now, or at scheduledAt (RFC 3339 or a phrase) when it isn't empty.
func (s *BroadcastsService) Send(ctx context.Context, id, scheduledAt string) (*Broadcast, error) {
	body := map[string]string{}
	if scheduledAt != "" {
		body["scheduled_at"] = scheduledAt
	}
	out := &Broadcast{}
	return out, s.c.Do(ctx, http.MethodPost, "/broadcasts/"+pathEscape(id)+"/send", body, out)
}

// Cancel cancels a scheduled broadcast.
func (s *BroadcastsService) Cancel(ctx context.Context, id string) (*Broadcast, error) {
	out := &Broadcast{}
	return out, s.c.Do(ctx, http.MethodPost, "/broadcasts/"+pathEscape(id)+"/cancel", struct{}{}, out)
}

// Recipients returns how many contacts the broadcast will reach.
func (s *BroadcastsService) Recipients(ctx context.Context, id string) (Raw, error) {
	out := Raw{}
	return out, s.c.Do(ctx, http.MethodGet, "/broadcasts/"+pathEscape(id)+"/recipients", nil, &out)
}

// Delete removes a draft broadcast.
func (s *BroadcastsService) Delete(ctx context.Context, id string) (*Deleted, error) {
	out := &Deleted{}
	return out, s.c.Do(ctx, http.MethodDelete, "/broadcasts/"+pathEscape(id), nil, out)
}

// TemplatesService manages templates.
type TemplatesService struct{ c *Client }

// Create saves a template draft.
func (s *TemplatesService) Create(ctx context.Context, req *CreateTemplateRequest) (*Created, error) {
	out := &Created{}
	return out, s.c.Do(ctx, http.MethodPost, "/templates", req, out)
}

// Get returns a template by id or alias.
func (s *TemplatesService) Get(ctx context.Context, idOrAlias string) (*Template, error) {
	out := &Template{}
	return out, s.c.Do(ctx, http.MethodGet, "/templates/"+pathEscape(idOrAlias), nil, out)
}

// List returns templates.
func (s *TemplatesService) List(ctx context.Context) (*List[Template], error) {
	out := &List[Template]{}
	return out, s.c.Do(ctx, http.MethodGet, "/templates", nil, out)
}

// Publish makes the current draft the version that sends use.
func (s *TemplatesService) Publish(ctx context.Context, id string) (*Template, error) {
	out := &Template{}
	return out, s.c.Do(ctx, http.MethodPost, "/templates/"+pathEscape(id)+"/publish", struct{}{}, out)
}

// ---------------------------------------------------------------- suppressions, events, automations, inbox

// SuppressionsService manages addresses Delivrie won't send to.
type SuppressionsService struct{ c *Client }

// Add suppresses one or more addresses.
func (s *SuppressionsService) Add(ctx context.Context, emails ...string) (Raw, error) {
	var body any = map[string]any{"emails": emails}
	if len(emails) == 1 {
		body = map[string]string{"email": emails[0]}
	}
	out := Raw{}
	return out, s.c.Do(ctx, http.MethodPost, "/suppressions", body, &out)
}

// List returns suppressed addresses.
func (s *SuppressionsService) List(ctx context.Context) (*List[Suppression], error) {
	out := &List[Suppression]{}
	return out, s.c.Do(ctx, http.MethodGet, "/suppressions", nil, out)
}

// Remove lets an address receive email again.
func (s *SuppressionsService) Remove(ctx context.Context, email string) (*Deleted, error) {
	out := &Deleted{}
	return out, s.c.Do(ctx, http.MethodDelete, "/suppressions/"+pathEscape(email), nil, out)
}

// EventsService records events that start automations.
type EventsService struct{ c *Client }

// Send records an event for a contact.
func (s *EventsService) Send(ctx context.Context, req *SendEventRequest) (Raw, error) {
	out := Raw{}
	return out, s.c.Do(ctx, http.MethodPost, "/events", req, &out)
}

// List returns recent events.
func (s *EventsService) List(ctx context.Context) (*List[Raw], error) {
	out := &List[Raw]{}
	return out, s.c.Do(ctx, http.MethodGet, "/events", nil, out)
}

// AutomationsService manages automations.
type AutomationsService struct{ c *Client }

// List returns automations.
func (s *AutomationsService) List(ctx context.Context) (*List[Raw], error) {
	out := &List[Raw]{}
	return out, s.c.Do(ctx, http.MethodGet, "/automations", nil, out)
}

// Get returns an automation.
func (s *AutomationsService) Get(ctx context.Context, id string) (Raw, error) {
	out := Raw{}
	return out, s.c.Do(ctx, http.MethodGet, "/automations/"+pathEscape(id), nil, &out)
}

// Create makes an automation from its JSON definition.
func (s *AutomationsService) Create(ctx context.Context, def Raw) (Raw, error) {
	out := Raw{}
	return out, s.c.Do(ctx, http.MethodPost, "/automations", def, &out)
}

// Runs returns recent runs of an automation.
func (s *AutomationsService) Runs(ctx context.Context, id string) (*List[Raw], error) {
	out := &List[Raw]{}
	return out, s.c.Do(ctx, http.MethodGet, "/automations/"+pathEscape(id)+"/runs", nil, out)
}

func (s *AutomationsService) action(ctx context.Context, id, a string) (Raw, error) {
	out := Raw{}
	return out, s.c.Do(ctx, http.MethodPost, "/automations/"+pathEscape(id)+"/"+a, struct{}{}, &out)
}

// Publish starts an automation.
func (s *AutomationsService) Publish(ctx context.Context, id string) (Raw, error) {
	return s.action(ctx, id, "publish")
}

// Pause pauses an automation.
func (s *AutomationsService) Pause(ctx context.Context, id string) (Raw, error) {
	return s.action(ctx, id, "pause")
}

// Resume resumes a paused automation.
func (s *AutomationsService) Resume(ctx context.Context, id string) (Raw, error) {
	return s.action(ctx, id, "resume")
}

// InboxService reads and answers conversations in the inbox.
type InboxService struct{ c *Client }

// ListThreads returns inbox conversations. Extra filters (like "needs_reply": "true") go in filters.
func (s *InboxService) ListThreads(ctx context.Context, p *ListParams, filters map[string]string) (*List[Raw], error) {
	q := pageQuery(p)
	for k, v := range filters {
		q.Set(k, v)
	}
	out := &List[Raw]{}
	return out, s.c.Do(ctx, http.MethodGet, "/inbox/threads", nil, out, withQuery(q))
}

// GetThread returns a conversation with its messages.
func (s *InboxService) GetThread(ctx context.Context, id string) (Raw, error) {
	out := Raw{}
	return out, s.c.Do(ctx, http.MethodGet, "/inbox/threads/"+pathEscape(id), nil, &out)
}

// UpdateThread changes a conversation (status, labels, assignee).
func (s *InboxService) UpdateThread(ctx context.Context, id string, changes Raw) (Raw, error) {
	out := Raw{}
	return out, s.c.Do(ctx, http.MethodPatch, "/inbox/threads/"+pathEscape(id), changes, &out)
}

// Reply answers a conversation. reply needs at least "html" or "text".
func (s *InboxService) Reply(ctx context.Context, id string, reply Raw) (*SendEmailResponse, error) {
	out := &SendEmailResponse{}
	return out, s.c.Do(ctx, http.MethodPost, "/inbox/threads/"+pathEscape(id)+"/reply", reply, out)
}

// ---------------------------------------------------------------- metrics, logs, usage

// MetricsService returns sending metrics.
type MetricsService struct{ c *Client }

// Get returns metrics for the last days (default 30), optionally for one domain.
func (s *MetricsService) Get(ctx context.Context, days int, domainID string) (Raw, error) {
	q := url.Values{}
	if days > 0 {
		q.Set("days", strconv.Itoa(days))
	}
	if domainID != "" {
		q.Set("domain_id", domainID)
	}
	out := Raw{}
	return out, s.c.Do(ctx, http.MethodGet, "/metrics", nil, &out, withQuery(q))
}

// LogsService reads API request logs.
type LogsService struct{ c *Client }

// List returns recent API requests.
func (s *LogsService) List(ctx context.Context, p *ListParams) (*List[LogSummary], error) {
	out := &List[LogSummary]{}
	return out, s.c.Do(ctx, http.MethodGet, "/logs", nil, out, withQuery(pageQuery(p)))
}

// Get returns one request with its bodies.
func (s *LogsService) Get(ctx context.Context, id string) (*Log, error) {
	out := &Log{}
	return out, s.c.Do(ctx, http.MethodGet, "/logs/"+pathEscape(id), nil, out)
}

// UsageService reports plan usage.
type UsageService struct{ c *Client }

// Get returns the plan, emails sent this month and today, and credits.
func (s *UsageService) Get(ctx context.Context) (*Usage, error) {
	out := &Usage{}
	return out, s.c.Do(ctx, http.MethodGet, "/usage", nil, out)
}
