package delivrie

import "encoding/json"

// List is a page of results.
type List[T any] struct {
	Object  string `json:"object"`
	Data    []T    `json:"data"`
	HasMore bool   `json:"has_more"`
}

// ListParams pages through a list: Limit 1 to 100 (default 50), Offset to skip.
type ListParams struct {
	Limit  int
	Offset int
}

// Deleted is returned by deletes.
type Deleted struct {
	Object  string `json:"object"`
	ID      string `json:"id"`
	Deleted bool   `json:"deleted"`
}

// ---------------------------------------------------------------- emails

// Tag labels an email. Names and values use ASCII letters, numbers, underscores and dashes.
type Tag struct {
	Name  string `json:"name"`
	Value string `json:"value"`
}

// Attachment is a file sent with an email. Content is the raw file; it is base64-encoded for you. Up to 40 MB per email.
type Attachment struct {
	Filename    string `json:"filename"`
	Content     []byte `json:"content"`
	ContentType string `json:"content_type,omitempty"`
	// ContentID lets the HTML show the file inline with cid:<ContentID>.
	ContentID string `json:"content_id,omitempty"`
}

// TemplateRef sends a published template instead of HTML or text.
type TemplateRef struct {
	// ID is the template id or alias.
	ID        string         `json:"id"`
	Variables map[string]any `json:"variables,omitempty"`
}

// SendEmailRequest is one email. Subject and a body (HTML or Text) are required unless you send a Template.
type SendEmailRequest struct {
	// From is a sender on a verified domain; "Name <email@domain>" sets a display name.
	From    string   `json:"from,omitempty"`
	To      []string `json:"to"`
	Subject string   `json:"subject,omitempty"`
	HTML    string   `json:"html,omitempty"`
	// Text is generated from HTML when left empty.
	Text     string       `json:"text,omitempty"`
	Cc       []string     `json:"cc,omitempty"`
	Bcc      []string     `json:"bcc,omitempty"`
	ReplyTo  []string     `json:"reply_to,omitempty"`
	Template *TemplateRef `json:"template,omitempty"`
	// ScheduledAt is an RFC 3339 time or a phrase like "in 1 hour" or "tomorrow at 9am" (UTC), up to 30 days ahead.
	ScheduledAt string            `json:"scheduled_at,omitempty"`
	Tags        []Tag             `json:"tags,omitempty"`
	Headers     map[string]string `json:"headers,omitempty"`
	Attachments []Attachment      `json:"attachments,omitempty"`
}

// SendEmailResponse holds the new email's id. Delivery events arrive through webhooks or Emails.Get.
type SendEmailResponse struct {
	ID string `json:"id"`
}

// EmailEvent is one step in an email's life, like "email.delivered".
type EmailEvent struct {
	Type      string          `json:"type"`
	Data      json.RawMessage `json:"data"`
	CreatedAt string          `json:"created_at"`
}

// Email is a sent or received email with its events.
type Email struct {
	Object      string       `json:"object"`
	ID          string       `json:"id"`
	From        string       `json:"from"`
	To          []string     `json:"to"`
	Cc          []string     `json:"cc"`
	Bcc         []string     `json:"bcc"`
	ReplyTo     []string     `json:"reply_to"`
	Subject     string       `json:"subject"`
	HTML        string       `json:"html"`
	Text        string       `json:"text"`
	LastEvent   string       `json:"last_event"`
	CreatedAt   string       `json:"created_at"`
	ScheduledAt string       `json:"scheduled_at"`
	Tags        []Tag        `json:"tags"`
	Error       string       `json:"error"`
	Events      []EmailEvent `json:"events"`
}

// EmailSummary is an email in a list.
type EmailSummary struct {
	ID          string   `json:"id"`
	From        string   `json:"from"`
	To          []string `json:"to"`
	Subject     string   `json:"subject"`
	Status      string   `json:"status"`
	LastEvent   string   `json:"last_event"`
	CreatedAt   string   `json:"created_at"`
	ScheduledAt string   `json:"scheduled_at"`
}

// ForwardEmailRequest forwards a received email.
type ForwardEmailRequest struct {
	To   []string `json:"to"`
	From string   `json:"from"`
	Note string   `json:"note,omitempty"`
}

// ---------------------------------------------------------------- domains

// DNSRecord is a record to add at your DNS provider.
type DNSRecord struct {
	Record   string `json:"record"`
	Name     string `json:"name"`
	Type     string `json:"type"`
	Value    string `json:"value"`
	TTL      string `json:"ttl"`
	Priority *int   `json:"priority"`
	Status   string `json:"status"`
	Group    string `json:"group,omitempty"`
}

