// Types for docs.js, which tools/build_docs.py generates from content/docs/*.md (the server keeps an identical copy).
export interface Doc { id: string; title: string; group: string; description?: string; body: string; [field: string]: any }
/** Sidebar groups: [group name, [[doc id, title], …]]. */
export declare const GROUPS: [group: string, items: [id: string, title: string][]][];
export declare const DOCS: Doc[];
export declare function searchDocs(q: string, n?: number): any[];
