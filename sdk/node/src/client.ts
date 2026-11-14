import type {
  ApiKey, Attachment, Automation, Broadcast, Contact, CreateApiKeyRequest, CreateApiKeyResponse, CreateBroadcastRequest,
  CreateContactRequest, CreateDomainRequest, CreateEmailResponse, CreateTemplateRequest, CreateWebhookRequest,
  CreateWebhookResponse, DelivrieErrorResponse, Domain, Email, EmailSummary, ForwardEmailRequest, InboxThread, List,
  ListContactsParams, ListEmailsParams, Log, LogSummary, Metrics, Pagination, ReplyToThreadRequest, RequestOptions, Result,
  Segment, SendEmailRequest, SendEventRequest, Suppression, Template, Topic, UpdateContactRequest, UpdateDomainRequest,
  Usage, Webhook, WebhookDelivery, Deleted,
} from "./types.js";
import { verifyWebhook, type VerifyWebhookOptions } from "./webhooks.js";

export const VERSION = "0.1.0";
const DEFAULT_BASE_URL = "https://delivrie.io/api";

export interface DelivrieOptions {
  /** Defaults to `https://delivrie.io/api`. */
  baseUrl?: string;
  /** Per-request timeout in milliseconds. Default 30000. */
  timeout?: number;
  /** Retries for rate limits, server errors and network errors. Default 2. Sends are only retried with an idempotency key. */
  maxRetries?: number;
  /** A custom fetch, for example in tests or older runtimes. Defaults to the global fetch. */
  fetch?: typeof fetch;
  /** Extra headers sent with every request. */
  headers?: Record<string, string>;
}

type Method = "GET" | "POST" | "PATCH" | "DELETE";
type Query = Record<string, string | number | boolean | undefined | null>;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const enc = encodeURIComponent;

function toBase64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + 0x8000)));
  return btoa(s);
}

function normalizeEmail(e: SendEmailRequest): Record<string, unknown> {
  const { replyTo, scheduledAt, attachments, ...rest } = e;
  const out: Record<string, unknown> = { ...rest };
  if (out.reply_to === undefined && replyTo !== undefined) out.reply_to = replyTo;
  const when = rest.scheduled_at ?? scheduledAt;
  if (when !== undefined) out.scheduled_at = when instanceof Date ? when.toISOString() : when;
  if (attachments) out.attachments = attachments.map((a: Attachment) => ({ ...a, content: typeof a.content === "string" ? a.content : toBase64(a.content) }));
  return out;
}

/**
 * The Delivrie client.
 *
 * ```ts
 * import { Delivrie } from "delivrie";
 * const delivrie = new Delivrie(process.env.DELIVRIE_API_KEY);
 * const { data, error } = await delivrie.emails.send({ from: "Kora <hi@kora.ng>", to: "ada@example.com", subject: "Hi", html: "<p>Hello</p>" });
 * ```
 */
export class Delivrie {
  readonly baseUrl: string;
  private readonly key: string;
  private readonly timeout: number;
  private readonly maxRetries: number;
  private readonly fetchImpl: typeof fetch;
  private readonly extraHeaders: Record<string, string>;