// Domain is a sending domain.
type Domain struct {
	Object             string      `json:"object"`
	ID                 string      `json:"id"`
	Name               string      `json:"name"`
	Status             string      `json:"status"`
	Region             string      `json:"region"`
	RegionLabel        string      `json:"region_label"`
	Records            []DNSRecord `json:"records"`
	CreatedAt          string      `json:"created_at"`
	ClickTracking      bool        `json:"click_tracking"`
	OpenTracking       bool        `json:"open_tracking"`
	TLS                string      `json:"tls"`
	ReturnPath         string      `json:"return_path"`
	ReceivingEnabled   bool        `json:"receiving_enabled"`
	ReceivingForwardTo []string    `json:"receiving_forward_to"`
}

// CreateDomainRequest adds a domain.
type CreateDomainRequest struct {
	Name          string `json:"name"`
	Region        string `json:"region,omitempty"`
	ReturnPath    string `json:"return_path,omitempty"`
	ClickTracking *bool  `json:"click_tracking,omitempty"`
	OpenTracking  *bool  `json:"open_tracking,omitempty"`
}

// UpdateDomainRequest changes a domain's settings. Leave a field nil to keep it.
type UpdateDomainRequest struct {
	ClickTracking *bool   `json:"click_tracking,omitempty"`
	OpenTracking  *bool   `json:"open_tracking,omitempty"`
	TLS           *string `json:"tls,omitempty"`
	ReturnPath    *string `json:"return_path,omitempty"`
}

// ---------------------------------------------------------------- API keys

// APIKey is a key in a list. The full key is only returned when created.
type APIKey struct {
	ID         string `json:"id"`
	Name       string `json:"name"`
	Prefix     string `json:"prefix"`
	Permission string `json:"permission"`
	DomainID   string `json:"domain_id"`
	LastUsedAt string `json:"last_used_at"`
	CreatedAt  string `json:"created_at"`
}

// CreateAPIKeyRequest makes a key. Permission is "full_access" (default) or "sending_access".
type CreateAPIKeyRequest struct {
	Name       string `json:"name"`
	Permission string `json:"permission,omitempty"`
	DomainID   string `json:"domain_id,omitempty"`
}

// CreateAPIKeyResponse holds the new key. Token is shown once: store it now.
type CreateAPIKeyResponse struct {
	ID    string `json:"id"`
	Token string `json:"token"`
}

// ---------------------------------------------------------------- webhooks

// Webhook is an endpoint that receives events.
type Webhook struct {
	ID        string   `json:"id"`
	Endpoint  string   `json:"endpoint"`
	Events    []string `json:"events"`
	Status    string   `json:"status"`
	CreatedAt string   `json:"created_at"`
}

// CreateWebhookRequest subscribes an https:// endpoint to events, like "email.delivered" or "*" for all.
type CreateWebhookRequest struct {
	Endpoint string   `json:"endpoint"`
	Events   []string `json:"events"`
}

// CreateWebhookResponse holds the signing secret (shown once). Use it with VerifyWebhook.
type CreateWebhookResponse struct {
	Object        string `json:"object"`
	ID            string `json:"id"`
	SigningSecret string `json:"signing_secret"`
}

// WebhookDelivery is one attempt to deliver an event.
type WebhookDelivery struct {
	ID         string `json:"id"`
	EventID    string `json:"event_id"`
	EventType  string `json:"event_type"`
	Delivered  bool   `json:"delivered"`
	Attempts   int    `json:"attempts"`
	StatusCode *int   `json:"status_code"`
	CreatedAt  string `json:"created_at"`
	UpdatedAt  string `json:"updated_at"`
}

// WebhookEvent is the JSON body Delivrie posts to your endpoint.
type WebhookEvent struct {
	Type      string          `json:"type"`
	CreatedAt string          `json:"created_at"`
	Data      json.RawMessage `json:"data"`
}

// ---------------------------------------------------------------- contacts, segments, topics

// Contact is someone in your audience.
type Contact struct {
	Object       string         `json:"object"`
	ID           string         `json:"id"`
	Email        string         `json:"email"`
	FirstName    string         `json:"first_name"`
	LastName     string         `json:"last_name"`
	Unsubscribed bool           `json:"unsubscribed"`
	Properties   map[string]any `json:"properties"`
	CreatedAt    string         `json:"created_at"`
}

