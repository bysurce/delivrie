// Tiny argument parser: `--name value`, `--name=value`, `-x value`, repeatable flags, boolean switches, and `--`.
export interface ParseOptions { booleans?: string[]; repeatable?: string[]; aliases?: Record<string, string> }
/** Parsed flags: a string, true/false for switches, or a list for repeatable flags. */
export type Flags = Record<string, any>;

export function parseArgs(argv: string[], { booleans = [], repeatable = [], aliases = {} }: ParseOptions = {}): { flags: Flags; positionals: string[] } {
  const flags: Flags = {}, positionals: string[] = [];
  const set = (k: string, v: string | boolean) => {
    k = aliases[k] || k;
    if (repeatable.includes(k)) (flags[k] ||= []).push(v);
    else flags[k] = v;
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--") { positionals.push(...argv.slice(i + 1)); break; }
    if (a.startsWith("--") || (a.startsWith("-") && a.length === 2 && !/^-\d/.test(a))) {
      let k = a.replace(/^--?/, ""), v: string | undefined;
      const eq = k.indexOf("=");
      if (eq >= 0) { v = k.slice(eq + 1); k = k.slice(0, eq); }
      if (k.startsWith("no-") && booleans.includes(aliases[k.slice(3)] || k.slice(3))) { set(k.slice(3), false); continue; }
      const name = aliases[k] || k;
      if (booleans.includes(name)) { set(k, v === undefined ? true : !/^(false|0|no)$/i.test(v)); continue; }
      if (v === undefined) {
        const next = argv[i + 1];
        if (next === undefined || (next.startsWith("--") && next.length > 2)) throw new UsageError(`--${name} needs a value`);
        v = next; i++;
      }
      set(k, v);
    } else positionals.push(a);
  }
  return { flags, positionals };
}

export class UsageError extends Error {}
