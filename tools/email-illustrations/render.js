// Renders the email illustrations (exported from Figma, "Email · Headers") and footer icons to 2x PNGs in
// assets/email/, because Gmail and Outlook don't display SVG. Run: node tools/email-illustrations/render.js
const { chromium } = require("playwright");
const fs = require("fs"), path = require("path");
const root = path.resolve(__dirname, "../..");
const ill = JSON.parse(fs.readFileSync(path.join(__dirname, "illustrations.json"), "utf8"));
const icons = fs.readFileSync(path.join(root, "app/js/lib/icons.ts"), "utf8");
const iconPath = (n) => icons.match(new RegExp(`\\n  ${n}: '([^']+)'`))[1];
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ deviceScaleFactor: 2 });
  const font = "data:font/woff;base64," + fs.readFileSync(path.join(root, "assets/fonts/Calamantus-SemiBold.woff")).toString("base64");
  await p.setContent(`<style>@font-face{font-family:Calamantus;src:url(${font});font-weight:600}body{margin:0}div{display:inline-block;line-height:0}</style>` +
    Object.entries(ill).map(([k, v]) => `<div id="i-${k}">${v}</div>`).join("") +
    ["github", "globe", "book"].map((n) => `<div id="f-${n}"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#67625F" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${iconPath(n)}</svg></div>`).join(""));
  await p.evaluate(async () => { await document.fonts.load("600 22px Calamantus", "$"); await document.fonts.ready; });
  for (const k of Object.keys(ill)) await (await p.$(`#i-${k}`)).screenshot({ path: path.join(root, `assets/email/${k}.png`) });
  for (const n of ["github", "globe", "book"]) await (await p.$(`#f-${n}`)).screenshot({ path: path.join(root, `assets/email/icon-${n}.png`), omitBackground: true });
  await b.close();
  console.log("rendered", Object.keys(ill).length, "illustrations and 3 icons");
})();
