#!/usr/bin/env node
/**
 * Rebuild level lists from whatever *.json files are in levels/
 * (except manifest.json). Natural-sorted filename order = level 1, 2, 3…
 *
 * Updates:
 *   levels/manifest.json  — for servers that can't list directories
 *   LEVELS.json           — single-file fallback for HTML compilers
 *   index.html            — inline LEVELS between LEVELS_AUTO_START/END
 *
 * Usage:  node sync-levels.js
 */
const fs = require("fs");
const path = require("path");

const root = __dirname;
const levelsDir = path.join(root, "levels");

const naturalSort = (a, b) =>
  a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });

const names = fs
  .readdirSync(levelsDir)
  .filter(
    (f) =>
      f.toLowerCase().endsWith(".json") &&
      f.toLowerCase() !== "manifest.json"
  )
  .sort(naturalSort);

if (!names.length) {
  console.error("No level JSON files found in levels/");
  process.exit(1);
}

const levels = [];
for (const name of names) {
  const data = JSON.parse(
    fs.readFileSync(path.join(levelsDir, name), "utf8")
  );
  if (!data || !Array.isArray(data.grid)) {
    console.warn("skip (no grid):", name);
    continue;
  }
  levels.push(data);
  console.log(" +", name, data.title ? `(${data.title})` : "");
}

if (!levels.length) {
  console.error("No valid levels to write.");
  process.exit(1);
}

fs.writeFileSync(
  path.join(levelsDir, "manifest.json"),
  JSON.stringify({ levels: names }, null, 2) + "\n"
);
fs.writeFileSync(
  path.join(root, "LEVELS.json"),
  JSON.stringify(levels, null, 2) + "\n"
);

const indexPath = path.join(root, "index.html");
const html = fs.readFileSync(indexPath, "utf8");
const start = html.indexOf("// LEVELS_AUTO_START");
const end = html.indexOf("// LEVELS_AUTO_END");
if (start < 0 || end < 0 || end <= start) {
  console.error(
    "index.html is missing LEVELS_AUTO_START / LEVELS_AUTO_END markers."
  );
  process.exit(1);
}

const indent = "  ";
const baked =
  `${indent}// LEVELS_AUTO_START\n` +
  `${indent}let LEVELS = ${JSON.stringify(levels, null, 2).replace(/\n/g, "\n" + indent)};\n` +
  `${indent}// LEVELS_AUTO_END`;

const next =
  html.slice(0, start) + baked + html.slice(end + "// LEVELS_AUTO_END".length);
fs.writeFileSync(indexPath, next);

console.log(
  `\nSynced ${levels.length} level(s) → manifest.json, LEVELS.json, index.html`
);
