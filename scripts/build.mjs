// Builds the website into out/, which Vercel serves (vercel.json: outputDirectory).
// 1. Type-checks the TypeScript and compiles it to JavaScript at the same paths (app/js/main.ts → out/app/js/main.js),
//    so pages keep loading /app/js/main.js, /site.js and the rest. A type error fails the build, and the live site stays as it was.
// 2. Copies every other file the site serves, skipping what .vercelignore keeps out of the deployment and the build's own files.
// Run: npm install && npm run build
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, "out");
fs.rmSync(out, { recursive: true, force: true });

const tsc = createRequire(import.meta.url).resolve("typescript/bin/tsc");
const r = spawnSync(process.execPath, [tsc, "-p", path.join(root, "tsconfig.json")], { stdio: "inherit" });
if (r.status !== 0) {
  console.error("TypeScript errors: the site was not built.");
  process.exit(r.status || 1);
}
// The compiler marks classic (non-module) scripts "use strict". site.ts, pricing.ts and the others never ran in strict mode,
// so take that line back out wherever the source didn't have it, and the JavaScript runs exactly as it did before.
(function unstrict(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, e.name);
    if (e.isDirectory()) { unstrict(abs); continue; }
    if (!abs.endsWith(".js")) continue;
    const src = path.join(root, path.relative(out, abs)).replace(/\.js$/, ".ts");
    if (!fs.existsSync(src) || /^\s*["']use strict["']/.test(fs.readFileSync(src, "utf8"))) continue;
    const js = fs.readFileSync(abs, "utf8");
    if (js.startsWith('"use strict";\n')) fs.writeFileSync(abs, js.slice('"use strict";\n'.length));
  }
})(out);
// middleware.ts is compiled and run by Vercel from the project root; it isn't a file the site serves.
fs.rmSync(path.join(out, "middleware.js"), { force: true });

// Never served: the build's own files, and whatever .vercelignore lists.
const skip = new Set([".git", ".github", ".vercel", "node_modules", "out", "scripts", "types", "package.json", "package-lock.json",
  "tsconfig.json", "vercel.json", ".vercelignore", ".gitignore", ".DS_Store"]);
const ignored = fs.readFileSync(path.join(root, ".vercelignore"), "utf8").split("\n").map((l) => l.trim().replace(/\/$/, ""))
  .filter((l) => l && !l.startsWith("#"));
const isIgnored = (rel) => skip.has(rel.split("/")[0]) || ignored.some((p) => rel === p || rel.startsWith(p + "/")) ||
  /(^|\/)\.env(\..*)?$/.test(rel) || /(^|\/)\.DS_Store$/.test(rel);

let copied = 0;
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, e.name), rel = path.relative(root, abs).split(path.sep).join("/");
    if (isIgnored(rel)) continue;
    if (e.isDirectory()) { walk(abs); continue; }
    if (rel.endsWith(".ts")) continue; // compiled above (and .d.ts files are types only)
    fs.mkdirSync(path.join(out, path.dirname(rel)), { recursive: true });
    fs.copyFileSync(abs, path.join(out, rel)); // .js sources (blocks.js, docs.js, the vendored client) are served exactly as written
    copied++;
  }
})(root);

console.log(`Built out/: compiled the TypeScript and copied ${copied} files.`);