  constructor(apiKey?: string, options: DelivrieOptions = {}) {
    // process.env on Node, Bun and Deno (with --allow-env); absent on edge runtimes, where you pass the key directly.
    const env: Record<string, string | undefined> = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {};
    const key = apiKey ?? env.DELIVRIE_API_KEY;
    if (!key) throw new Error("Missing API key. Pass it to new Delivrie(key) or set DELIVRIE_API_KEY. Create one at https://delivrie.io/api-keys");
    this.key = key;
    this.baseUrl = (options.baseUrl ?? env.DELIVRIE_BASE_URL ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
    this.timeout = options.timeout ?? 30_000;
    this.maxRetries = Math.max(0, options.maxRetries ?? 2);
    const f = options.fetch ?? (typeof fetch !== "undefined" ? fetch : undefined);
    if (!f) throw new Error("No fetch available. Use Node.js 18 or later, or pass options.fetch.");
    this.fetchImpl = f;
    this.extraHeaders = options.headers ?? {};
  }

  /** Low-level request for endpoints the SDK doesn't wrap yet. Paths are relative to the API base, e.g. `/emails`. */
  async request<T>(method: Method, path: string, body?: unknown, opts: RequestOptions & { query?: Query } = {}): Promise<Result<T>> {
    let url = this.baseUrl + path;
    if (opts.query) {
      const q = Object.entries(opts.query).filter(([, v]) => v !== undefined && v !== null).map(([k, v]) => `${enc(k)}=${enc(String(v))}`).join("&");
      if (q) url += (url.includes("?") ? "&" : "?") + q;
    }
    const headers: Record<string, string> = {
      authorization: `Bearer ${this.key}`,
      accept: "application/json",
      "user-agent": `delivrie-node/${VERSION}`,
      ...this.extraHeaders,
    };
    if (body !== undefined) headers["content-type"] = "application/json";
    if (opts.idempotencyKey) headers["idempotency-key"] = opts.idempotencyKey;
    // GET/DELETE are safe to repeat; POST/PATCH only with an idempotency key, so a retry never sends an email twice.
    const retryable = method === "GET" || method === "DELETE" || !!opts.idempotencyKey;

    for (let attempt = 0; ; attempt++) {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(new Error("timeout")), this.timeout);
      const onAbort = () => ctrl.abort(opts.signal?.reason);
      opts.signal?.addEventListener("abort", onAbort, { once: true });
      let res: Response;
      try {
        res = await this.fetchImpl(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal: ctrl.signal });
      } catch (e) {
        clearTimeout(timer); opts.signal?.removeEventListener("abort", onAbort);
        if (opts.signal?.aborted) return { data: null, error: { statusCode: 0, name: "aborted", message: "The request was aborted" } };
        if (retryable && attempt < this.maxRetries) { await sleep(backoff(attempt)); continue; }
        const timedOut = ctrl.signal.aborted;
        return { data: null, error: { statusCode: 0, name: timedOut ? "timeout" : "network_error", message: timedOut ? `No response within ${this.timeout} ms` : (e as Error)?.message || "Network error" } };
      }
      clearTimeout(timer); opts.signal?.removeEventListener("abort", onAbort);

      const text = await res.text();
      let json: unknown = null;
      try { json = text ? JSON.parse(text) : null; } catch { json = null; }
      if (res.ok) return { data: json as T, error: null };

      const err = toError(res.status, json, text);
      const rateLimited = res.status === 429 && err.name === "rate_limit_exceeded";
      if ((rateLimited || res.status >= 500) && retryable && attempt < this.maxRetries) {
        const after = Number(res.headers.get("retry-after"));
        await sleep(Number.isFinite(after) && after > 0 ? Math.min(after, 30) * 1000 : backoff(attempt));
        continue;
      }
      return { data: null, error: err };
    }
  }

  // ---------------------------------------------------------------- resources

  readonly emails = {
    /** Send one email. Returns its id straight away; delivery events arrive through webhooks. */
    send: (email: SendEmailRequest, opts?: RequestOptions) => this.request<CreateEmailResponse>("POST", "/emails", normalizeEmail(email), opts),
    /** Send up to 100 emails in one request (no attachments or scheduling). */
    batch: (emails: SendEmailRequest[], opts?: RequestOptions) => this.request<{ data: CreateEmailResponse[] }>("POST", "/emails/batch", emails.map(normalizeEmail), opts),
    get: (id: string) => this.request<Email>("GET", `/emails/${enc(id)}`),
    list: (params: ListEmailsParams = {}) => this.request<List<EmailSummary>>("GET", "/emails", undefined, { query: { ...params } }),
    /** Received (inbound) emails. */
    listReceived: (params: Pagination = {}) => this.request<List<EmailSummary>>("GET", "/emails/received", undefined, { query: { ...params } }),
    /** Move a scheduled email. */
    update: (id: string, params: { scheduled_at: string | Date }) =>
      this.request<{ object: "email"; id: string }>("PATCH", `/emails/${enc(id)}`, { scheduled_at: params.scheduled_at instanceof Date ? params.scheduled_at.toISOString() : params.scheduled_at }),
    /** Cancel a scheduled email. */
    cancel: (id: string) => this.request<{ object: "email"; id: string }>("POST", `/emails/${enc(id)}/cancel`),
    forward: (id: string, params: ForwardEmailRequest) => this.request<CreateEmailResponse>("POST", `/emails/${enc(id)}/forward`, params),
  };

  readonly domains = {
    create: (params: CreateDomainRequest) => this.request<Domain>("POST", "/domains", params),
    get: (id: string) => this.request<Domain>("GET", `/domains/${enc(id)}`),
    /** Check DNS now and update the domain's status. */
    verify: (id: string) => this.request<Domain>("POST", `/domains/${enc(id)}/verify`),
    update: (id: string, params: UpdateDomainRequest) => this.request<Domain>("PATCH", `/domains/${enc(id)}`, params),
    list: () => this.request<List<Domain>>("GET", "/domains"),
    remove: (id: string) => this.request<Deleted>("DELETE", `/domains/${enc(id)}`),
  };

  readonly apiKeys = {
    create: (params: CreateApiKeyRequest) => this.request<CreateApiKeyResponse>("POST", "/api-keys", params),
    list: () => this.request<List<ApiKey>>("GET", "/api-keys"),
    remove: (id: string) => this.request<Deleted>("DELETE", `/api-keys/${enc(id)}`),
  };

  readonly webhooks = {
    create: (params: CreateWebhookRequest) => this.request<CreateWebhookResponse>("POST", "/webhooks", params),
    list: () => this.request<List<Webhook>>("GET", "/webhooks"),
    /** Recent delivery attempts for a webhook. */
    deliveries: (id: string) => this.request<List<WebhookDelivery>>("GET", `/webhooks/${enc(id)}/events`),
    /** Send a test event to the endpoint. */
    test: (id: string) => this.request<Record<string, unknown>>("POST", `/webhooks/${enc(id)}/test`),
    /** Send a past delivery again. */
    replay: (deliveryId: string) => this.request<Record<string, unknown>>("POST", `/webhook-deliveries/${enc(deliveryId)}/replay`),
    /** Check a webhook request's signature and return the parsed event. Rejects with `WebhookVerificationError` if it isn't from Delivrie. */
    verify: <T = Record<string, unknown>>(opts: VerifyWebhookOptions) => verifyWebhook<T>(opts),
  };

  readonly contacts = {
    create: (params: CreateContactRequest) => this.request<{ object: "contact"; id: string }>("POST", "/contacts", params),
    /** By id or email address. */
    get: (idOrEmail: string) => this.request<Contact>("GET", `/contacts/${enc(idOrEmail)}`),
    update: (idOrEmail: string, params: UpdateContactRequest) => this.request<Contact>("PATCH", `/contacts/${enc(idOrEmail)}`, params),
    list: (params: ListContactsParams = {}) => this.request<List<Contact>>("GET", "/contacts", undefined, { query: { ...params } }),
    remove: (idOrEmail: string) => this.request<Deleted>("DELETE", `/contacts/${enc(idOrEmail)}`),
  };

  readonly segments = {
    create: (params: { name: string }) => this.request<{ object: "segment"; id: string }>("POST", "/segments", params),
    list: () => this.request<List<Segment>>("GET", "/segments"),
    remove: (id: string) => this.request<Deleted>("DELETE", `/segments/${enc(id)}`),
    /** Add contacts by email (they're created if needed). */
    addContacts: (id: string, contacts: Array<string | CreateContactRequest>) =>
      this.request<Record<string, unknown>>("POST", `/segments/${enc(id)}/contacts`, { contacts: contacts.map((c) => (typeof c === "string" ? { email: c } : c)) }),
  };

  readonly topics = { list: () => this.request<List<Topic>>("GET", "/topics") };
  readonly contactProperties = { list: () => this.request<List<Record<string, unknown>>>("GET", "/contact-properties") };

  readonly broadcasts = {
    create: (params: CreateBroadcastRequest) => this.request<{ object: "broadcast"; id: string }>("POST", "/broadcasts", params),
    get: (id: string) => this.request<Broadcast>("GET", `/broadcasts/${enc(id)}`),
    list: () => this.request<List<Broadcast>>("GET", "/broadcasts"),
    /** Send now, or schedule with `scheduled_at`. */
    send: (id: string, params: { scheduled_at?: string | Date } = {}) =>
      this.request<Broadcast>("POST", `/broadcasts/${enc(id)}/send`, params.scheduled_at === undefined ? {} : { scheduled_at: params.scheduled_at instanceof Date ? params.scheduled_at.toISOString() : params.scheduled_at }),
    cancel: (id: string) => this.request<Broadcast>("POST", `/broadcasts/${enc(id)}/cancel`),
    recipients: (id: string) => this.request<List<Record<string, unknown>>>("GET", `/broadcasts/${enc(id)}/recipients`),
    remove: (id: string) => this.request<Deleted>("DELETE", `/broadcasts/${enc(id)}`),
  };

  readonly templates = {
    create: (params: CreateTemplateRequest) => this.request<{ object: "template"; id: string }>("POST", "/templates", params),
    /** By id or alias. */
    get: (idOrAlias: string) => this.request<Template>("GET", `/templates/${enc(idOrAlias)}`),
    list: () => this.request<List<Template>>("GET", "/templates"),
    /** Publish the current draft so sends use it. */
    publish: (id: string) => this.request<Template>("POST", `/templates/${enc(id)}/publish`),
  };

  readonly suppressions = {
    /** Stop sending to one or more addresses. */
    add: (email: string | string[]) => this.request<Record<string, unknown>>("POST", "/suppressions", Array.isArray(email) ? { emails: email } : { email }),
    list: () => this.request<List<Suppression>>("GET", "/suppressions"),
    remove: (email: string) => this.request<Deleted>("DELETE", `/suppressions/${enc(email)}`),
  };

  readonly events = {
    /** Record an event for a contact; live automations listening for it start. */
    send: (params: SendEventRequest) => this.request<Record<string, unknown>>("POST", "/events", params),
    list: () => this.request<List<Record<string, unknown>>>("GET", "/events"),
  };

  readonly automations = {
    list: () => this.request<List<Automation>>("GET", "/automations"),
    get: (id: string) => this.request<Automation>("GET", `/automations/${enc(id)}`),
    create: (params: Record<string, unknown>) => this.request<Automation>("POST", "/automations", params),
    runs: (id: string) => this.request<List<Record<string, unknown>>>("GET", `/automations/${enc(id)}/runs`),
    publish: (id: string) => this.request<Automation>("POST", `/automations/${enc(id)}/publish`),
    pause: (id: string) => this.request<Automation>("POST", `/automations/${enc(id)}/pause`),
    resume: (id: string) => this.request<Automation>("POST", `/automations/${enc(id)}/resume`),
  };

  readonly inbox = {
    threads: {
      list: (params: Pagination & Query = {}) => this.request<List<InboxThread>>("GET", "/inbox/threads", undefined, { query: params }),
      get: (id: string) => this.request<InboxThread>("GET", `/inbox/threads/${enc(id)}`),
      update: (id: string, params: Record<string, unknown>) => this.request<InboxThread>("PATCH", `/inbox/threads/${enc(id)}`, params),
      reply: (id: string, params: ReplyToThreadRequest) => this.request<CreateEmailResponse>("POST", `/inbox/threads/${enc(id)}/reply`, params),
    },
    labels: { list: () => this.request<List<Record<string, unknown>>>("GET", "/inbox/labels") },
  };

  readonly metrics = {
    get: (params: { days?: number; domain_id?: string } = {}) => this.request<Metrics>("GET", "/metrics", undefined, { query: params }),
  };

  readonly logs = {
    list: (params: Pagination = {}) => this.request<List<LogSummary>>("GET", "/logs", undefined, { query: { ...params } }),
    get: (id: string) => this.request<Log>("GET", `/logs/${enc(id)}`),
  };

  readonly usage = { get: () => this.request<Usage>("GET", "/usage") };
}

function backoff(attempt: number) {
  return Math.min(8000, 500 * 2 ** attempt) + Math.floor(Math.random() * 250);
}

function toError(status: number, json: unknown, text: string): DelivrieErrorResponse {
  const j = (json && typeof json === "object" ? json : {}) as Record<string, unknown>;
  return {
    statusCode: typeof j.statusCode === "number" ? j.statusCode : status,
    name: typeof j.name === "string" ? j.name : status === 401 ? "invalid_api_key" : status === 404 ? "not_found" : status === 429 ? "rate_limit_exceeded" : "application_error",
    message: typeof j.message === "string" ? j.message : text.slice(0, 300) || `Request failed with status ${status}`,
  };
}