// CreateContactRequest adds a contact, optionally into segments.
type CreateContactRequest struct {
	Email        string         `json:"email"`
	FirstName    string         `json:"first_name,omitempty"`
	LastName     string         `json:"last_name,omitempty"`
	Unsubscribed bool           `json:"unsubscribed,omitempty"`
	Properties   map[string]any `json:"properties,omitempty"`
	Segments     []string       `json:"segments,omitempty"`
}

// UpdateContactRequest changes a contact. Leave a field nil to keep it.
type UpdateContactRequest struct {
	FirstName    *string        `json:"first_name,omitempty"`
	LastName     *string        `json:"last_name,omitempty"`
	Unsubscribed *bool          `json:"unsubscribed,omitempty"`
	Properties   map[string]any `json:"properties,omitempty"`
}

// ListContactsParams pages through contacts, optionally within a segment.
type ListContactsParams struct {
	ListParams
	SegmentID string
}

// Created is the id of something just made.
type Created struct {
	Object string `json:"object"`
	ID     string `json:"id"`
}

// Segment is a group of contacts.
type Segment struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	CreatedAt string `json:"created_at"`
}

// Topic is a subscription topic contacts can opt out of.
type Topic struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Description string `json:"description"`
	CreatedAt   string `json:"created_at"`
}

// ---------------------------------------------------------------- broadcasts, templates

// Broadcast is a campaign sent to a segment.
type Broadcast struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Status      string `json:"status"`
	Subject     string `json:"subject"`
	From        string `json:"from"`
	SegmentID   string `json:"segment_id"`
	ScheduledAt string `json:"scheduled_at"`
	SentAt      string `json:"sent_at"`
	CreatedAt   string `json:"created_at"`
}

// CreateBroadcastRequest drafts a broadcast.
type CreateBroadcastRequest struct {
	Name      string `json:"name,omitempty"`
	SegmentID string `json:"segment_id"`
	From      string `json:"from"`
	Subject   string `json:"subject"`
	HTML      string `json:"html,omitempty"`
	Text      string `json:"text,omitempty"`
	ReplyTo   string `json:"reply_to,omitempty"`
	TopicID   string `json:"topic_id,omitempty"`
}

// Template is a saved email design.
type Template struct {
	Object           string `json:"object"`
	ID               string `json:"id"`
	Name             string `json:"name"`
	Alias            string `json:"alias"`
	Status           string `json:"status"`
	Subject          string `json:"subject"`
	From             string `json:"from"`
	HTML             string `json:"html"`
	PublishedVersion *int   `json:"published_version"`
	CreatedAt        string `json:"created_at"`
	UpdatedAt        string `json:"updated_at"`
}

// TemplateVariable is a placeholder in a template, with an optional fallback.
type TemplateVariable struct {
	Key      string `json:"key"`
	Fallback string `json:"fallback,omitempty"`
}

// CreateTemplateRequest saves a template draft.
type CreateTemplateRequest struct {
	Name      string             `json:"name"`
	Alias     string             `json:"alias,omitempty"`
	Subject   string             `json:"subject,omitempty"`
	HTML      string             `json:"html,omitempty"`
	From      string             `json:"from,omitempty"`
	Variables []TemplateVariable `json:"variables,omitempty"`
}

// ---------------------------------------------------------------- suppressions, events, logs, usage, metrics

// Suppression is an address Delivrie won't send to.
type Suppression struct {
	Email     string `json:"email"`
	Reason    string `json:"reason"`
	CreatedAt string `json:"created_at"`
}

// SendEventRequest records an event for a contact; live automations listening for it start.
type SendEventRequest struct {
	Event string         `json:"event"`
	Email string         `json:"email"`
	Data  map[string]any `json:"data,omitempty"`
}

// LogSummary is an API request in a list.
type LogSummary struct {
	ID        string `json:"id"`
	Endpoint  string `json:"endpoint"`
	Method    string `json:"method"`
	Status    int    `json:"status"`
	UserAgent string `json:"user_agent"`
	CreatedAt string `json:"created_at"`
}

// Log is one API request with its bodies.
type Log struct {
	LogSummary
	RequestBody  json.RawMessage `json:"request_body"`
	ResponseBody json.RawMessage `json:"response_body"`
}

// Usage is the plan and how much of it is used.
type Usage struct {
	Object           string `json:"object"`
	Plan             string `json:"plan"`
	MarketingPlan    string `json:"marketing_plan"`
	EmailsThisMonth  int64  `json:"emails_this_month"`
	MonthlyAllowance *int64 `json:"monthly_allowance"`
	EmailsToday      int64  `json:"emails_today"`
	DailyLimit       *int64 `json:"daily_limit"`
	CreditsEmails    int64  `json:"credits_emails"`
}
