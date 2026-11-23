// Names audit-log entries for changes made through the API: "POST /domains" -> domain.created,
// "POST /domains/:id/verify" -> domain.verify, "DELETE /api-keys/:id" -> api_key.deleted. Tested in audit_test.ts.

export const AUDITED = /^\/(domains|api-keys|webhooks|templates|broadcasts|automations|segments|suppressions|topics|contact-properties|team|invites|members|inbox\/labels)(\/|$)|^\/contacts\/[^/]+$/;
const SINGULAR: Record<string, string> = { "api-keys": "api_key", "contact-properties": "contact_property", domains: "domain", webhooks: "webhook", templates: "template", broadcasts: "broadcast", automations: "automation", segments: "segment", suppressions: "suppression", topics: "topic", contacts: "contact", invites: "invite", members: "member", team: "team", inbox: "inbox_label" };
const isId = (x: string) => /^[0-9a-f-]{20,}$|^[a-z]+_[A-Za-z0-9]{8,}$|@/i.test(x);
export function auditAction(method: string, path: string) {
  const parts = path.split("/").filter(Boolean);
  const resource = SINGULAR[parts[0]] || parts[0].replace(/s$/, "").replace(/-/g, "_");
  const last = parts[parts.length - 1];
  const sub = parts.length > 1 && !isId(last) && !(parts[0] === "inbox") ? last.replace(/-/g, "_") : null;
  const verb = sub && method === "POST" ? sub : method === "POST" ? "created" : method === "DELETE" ? "deleted" : "updated";
  return { action: `${resource}.${verb}`, targetId: parts[1] && isId(parts[1]) ? decodeURIComponent(parts[1]) : null, resource };
}
