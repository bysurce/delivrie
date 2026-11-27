// A small API client for the CLI: bearer key, JSON in and out, retries for rate limits and server errors.
// Sends (POST/PATCH) are only retried with an idempotency key, so a retry never sends an email twice.
import { VERSION } from "./version.js";

export class ApiError extends Error {
  /** HTTP status, or 0 when the API couldn't be reached. */
  declare status: number;
  /** The API's error name, such as "invalid_api_key" or "not_found". */
  declare code: string;
  constructor(status: number, name: string, message: string) {
    super(message);
    this.status = status;
    this.code = name;
  }
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export interface ClientOptions { key: string; baseUrl: string; timeout?: number; maxRetries?: number; fetchImpl?: typeof fetch }
export interface RequestOptions { query?: Record<string, unknown>; idempotencyKey?: string }
export interface Client {
  request(method: string, path: string, body?: unknown, options?: RequestOptions): Promise<any>;
  baseUrl: string;
}

export function createClient({ key, baseUrl, timeout = 30000, maxRetries = 2, fetchImpl = globalThis.fetch }: ClientOptions): Client {
  const base = baseUrl.replace(/\/+$/, "");
  async function request(method: string, path: string, body?: unknown, { query, idempotencyKey }: RequestOptions = {}): Promise<any> {
    let url = base + path;
    if (query) {
      const q = Object.entries(query).filter(([, v]) => v !== undefined && v !== null && v !== "").map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`).join("&");
      if (q) url += (url.includes("?") ? "&" : "?") + q;
    }
    const headers: Record<string, string> = { authorization: `Bearer ${key}`, accept: "application/json", "user-agent": `delivrie-cli/${VERSION}` };
    if (body !== undefined) headers["content-type"] = "application/json";
    if (idempotencyKey) headers["idempotency-key"] = idempotencyKey;
    const retryable = method === "GET" || method === "DELETE" || !!idempotencyKey;
    for (let attempt = 0; ; attempt++) {
      let res: Response;
      try {
        res = await fetchImpl(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(timeout) });
      } catch (e: any) {
        if (retryable && attempt < maxRetries) { await sleep(500 * 2 ** attempt); continue; }
        const timedOut = e?.name === "TimeoutError" || e?.name === "AbortError";
        throw new ApiError(0, timedOut ? "timeout" : "network_error", timedOut ? `No response from ${base} within ${timeout / 1000}s` : `Couldn't reach ${base} (${e?.cause?.code || e?.message || "network error"})`);
      }
      const text = await res.text();
      let json: any = null;
      try { json = text ? JSON.parse(text) : null; } catch { /* not JSON */ }
      if (res.ok) return json;
      const name = (json && json.name) || (res.status === 401 ? "invalid_api_key" : res.status === 404 ? "not_found" : res.status === 429 ? "rate_limit_exceeded" : "application_error");
      if ((res.status === 429 || res.status >= 500) && retryable && attempt < maxRetries) {
        const after = Number(res.headers.get("retry-after"));
        await sleep(Number.isFinite(after) && after > 0 ? Math.min(after, 30) * 1000 : 500 * 2 ** attempt);
        continue;
      }
      throw new ApiError(res.status, name, (json && json.message) || text.slice(0, 300) || `Request failed with status ${res.status}`);
    }
  }
  return { request, baseUrl: base };
}
