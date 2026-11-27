// Terminal output: colours only on a TTY (and never with NO_COLOR), aligned tables, short dates.
/** A table column: its heading and how to read the cell from a row. */
export interface Column<R = any> { label: string; get: (row: R) => unknown }
export type Out = ReturnType<typeof makeOut>;

export function makeOut(stream: { isTTY?: boolean } = process.stdout, env: NodeJS.ProcessEnv = process.env) {
  const color = !!stream.isTTY && !env.NO_COLOR && env.TERM !== "dumb";
  const c = (code: number) => (s: unknown): string => (color ? `\x1b[${code}m${s}\x1b[0m` : String(s));
  const st = { bold: c(1), dim: c(2), red: c(31), green: c(32), yellow: c(33), cyan: c(36) };
  const visible = (s: unknown) => String(s).replace(/\x1b\[[0-9;]*m/g, "");
  function table<R>(rows: R[], cols: Column<R>[]): string {
    if (!rows.length) return "";
    const head = cols.map((k) => st.dim(k.label));
    const body = rows.map((r) => cols.map((k) => String(k.get(r) ?? "")));
    const widths = cols.map((k, i) => Math.max(visible(head[i]).length, ...body.map((row) => visible(row[i]).length)));
    const line = (cells: string[]) => cells.map((v, i) => (i === cells.length - 1 ? v : v + " ".repeat(widths[i] - visible(v).length))).join("  ");
    return [line(head), ...body.map(line)].join("\n");
  }
  const statusColor = (s: unknown): string => {
    const v = String(s || "");
    if (/^(delivered|verified|sent|enabled|opened|clicked|published|full)$/.test(v)) return st.green(v);
    if (/^(bounced|failed|complained|disabled|canceled)$/.test(v)) return st.red(v);
    if (/^(pending|queued|scheduled|sending|delivery_delayed|not_started|temporary_failure|draft)$/.test(v)) return st.yellow(v);
    return v;
  };
  return { ...st, color, table, statusColor };
}

export function when(iso: string | number | Date | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  const s = (Date.now() - d.getTime()) / 1000;
  if (s >= 0 && s < 60) return "just now";
  if (s >= 0 && s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s >= 0 && s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return d.toISOString().slice(0, 16).replace("T", " ");
}

export const list = (v: unknown): string => (Array.isArray(v) ? v.join(", ") : (v ?? "") as string);
