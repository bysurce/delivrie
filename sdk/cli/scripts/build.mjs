// Compiles src/*.ts into dist/, which bin/delivrie.js runs. Uses the local TypeScript (npm install), or a global one.
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const require = createRequire(import.meta.url);
let tsc;
try { tsc = require.resolve("typescript/bin/tsc"); } catch { tsc = path.join(spawnSync("npm", ["root", "-g"], { encoding: "utf8", shell: process.platform === "win32" }).stdout.trim(), "typescript/bin/tsc"); }
fs.rmSync(path.join(root, "dist"), { recursive: true, force: true });
const r = spawnSync(process.execPath, [tsc, "-p", "tsconfig.json"], { cwd: root, stdio: "inherit" });
if (r.status) process.exit(r.status);
console.log("built dist/");
