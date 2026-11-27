// A small API client for the CLI: bearer key, JSON in and out, retries for rate limits and server errors.
// Sends (POST/PATCH) are only retried with an idempotency key, so a retry never sends an email twice.
import { VERSION } from "./version.js";

export class ApiError extends Error {
  constructor(status, name, message) {
    super(message);
    this.status = status;
    this.code = name;
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function createClient({ key, baseUrl, timeout = 30000, maxRetries = 2, fetchImpl = globalThis.fetch }) {
  const base = baseUrl.replace(/\/+$/, "");
  async function request(method, path, body, { query, idempotencyKey } = {}) {
    let url = base + path;
    if (query) {
      const q = Object.entries(query).filter(([, v]) => v !== undefined && v !== null && v !== "").map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`).join("&");
      if (q) url += (url.includes("?") ? "&" : "?") + q;
    }
    const headers = { authorization: `Bearer ${key}`, accept: "application/json", "user-agent": `delivrie-cli/${VERSION}` };
    if (body !== undefined) headers["content-type"] = "application/json";
    if (idempotencyKey) headers["idempotency-key"] = idempotencyKey;
    const retryable = method === "GET" || method === "DELETE" || !!idempotencyKey;
    for (let attempt = 0; ; attempt++) {
      let res;
      try {
        res = await fetchImpl(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(timeout) });
      } catch (e) {
        if (retryable && attempt < maxRetries) { await sleep(500 * 2 ** attempt); continue; }
        const timedOut = e?.name === "TimeoutError" || e?.name === "AbortError";
        throw new ApiError(0, timedOut ? "timeout" : "network_error", timedOut ? `No response from ${base} within ${timeout / 1000}s` : `Couldn't reach ${base} (${e?.cause?.code || e?.message || "network error"})`);
      }
      const text = await res.text();
      let json = null;
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
