// Attachment downloads in the dashboard. Render data-att="<email id>|<attachment id>|<1 for received>" on any
// element; a click fetches a short-lived download link from the API and opens it.
import { api } from "./sb.js";
import { toast, errToast } from "./ui.js";

export const attAttr = (emailId: string, a: { id?: string; path?: string }, i: number, received = false) =>
  `data-att="${emailId}|${a.id || `att_${i + 1}`}|${received ? 1 : 0}" role="button" tabindex="0" style="cursor:pointer" title="Download"`;

let installed = false;
export function installAttachmentDownloads() {
  if (installed) return;
  installed = true;
  document.addEventListener("click", async (ev) => {
    const el = (ev.target as Element | null)?.closest?.("[data-att]") as HTMLElement | null;
    if (!el) return;
    ev.preventDefault();
    const [id, att, recv] = (el.dataset.att || "").split("|");
    try {
      const a = await api("GET", `/emails/${recv === "1" ? "received/" : ""}${id}/attachments/${encodeURIComponent(att)}`);
      if (!a.download_url) return toast("This file isn't stored. Files are kept for 30 days, and only for mail sent or received since attachment storage started.", "err", 6000);
      const link = document.createElement("a");
      link.href = a.download_url; link.rel = "noopener"; link.download = a.filename || "";
      document.body.appendChild(link); link.click(); link.remove();
    } catch (e) { errToast(e); }
  });
}
installAttachmentDownloads();
