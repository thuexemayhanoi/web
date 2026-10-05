#!/usr/bin/env node
/* ============================================================
   build-search-index.mjs — regenerate assets/chat/search-index.json
   Run locally before deploy:  node tools/build-search-index.mjs
   Scans only published public pages (main content), skips nav,
   footer, dock, planned/draft articles, code, config, secrets.
   ============================================================ */
import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "assets/chat/search-index.json");
const SITE = "https://app.rentbikehanoi.com";

// Public content pages to index. privacy-policy, terms-of-use and 404
// are intentionally excluded (not rental help content).
const PAGES = [
  { u: "/", f: "index.html" },
  { u: "/hanoi-motorbike-rental/", f: "hanoi-motorbike-rental/index.html" },
  { u: "/hanoi-50cc-motorbike-rental/", f: "hanoi-50cc-motorbike-rental/index.html" },
  { u: "/hanoi-scooter-rental/", f: "hanoi-scooter-rental/index.html" },
  { u: "/hanoi-motorbike-rental-cost/", f: "hanoi-motorbike-rental-cost/index.html" },
  { u: "/motorbike-rental-hanoi-old-quarter/", f: "motorbike-rental-hanoi-old-quarter/index.html" },
  { u: "/monthly-motorbike-rental-hanoi/", f: "monthly-motorbike-rental-hanoi/index.html" },
  { u: "/hanoi-motorbike-trips/", f: "hanoi-motorbike-trips/index.html" },
  { u: "/hanoi-motorbike-for-sale/", f: "hanoi-motorbike-for-sale/index.html" },
  { u: "/renting-a-motorbike-in-vietnam/", f: "renting-a-motorbike-in-vietnam/index.html" },
  { u: "/motorbike-guides/", f: "motorbike-guides/index.html" },
];

const SKIP = /(planned article|coming soon|upcoming|will be published|in progress|draft)/i;

const decode = (s) =>
  s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
   .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
   .replace(/&hellip;/g, "\u2026").replace(/&mdash;/g, "\u2014")
   .replace(/&ndash;/g, "\u2013").replace(/&nbsp;/g, " ");
const stripTags = (s) => decode(String(s).replace(/<[^>]*>/g, "")).replace(/\s+/g, " ").trim();

const seen = new Set();
const entries = [];
for (const p of PAGES) {
  const html = readFileSync(join(ROOT, p.f), "utf8");
  const mainM = html.match(/<main[\s\S]*?<\/main>/i);
  const main = mainM ? mainM[0] : html;
  const titleM = html.match(/<title>([\s\S]*?)<\/title>/i);
  const title = decode((titleM ? titleM[1] : "").replace(/\s+/g, " ").trim()).replace(/ \|.*$/, "");
  const blockRe = /<(h2|h3|p|li)[^>]*>([\s\S]*?)<\/\1>/gi;
  let m, curH = "", skipSec = false;
  const secs = [];
  while ((m = blockRe.exec(main))) {
    const tag = m[1].toLowerCase(), text = stripTags(m[2]);
    if (!text || text.length < 3) continue;
    if (tag === "h2" || tag === "h3") { curH = text; skipSec = SKIP.test(text); continue; }
    if (skipSec || SKIP.test(text)) continue;
    const dedup = text.slice(0, 80).toLowerCase();
    if (seen.has(dedup)) continue;
    seen.add(dedup);
    if (text.length < 30) continue;
    let sec = secs.find((s) => s.h === curH);
    if (!sec) { sec = { h: curH || "", p: [] }; secs.push(sec); }
    if (sec.p.length < 6 && text.length <= 400) sec.p.push(text);
  }
  const heads = [];
  const hRe = /<h([23])[^>]*>([\s\S]*?)<\/h\1>/gi;
  while ((m = hRe.exec(main))) {
    const t = stripTags(m[2]);
    if (t && !heads.includes(t) && !SKIP.test(t)) heads.push(t);
  }
  entries.push({
    u: p.u,
    t: title,
    head: heads.filter((h) => h.length > 2).slice(0, 12),
    s: secs.filter((s) => s.p.length).slice(0, 14),
  });
}

const version = new Date().toISOString().slice(0, 10).replace(/-/g, "") + ".1";
const index = { version, built: new Date().toISOString().slice(0, 10), site: SITE, e: entries };
writeFileSync(OUT, JSON.stringify(index));
console.log("Wrote", OUT, entries.length, "pages,", entries.reduce((a, e) => a + e.s.length, 0), "sections, version", version);
