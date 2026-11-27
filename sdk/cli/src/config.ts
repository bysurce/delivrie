// Where `delivrie login` keeps the API key: ~/.config/delivrie/config.json (or $XDG_CONFIG_HOME, or %APPDATA% on
// Windows), readable only by you. DELIVRIE_API_KEY always wins over the saved key.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/** The saved settings: the API key and, optionally, a different API address. */
export interface Config { api_key?: string; base_url?: string; [k: string]: unknown }

export function configPath(env: NodeJS.ProcessEnv = process.env): string {
  const dir = env.DELIVRIE_CONFIG_DIR
    || (process.platform === "win32" && env.APPDATA ? path.join(env.APPDATA, "delivrie")
      : path.join(env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config"), "delivrie"));
  return path.join(dir, "config.json");
}

export function readConfig(env: NodeJS.ProcessEnv = process.env): Config {
  try { return JSON.parse(fs.readFileSync(configPath(env), "utf8")) || {}; } catch { return {}; }
}

export function writeConfig(cfg: Config, env: NodeJS.ProcessEnv = process.env): string {
  const file = configPath(env);
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  fs.writeFileSync(file, JSON.stringify(cfg, null, 2) + "\n", { mode: 0o600 });
  try { fs.chmodSync(file, 0o600); } catch { /* Windows */ }
  return file;
}

export function clearConfig(env: NodeJS.ProcessEnv = process.env): boolean {
  try { fs.unlinkSync(configPath(env)); return true; } catch { return false; }
}
