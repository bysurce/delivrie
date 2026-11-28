// Shared request helpers for the Delivrie Zapier app.
const API = "https://delivrie.io/api";

// Adds the API key to every request.
const addAuth = (request, z, bundle) => {
  request.headers = request.headers || {};
  if (bundle.authData && bundle.authData.api_key) request.headers.Authorization = `Bearer ${bundle.authData.api_key}`;
  request.headers.Accept = "application/json";
  request.headers["User-Agent"] = "delivrie-zapier/1.0.0";
  return request;
};

// Turns Delivrie's errors ({ statusCode, name, message }) into readable Zapier errors.
const handleErrors = (response, z) => {
  if (response.status >= 400) {
    let body = {};
    try { body = typeof response.json === "object" && response.json ? response.json : JSON.parse(response.content || "{}"); } catch (e) { body = {}; }
    const message = body.message || `Delivrie answered ${response.status}`;
    if (response.status === 401) throw new z.errors.Error(`${message}. Check your Delivrie API key.`, "AuthenticationError", 401);
    if (response.status === 429) throw new z.errors.ThrottledError(message, 30);
    throw new z.errors.Error(message, body.name || "ApiError", response.status);
  }
  return response;
};

const call = async (z, method, path, body, params) => {
  const res = await z.request({ url: API + path, method, body, params, skipThrowForStatus: true });
  return res.data !== undefined ? res.data : res.json;
};

// Line items / dictionaries from Zapier fields arrive as objects; empty strings mean "not set".
const clean = (obj) => {
  const out = {};
  for (const [k, v] of Object.entries(obj || {})) if (v !== undefined && v !== null && v !== "" && !(Array.isArray(v) && !v.length)) out[k] = v;
  return out;
};
const list = (v) => (Array.isArray(v) ? v : String(v || "").split(",")).map((s) => String(s).trim()).filter(Boolean);

module.exports = { API, addAuth, handleErrors, call, clean, list };
