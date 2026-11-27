// Attachment files for sent and received emails, kept in the private "attachments" storage bucket so the API can
// hand out short-lived download links. Emails store metadata only: { id, filename, content_type, size, path }.
// Files follow the 30-day content retention: purge_expired_content() queues their paths in attachment_purge and
// purgeAttachments() (run from the cron) deletes them.
import { type Any, db } from "./util.ts";

const BUCKET = "attachments";
const LINK_TTL = 3600; // seconds

function b64ToBytes(b64: string) {
  const bin = atob(b64.replace(/\s+/g, ""));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
const safeName = (n: string) => (n || "attachment").replace(/[\\/\0-\x1f]/g, "_").replace(/\.\.+/g, ".").slice(-120) || "attachment";

/** Uploads attachments that still carry base64 `content` and returns their metadata (content dropped). */
export async function storeAttachments(teamId: string, emailId: string, list: Any[] | null | undefined): Promise<Any[]> {
  const out: Any[] = [];
  for (const [i, a] of (list || []).entries()) {
    const meta: Any = { id: `att_${i + 1}`, filename: a.filename, content_type: a.content_type || "application/octet-stream", size: a.size ?? (a.content ? Math.floor(String(a.content).length * 0.75) : null) };
    if (a.content_id) meta.content_id = a.content_id;
    if (a.path && !a.content) meta.path = a.path; // already stored
    if (a.content) {
      const path = `${teamId}/${emailId}/${i + 1}-${safeName(a.filename)}`;
      try {
        const bytes = b64ToBytes(String(a.content));
        meta.size = bytes.length;
        const { error } = await db.storage.from(BUCKET).upload(path, bytes, { contentType: meta.content_type, upsert: true });
        if (error) console.error("attachment upload failed", emailId, error.message);
        else meta.path = path;
      } catch (e) { console.error("attachment upload failed", emailId, (e as Error).message); }
    }
    out.push(meta);
  }
  return out;
}

/** The attachments of an email with download links valid for an hour. Files from before storage existed have none. */
export async function attachmentLinks(e: Any) {
  const list: Any[] = Array.isArray(e.attachments) ? e.attachments : [];
  const paths = list.map((a) => a.path).filter(Boolean);
  const signed = new Map<string, string>();
  if (paths.length) {
    const { data } = await db.storage.from(BUCKET).createSignedUrls(paths, LINK_TTL, { download: true });
    for (const s of data || []) if (s.signedUrl && s.path) signed.set(s.path, s.signedUrl);
  }
  const expires = new Date(Date.now() + LINK_TTL * 1000).toISOString();
  return list.map((a, i) => {
    const url = a.path ? signed.get(a.path) || null : null;
    return { object: "attachment", id: a.id || `att_${i + 1}`, filename: a.filename, content_type: a.content_type, size: a.size ?? null, ...(a.content_id ? { content_id: a.content_id } : {}), download_url: url, expires_at: url ? expires : null, ...(url ? {} : { note: "The file isn't stored: it was sent or received before attachment storage, or it's past the 30-day retention." }) };
  });
}

/** Deletes files of expired emails (queued by purge_expired_content). */
export async function purgeAttachments() {
  const { data } = await db.from("attachment_purge").select("path").order("queued_at").limit(500);
  if (!data?.length) return 0;
  const paths = data.map((r: Any) => r.path);
  const { error } = await db.storage.from(BUCKET).remove(paths);
  if (error) { console.error("attachment purge failed", error.message); return 0; }
  await db.from("attachment_purge").delete().in("path", paths);
  return paths.length;
}

/** Downloads an email's stored files as base64 attachments (for forwarding). Skips files that aren't stored. */
export async function loadAttachments(e: Any, maxBytes = 40 * 1024 * 1024) {
  const out: Any[] = [];
  let total = 0;
  for (const a of (Array.isArray(e.attachments) ? e.attachments : [])) {
    if (!a.path) continue;
    const { data, error } = await db.storage.from(BUCKET).download(a.path);
    if (error || !data) continue;
    const bytes = new Uint8Array(await data.arrayBuffer());
    total += bytes.length;
    if (total > maxBytes) break;
    let bin = "";
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    out.push({ filename: a.filename, content: btoa(bin), content_type: a.content_type, ...(a.content_id ? { content_id: a.content_id } : {}) });
  }
  return out;
}
