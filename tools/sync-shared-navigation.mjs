#!/usr/bin/env node
/**
 * Keep shared header/drawer navigation and footer identical across static HTML pages.
 *
 * Source of truth:
 *   index.html
 *
 * Markers:
 *   <!-- SHARED_NAV_START --> ... <!-- SHARED_NAV_END -->
 *   <!-- SHARED_FOOTER_START --> ... <!-- SHARED_FOOTER_END -->
 *
 * Usage:
 *   node tools/sync-shared-navigation.mjs
 */

import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const sourcePath = path.join(root, "index.html");

function extract(content, start, end) {
  const a = content.indexOf(start);
  const b = content.indexOf(end, a);
  if (a < 0 || b < 0) throw new Error(`Missing shared marker: ${start}`);
  return content.slice(a, b + end.length);
}

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === ".git" || entry.name === "node_modules") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.isFile() && entry.name.endsWith(".html")) out.push(full);
  }
  return out;
}

const source = fs.readFileSync(sourcePath, "utf8");
const navStart = "<!-- SHARED_NAV_START -->";
const navEnd = "<!-- SHARED_NAV_END -->";
const footStart = "<!-- SHARED_FOOTER_START -->";
const footEnd = "<!-- SHARED_FOOTER_END -->";
const sharedNav = extract(source, navStart, navEnd);
const sharedFooter = extract(source, footStart, footEnd);

let changed = 0;
let skipped = 0;

for (const file of walk(root)) {
  if (file === sourcePath) continue;
  const original = fs.readFileSync(file, "utf8");

  if (!original.includes(navStart) || !original.includes(footStart)) {
    skipped++;
    continue;
  }

  let next = original.replace(
    new RegExp(`${navStart}[\\s\\S]*?${navEnd}`),
    sharedNav
  );
  next = next.replace(
    new RegExp(`${footStart}[\\s\\S]*?${footEnd}`),
    sharedFooter
  );

  if (next !== original) {
    fs.writeFileSync(file, next, "utf8");
    changed++;
    console.log("synced:", path.relative(root, file));
  }
}

console.log(`Done. Changed ${changed} file(s); skipped ${skipped} unmarked HTML file(s).`);
