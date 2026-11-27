// Globals shared between the site scripts, the dashboard and the pages that load them.

/** What site-config.ts exposes for the admin page editor, which loads public pages in an iframe. */
interface DelivrieSiteApi {
  pagePath(path?: string): string;
  keyed(root?: ParentNode): any[];
  clean(html: string): string;
  norm(text: string): string;
  readonly config: any;
  set(config: any): void;
  [extra: string]: any;
}

interface Window {
  /** Set inline by app.html, login.html and signup.html: the page is the dashboard or docs app. */
  DLV_V?: number;
  /** The dashboard's small global (main.ts), used by inline handlers. */
  DLV?: { MARK?: string; go?: (path: string, ...rest: any[]) => void; [k: string]: any };
  DelivrieSite?: DelivrieSiteApi;
  /** The pricing page's comparison rows, read by Admin → Website. */
  DelivrieCompareRows?: () => { id: string; label: string; explain: string }[];
  __dlvSupport?: number;
}

