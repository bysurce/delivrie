// Builds dist/esm (ES modules + .d.ts) and dist/cjs (CommonJS + .d.cts) with the TypeScript compiler.
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";

const root = path.dirname(path.dirname(new URL(import.meta.url).pathname));
const require = createRequire(import.meta.url);
let tsc;
try { tsc = require.resolve("typescript/bin/tsc"); } catch { tsc = path.join(spawnSync("npm", ["root", "-g"], { encoding: "utf8" }).stdout.trim(), "typescript/bin/tsc"); }
const run = (args) => { const r = spawnSync(process.execPath, [tsc, ...args], { cwd: root, stdio: "inherit" }); if (r.status) process.exit(r.status); };

fs.rmSync(path.join(root, "dist"), { recursive: true, force: true });
run(["-p", "tsconfig.json"]);
run(["-p", "tsconfig.json", "--module", "commonjs", "--moduleResolution", "node10", "--ignoreDeprecations", "6.0", "--outDir", "dist/cjs"]);

// CommonJS files get .cjs/.d.cts so they work inside this "type": "module" package.
const cjs = path.join(root, "dist/cjs");
for (const f of fs.readdirSync(cjs)) {
  const p = path.join(cjs, f);
  let s = fs.readFileSync(p, "utf8").replace(/(["'])\.\/(\w+)\.js\1/g, '"./$2.cjs"');
  const out = f.endsWith(".d.ts") ? f.replace(/\.d\.ts$/, ".d.cts") : f.replace(/\.js$/, ".cjs");
  fs.writeFileSync(path.join(cjs, out), s); if (out !== f) fs.rmSync(p);
}
// CommonJS consumers get the class as require("delivrie").Delivrie and also as the module itself.
const idx = path.join(cjs, "index.cjs");
fs.appendFileSync(idx, '\nmodule.exports = Object.assign(exports.Delivrie, exports);\n');
console.log("built dist/esm and dist/cjs");
