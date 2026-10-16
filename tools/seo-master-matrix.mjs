#!/usr/bin/env node
// SEO master matrix: audits every generated HTML URL and writes
// reports/seo-master-matrix.json + reports/seo-master-matrix.md.
// Read-only for site pages. No dependencies.
//
//   node tools/seo-master-matrix.mjs             audit + matrix (compares with baseline)
//   node tools/seo-master-matrix.mjs --baseline  also (re)write the baseline snapshot
//
// Every issue carries the evidence measured in this run. Issues present in the
// baseline but no longer detected are reported as FIXED (verified by re-audit).
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const WRITE_BASELINE = process.argv.includes('--baseline');
const read = p => fs.readFileSync(path.join(ROOT, p), 'utf8');
const exists = p => fs.existsSync(path.join(ROOT, p));
const system = JSON.parse(read('data/site-system.json'));
const research = exists('data/keyword-research.json') ? JSON.parse(read('data/keyword-research.json')) : { keywords: {}, autocomplete_groups: {} };
const overrides = exists('data/seo-master-overrides.json') ? JSON.parse(read('data/seo-master-overrides.json')) : {};
const DOMAIN = system.domain;
const TODAY = new Date().toISOString().slice(0, 10);

// ---------------------------------------------------------------- helpers
function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['.git', 'node_modules', 'site'].includes(e.name)) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, out);
    else if (e.isFile() && e.name.endsWith('.html')) out.push(path.relative(ROOT, full).split(path.sep).join('/'));
  }
  return out;
}
function parseCSV(text) {
  const rows = []; let row = [], field = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; } else if (ch === '"') q = false; else field += ch; }
    else { if (ch === '"') q = true; else if (ch === ',') { row.push(field); field = ''; } else if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; } else if (ch !== '\r') field += ch; }
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows;
}
const NAMED = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', middot: '·', hellip: '…', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', minus: '−', times: '×', rarr: '→', larr: '←' };
function decode(s) {
  let out = String(s || '');
  for (let pass = 0; pass < 3; pass++) {
    const next = out
      .replace(/&([a-z]+);/gi, (m, n) => Object.prototype.hasOwnProperty.call(NAMED, n.toLowerCase()) ? NAMED[n.toLowerCase()] : m)
      .replace(/&#(\d+);/g, (m, n) => { try { return String.fromCodePoint(Number(n)); } catch { return m; } })
      .replace(/&#x([0-9a-f]+);/gi, (m, n) => { try { return String.fromCodePoint(parseInt(n, 16)); } catch { return m; } });
    if (next === out) break;
    out = next;
  }
  return out;
}
const textOnly = s => decode(String(s || '').replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
const first = (s, re) => (s.match(re) || [])[1] || '';
function canonicalForPath(p) {
  if (p === 'index.html') return DOMAIN + '/';
  if (p.endsWith('/index.html')) return DOMAIN + '/' + p.slice(0, -'index.html'.length);
  return DOMAIN + '/' + p;
}
function hrefOf(p) { return canonicalForPath(p).slice(DOMAIN.length); }
// Cut a marked region out of html; returns [regionHtml, htmlWithoutRegion].
function cut(html, startRe, endRe) {
  const s = html.search(startRe);
  if (s < 0) return ['', html];
  const rest = html.slice(s);
  const e = rest.search(endRe);
  if (e < 0) return ['', html];
  const endLen = rest.slice(e).match(endRe)[0].length;
  return [rest.slice(0, e + endLen), html.slice(0, s) + html.slice(s + e + endLen)];
}
function cutAll(html, startRe, endRe) {
  let out = '', h = html;
  for (let i = 0; i < 50; i++) { const [seg, rest] = cut(h, startRe, endRe); if (!seg) break; out += seg; h = rest; }
  return [out, h];
}
function resolveHref(pagePath, raw, fileSet) {
  let href = String(raw || '').trim();
  if (!href || /^(mailto:|tel:|javascript:|data:|#)/i.test(href)) return null;
  if (/^https?:\/\//i.test(href)) {
    try { const u = new URL(href); if (u.origin !== DOMAIN) return { external: u.href }; href = u.pathname; } catch { return null; }
  }
  href = href.split('#')[0].split('?')[0];
  if (!href) return null;
  const base = pagePath.includes('/') ? pagePath.replace(/[^/]+$/, '') : '';
  let p = href.startsWith('/') ? href.slice(1) : base + href;
  const seg = [];
  for (const s of p.split('/')) { if (!s || s === '.') continue; if (s === '..') seg.pop(); else seg.push(s); }
  p = seg.join('/');
  if (!p) return { internal: 'index.html' };
  if (href.endsWith('/')) return { internal: p + '/index.html' };
  if (!/\.[A-Za-z0-9]+$/.test(p) && fileSet.has(p + '/index.html')) return { internal: p + '/index.html' };
  return { internal: p };
}
const STOP = new Set('a an the and or but if then than so of to in on at by for with from as is are was were be been being it its this that these those there here you your yours we our ours they their them he she his her i me my not no nor do does did done can could should would will shall may might must also just only very more most less least much many any some each every all both either neither other another such same own up down out over under again further once into onto about above below between through during before after while because until against off too what which who whom whose when where why how one two three per vs via'.split(' '));
const words = t => t.toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9]+/g, ' ').trim().split(' ').filter(Boolean);
function fnv(str) { let h = 0x811c9dc5; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); } return h >>> 0; }
function shingles(ws, k = 5) {
  const set = new Set();
  for (let i = 0; i + k <= ws.length; i++) set.add(fnv(ws.slice(i, i + k).join(' ')));
  return Uint32Array.from(set).sort();
}
function jaccardSorted(a, b) {
  if (!a.length || !b.length) return 0;
  let i = 0, j = 0, inter = 0;
  while (i < a.length && j < b.length) { if (a[i] === b[j]) { inter++; i++; j++; } else if (a[i] < b[j]) i++; else j++; }
  return inter / (a.length + b.length - inter);
}
function cosine(a, b) { // a,b: Map normalized
  if (a.size > b.size) [a, b] = [b, a];
  let s = 0; for (const [k, v] of a) { const w = b.get(k); if (w) s += v * w; } return s;
}
const round = (x, d = 2) => Math.round(x * 10 ** d) / 10 ** d;
const uniq = a => [...new Set(a)];

// ---------------------------------------------------------------- data
const matrixRows = [];
{
  const rows = parseCSV(read('data/content-matrix.csv'));
  const h = rows[0];
  for (let i = 1; i < rows.length; i++) { if (!rows[i].length || rows[i].length < 3) continue; const r = {}; h.forEach((k, j) => r[k] = rows[i][j] || ''); matrixRows.push(r); }
}
const matrixByPath = new Map(matrixRows.map(r => [r.path, r]));
const files = walk(ROOT).sort();
const fileSet = new Set();
(function all(dir) { for (const e of fs.readdirSync(dir, { withFileTypes: true })) { if (['.git', 'node_modules'].includes(e.name)) continue; const f = path.join(dir, e.name); if (e.isDirectory()) all(f); else fileSet.add(path.relative(ROOT, f).split(path.sep).join('/')); } })(ROOT);
const HUB_DIRS = Object.keys(system.cards).map(h => h.replace(/^\/|\/$/g, '')).filter(Boolean);

// ---------------------------------------------------------------- parse pages
const META_SEO_RX = /search engines?|AI (?:assistants?|systems?)|answer[- ]engine|answer-first|\bSEO\b|cannibali[sz]|\b(?:this|the|our) (?:\w+ )?cluster\b(?! of (?:bikes|streets|shops|cafes|stalls|parked))|\bin this cluster\b|cluster (?:of guides|of articles|page)|\b(?:the|SEO) Matrix\b|(?:price|site's) source of truth|(?<!-)production (?:model|workflow)|publish QA|\bsilo\b|this hub (?:exists|should|is growing|will grow)|hub is growing|Planned articles include|The homepage (?:is|owns|links)|The site (?:is built|no longer|publishes)|heavy (?:map|embedded)|map iframe|mobile menu includes|status area|website (?:deliberately|is designed|calculates|does not invent|does not pretend)|Every profile in this cluster|the brief built|per the standard routine/;
const POLICY_RX = [
  { code: 'helmet', rx: /every bike we rent comes with a helmet|the rental includes a helmet|(?<!(?:whether|if) (?:a |the )?)\bhelmets? (?:is|are) included with (?:the|every|each) rental/i },
  { code: 'maintenance', rx: /(?:maintenance|consumables)[^.]{0,60}carried by the desk|carried by the desk/i },
  { code: 'counter-paperwork', rx: /The counter on Nguyen Van Cu handles international paperwork[^.]*\./i }
];
const LEGAL_RX = [
  { code: 'no-licence-50cc', rx: /Without a licen[cs]e[^.]{0,120}50cc[^.]{0,80}(?:simpler|easier|gentler)|legally accessible option for riders without a licen[cs]e/i }
];
// over-styled machine prose: filler and personification that people-first writing avoids
const PURPLE_RX = /\bhonest(?:ly|y)?\b|\barithmetic\b|\bledger\b|\britual\b|\bverdict\b|\btemperament|\bcitizens?\b|\bmoods?\b|\bmanners\b|\bgrammar\b|\bvocabulary\b|\bgarment\b|\bfinal exam\b/gi;
const UNNATURAL_RX = /\bthe desk\b|\bthe counter\b|honest arithmetic|the honest (?:rule|answer|choice|version|question)/gi;
const LEGAL_PAGE_RX = /licen[cs]e|helmet-rules|traffic-rules|traffic-police|road-signs|restricted-roads|insurance|accident|rental-contracts|border-area|scams|child/i;

const pages = [];
for (const p of files) {
  const html = read(p);
  const pg = { path: p, url: canonicalForPath(p), href: hrefOf(p) };
  pg.lang = first(html, /<html[^>]*\slang="([^"]*)"/i);
  pg.title = textOnly(first(html, /<title>([\s\S]*?)<\/title>/i));
  pg.description = decode(first(html, /<meta name="description" content="([^"]*)"/i));
  pg.canonical = first(html, /<link rel="canonical" href="([^"]*)"/i);
  pg.robots = first(html, /<meta name="robots" content="([^"]*)"/i);
  pg.viewport = /<meta name="viewport"/i.test(html);
  pg.metaRefresh = first(html, /<meta http-equiv="refresh" content="([^"]*)"/i);
  pg.mainUnclosed = (html.match(/<main\b/gi) || []).length !== (html.match(/<\/main>/gi) || []).length;
  pg.pUnbalanced = (html.match(/<p\b/gi) || []).length !== (html.match(/<\/p>/gi) || []).length;
  { const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map(x => x[1]); const seen = new Set(); pg.dupIds = uniq(ids.filter(x => seen.has(x) || !seen.add(x))); }
  pg.schemaTypes = [];
  for (const m of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/gi)) {
    try { const o = JSON.parse(m[1]); const g = Array.isArray(o['@graph']) ? o['@graph'] : [o]; for (const x of g) pg.schemaTypes.push(...[].concat(x['@type'] || [])); } catch { pg.schemaTypes.push('INVALID_JSON'); }
  }
  const m = matrixByPath.get(p) || {};
  pg.matrix = m;
  pg.role = p === '404.html' ? 'UTILITY' : (m.content_role || 'UNKNOWN');
  pg.type = { ROOT_HUB: 'homepage', HUB: 'hub', CLUSTER: 'article', ANSWER_HUB: 'faq', LEGAL: 'legal', UTILITY: 'utility' }[pg.role] || 'unknown';
  pg.hubDir = p.includes('/') ? p.split('/')[0] : '';
  if (pg.hubDir === 'faq') pg.hubDir = '';
  pg.slug = p.split('/').length === 3 ? p.split('/')[1] : '';
  // regions
  let rest = html;
  let nav, footer, floating, mainHtml;
  [nav, rest] = cut(rest, /<!-- SHARED_NAV_START -->/, /<!-- SHARED_NAV_END -->/);
  [footer, rest] = cut(rest, /<!-- SHARED_FOOTER_START -->/, /<!-- SHARED_FOOTER_END -->/);
  [floating, rest] = cut(rest, /<!-- SHARED_FLOATING_START -->/, /<!-- SHARED_FLOATING_END -->/);
  mainHtml = first(rest, /(<main\b[\s\S]*?<\/main>)/i) || rest;
  const regions = { nav, footer, floating };
  let mh = mainHtml, seg;
  for (const [name, s, e] of [
    ['crumbs', /<nav class="crumbs"/, /<\/nav>/],
    ['toc', /<!-- SLOT:TOC:START -->/, /<!-- SLOT:TOC:END -->/],
    ['related', /<!-- SLOT:RELATED:START -->/, /<!-- SLOT:RELATED:END -->/],
    ['cta', /<!-- SLOT:CTA:START -->/, /<!-- SLOT:CTA:END -->/],
    ['author', /<!-- SLOT:AUTHOR:START -->/, /<!-- SLOT:AUTHOR:END -->/],
    ['postnav', /<!-- SLOT:POST_NAV:START -->/, /<!-- SLOT:POST_NAV:END -->/],
    ['hubindex', /<!-- SLOT:HUB_INDEX:START -->/, /<!-- SLOT:HUB_INDEX:END -->/],
    ['familynav', /<!-- SLOT:FAMILY_NAV:START -->/, /<!-- SLOT:FAMILY_NAV:END -->/],
    ['sources', /<!-- SLOT:SOURCES:START -->/, /<!-- SLOT:SOURCES:END -->/],
    ['template', /<p class="back-home"/, /<\/p>/]
  ]) { [seg, mh] = cut(mh, s, e); regions[name] = seg; }
  [seg, mh] = cutAll(mh, /<!-- HOOK:[A-Z_]+:START -->/, /<!-- HOOK:[A-Z_]+:END -->/);
  regions.editorial = mh;
  pg.crumbs = [...(regions.crumbs || '').matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)].map(x => textOnly(x[1]));
  // headings
  const ed = regions.editorial;
  pg.h1s = [...html.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi)].map(x => textOnly(x[1]));
  const heads = [...ed.matchAll(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi)].map(x => ({ level: +x[1], text: textOnly(x[2]), index: x.index }));
  pg.h2 = heads.filter(h => h.level === 2).map(h => h.text);
  pg.h3 = heads.filter(h => h.level === 3).map(h => h.text);
  const firstH2 = heads.find(h => h.level === 2);
  pg.h3BeforeH2 = heads.some(h => h.level === 3 && (!firstH2 || h.index < firstH2.index));
  pg.faqH2 = [...ed.matchAll(/<article class="faq-entry">\s*<h2\b/gi)].length;
  pg.tables = (ed.match(/<table\b/gi) || []).length;
  pg.tablesUnwrapped = 0;
  for (const t of ed.matchAll(/<table\b/gi)) { const before = ed.slice(Math.max(0, t.index - 120), t.index); if (!/class="table-scroll"/.test(before)) pg.tablesUnwrapped++; }
  pg.images = [...html.matchAll(/<img\b([^>]*)>/gi)].map(x => ({ src: first(x[1], /src="([^"]*)"/i), alt: /\balt=/.test(x[1]) ? first(x[1], /alt="([^"]*)"/i) : null, dims: /\bwidth=/.test(x[1]) && /\bheight=/.test(x[1]) }));
  pg.contentImages = [...ed.matchAll(/<img\b/gi)].length;
  const edText = textOnly(ed);
  pg.edText = edText;
  pg.wordCount = edText ? edText.split(/\s+/).length : 0;
  pg.metaSeo = [];
  for (const b of ed.matchAll(/<(p|li|h[2-6]|summary)\b[^>]*>([\s\S]*?)<\/\1>/gi)) { const t = textOnly(b[2]); if (META_SEO_RX.test(t)) pg.metaSeo.push(t.slice(0, 160)); }
  pg.policy = POLICY_RX.filter(r => r.rx.test(edText)).map(r => ({ code: r.code, text: (edText.match(r.rx) || [''])[0].slice(0, 160) }));
  pg.legal = LEGAL_RX.filter(r => r.rx.test(edText)).map(r => ({ code: r.code, text: (edText.match(r.rx) || [''])[0].slice(0, 200) }));
  pg.unnatural = (edText.match(UNNATURAL_RX) || []).length;
  pg.purple = (edText.match(PURPLE_RX) || []).length;
  // links per region
  pg.links = {};
  pg.external = [];
  for (const [name, h] of Object.entries(regions)) {
    const targets = [];
    for (const a of (h || '').matchAll(/<a\b[^>]*\shref="([^"]+)"/gi)) {
      const r = resolveHref(p, a[1], fileSet);
      if (!r) continue;
      if (r.external) { if (name === 'editorial' || name === 'sources') pg.external.push(r.external); continue; }
      targets.push(r.internal);
    }
    pg.links[name] = targets;
  }
  pages.push(pg);
}
const byPath = new Map(pages.map(p => [p.path, p]));
const contentPages = pages.filter(p => p.type !== 'utility');

// ---------------------------------------------------------------- link graph
const inbound = new Map(pages.map(p => [p.path, { editorial: new Set(), related: new Set(), postnav: new Set(), hubindex: new Set(), nav: new Set(), footer: new Set(), crumbs: new Set(), other: new Set() }]));
const adj = new Map();
for (const p of pages) {
  const out = new Set();
  for (const [region, list] of Object.entries(p.links)) {
    for (const t of list) {
      if (!byPath.has(t) || t === p.path) continue;
      out.add(t);
      const bucket = inbound.get(t)[region] || inbound.get(t).other;
      bucket.add(p.path);
    }
  }
  adj.set(p.path, out);
}
const depth = new Map([['index.html', 0]]);
{ const q = ['index.html']; while (q.length) { const c = q.shift(); for (const n of adj.get(c) || []) if (!depth.has(n)) { depth.set(n, depth.get(c) + 1); q.push(n); } } }
// Shortest path when the auto-generated "related" and "post_nav" blocks are ignored:
// shows what a hub-and-article structure alone exposes.
const depthEditorial = new Map([['index.html', 0]]);
{
  const q = ['index.html'];
  while (q.length) {
    const c = q.shift(); const pg = byPath.get(c);
    for (const region of ['editorial', 'hubindex', 'nav', 'footer', 'crumbs']) for (const n of pg.links[region] || []) if (byPath.has(n) && !depthEditorial.has(n)) { depthEditorial.set(n, depthEditorial.get(c) + 1); q.push(n); }
  }
}

// ---------------------------------------------------------------- template families
// One rule per hub. `k` = merge key (pages that would become ONE guide),
// `v` = the part that varies (audience, period, format, sub-topic, destination).
const MODEL_RX = 'honda-wave|yamaha-sirius|yamaha-mio|honda-click|honda-vision|honda-air-blade|electric-motorbike|50cc-scooter|automatic-scooter|semi-automatic-motorbike';
const hubIndexCfg = exists('data/hub-index.json') ? JSON.parse(read('data/hub-index.json')) : { hubs: {} };
const FAMILY_RULES = Object.fromEntries(Object.entries(hubIndexCfg.hubs).map(([hub, c]) => [hub, {
  rx: new RegExp(c.pattern), min: c.min, plan: c.plan, varies: c.varies,
  extra: (c.extra || []).map(e => ({ rx: new RegExp(e.pattern), key: e.key }))
}]));
for (const pg of pages) {
  if (pg.type !== 'article') continue;
  const rule = FAMILY_RULES[pg.hubDir];
  if (!rule) continue;
  let m = pg.slug.match(rule.rx), key = m && m.groups.k, variant = m && m.groups.v;
  if (!m && rule.extra) for (const ex of rule.extra) { const mm = pg.slug.match(ex.rx); if (mm) { key = ex.key; variant = mm.groups.v; break; } }
  if (key) pg.family = { family: pg.hubDir + '/' + key, key, variant, plan: rule.plan, varies: rule.varies, min: rule.min };
  if (pg.hubDir === 'hanoi-motorbike-trips' && key) pg.destination = key;
}
const families = new Map();
for (const pg of pages) if (pg.family) { if (!families.has(pg.family.family)) families.set(pg.family.family, []); families.get(pg.family.family).push(pg.path); }
// Hand-written (non-template) articles that answer the same question as a family
// are listed as the family's suggested owner.
const familyOwnerCandidates = new Map();
for (const pg of pages) {
  if (pg.type !== 'article' || pg.family) continue;
  for (const [fam, list] of families) {
    const key = fam.split('/')[1];
    if (fam.split('/')[0] !== pg.hubDir) continue;
    if (pg.slug === key + '-hanoi' || pg.slug.startsWith(key + '-') || (pg.hubDir === 'hanoi-motorbike-trips' && pg.slug.startsWith('hanoi-to-' + key + '-'))) {
      if (!familyOwnerCandidates.has(fam)) familyOwnerCandidates.set(fam, []);
      familyOwnerCandidates.get(fam).push(pg.path);
    }
  }
}

// ---------------------------------------------------------------- similarity
// (1) copy overlap: exact Jaccard of 5-word shingles; (2) topic overlap: cosine
// of term-frequency vectors over content words, with each hub's varying words
// (audience/model/destination tokens) removed so only the advice is compared.
for (const pg of contentPages) { pg.ws = words(pg.edText); pg.sh = shingles(pg.ws); }
const variantWords = new Map();
for (const pg of pages) if (pg.family) {
  if (!variantWords.has(pg.hubDir)) variantWords.set(pg.hubDir, new Set());
  const vw = variantWords.get(pg.hubDir);
  for (const t of (pg.family.variant + '-' + (FAMILY_RULES[pg.hubDir].varies === 'sub-topic' ? pg.family.key : '')).split('-')) if (t) { vw.add(t); vw.add(t + 's'); vw.add(t.replace(/s$/, '')); }
}
for (const pg of contentPages) {
  const vw = variantWords.get(pg.hubDir) || new Set();
  const tf = new Map();
  for (const w of pg.ws) if (!STOP.has(w) && w.length > 2 && !vw.has(w)) tf.set(w, (tf.get(w) || 0) + 1);
  let norm = 0; for (const c of tf.values()) norm += c * c; norm = Math.sqrt(norm) || 1;
  const v = new Map(); for (const [w, c] of tf) v.set(w, c / norm);
  pg.vec = v;
}
const groups = new Map();
for (const pg of contentPages) { const g = pg.hubDir || '(root)'; if (!groups.has(g)) groups.set(g, []); groups.get(g).push(pg); }
for (const pg of contentPages) { pg.maxJac = 0; pg.maxJacWith = ''; pg.maxCos = 0; pg.maxCosWith = ''; pg.famCos = []; }
const crossSum = new Map();
for (const [g, list] of groups) {
  let s = 0, n = 0;
  for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
    const a = list[i], b = list[j];
    const jac = jaccardSorted(a.sh, b.sh), cs = cosine(a.vec, b.vec);
    if (jac > a.maxJac) { a.maxJac = jac; a.maxJacWith = b.href; }
    if (jac > b.maxJac) { b.maxJac = jac; b.maxJacWith = a.href; }
    if (cs > a.maxCos) { a.maxCos = cs; a.maxCosWith = b.href; }
    if (cs > b.maxCos) { b.maxCos = cs; b.maxCosWith = a.href; }
    if (a.family && b.family) {
      if (a.family.family === b.family.family) { a.famCos.push(cs); b.famCos.push(cs); }
      else { s += cs; n++; }
    }
  }
  crossSum.set(g, n ? s / n : 0);
}
const crossBaseline = crossSum;
// boilerplate sentences reused across pages
const sentPages = new Map();
for (const pg of contentPages) {
  pg.sents = uniq(pg.edText.split(/(?<=[.!?])\s+/).map(s => s.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim()).filter(s => s.split(' ').length >= 8));
  for (const s of pg.sents) sentPages.set(s, (sentPages.get(s) || 0) + 1);
}
for (const pg of contentPages) {
  let rep = 0, tot = 0;
  for (const s of pg.sents) { const n = s.split(' ').length; tot += n; if (sentPages.get(s) >= 3) rep += n; }
  pg.boilerplate = tot ? rep / tot : 0;
}

// ---------------------------------------------------------------- cannibalization groups
// Only overlaps NOT already covered by a template family: head terms in title
// cores, the same model comparison published in two hubs, and hand-written pages
// that answer the same question as a template family.
const cannibal = new Map();
const addC = (k, p) => { if (!cannibal.has(k)) cannibal.set(k, []); if (!cannibal.get(k).includes(p)) cannibal.get(k).push(p); };
const MODEL_NAMES = MODEL_RX.split('|');
const normModel = s => s.replace(/-hanoi$/, '').replace(/-rental-cost$/, '').replace(/-(checks-and-mistakes|selection-guide)$/, '');
for (const pg of pages) {
  if (pg.type !== 'article') continue;
  const base = normModel(pg.slug);
  const vs = base.match(new RegExp('^(' + MODEL_RX + '|honda-vision|scooter|electric|electric-vs-petrol|honda-wave)-vs-(' + MODEL_RX + '|air-blade|semi-automatic|yamaha-sirius|petrol-scooter)$'));
  if (vs) {
    const n = x => x.replace(/^air-blade$/, 'honda-air-blade').replace(/^electric$/, 'electric-motorbike');
    addC('compare:' + [n(vs[1]), n(vs[2])].sort().join(' vs '), pg.path);
  }
}
for (const [k, v] of [...cannibal]) { const hubs = new Set(v.map(p => p.split('/')[0])); if (v.length < 2 || hubs.size < 2) cannibal.delete(k); }
for (const [fam, owners] of familyOwnerCandidates) for (const o of owners) { addC('family-overlap:' + fam, o); for (const p of families.get(fam)) addC('family-overlap:' + fam, p); }
const GENERIC_REST = /^(?:in hanoi|hanoi|guide|rental|hire|service|services|near (?:the )?old quarter|in vietnam)?$/i;
const HEAD_TERMS = [
  { key: 'head:hanoi motorbike rental', rx: /^(?:hanoi motorbike rental|motorbike rental (?:in )?hanoi)\b/i },
  { key: 'head:motorbike rental hanoi old quarter', rx: /^(?:(?:motorbike|scooter) rental (?:in )?(?:hanoi )?(?:the )?old quarter|(?:hanoi )?old quarter (?:motorbike|scooter) rental|motorbike rental hanoi old quarter)\b/i },
  { key: 'head:monthly motorbike rental hanoi', rx: /^monthly (?:motorbike|scooter) rental(?: in)?(?: hanoi)?\b/i },
  { key: 'head:50cc motorbike rental hanoi', rx: /^50cc (?:motorbike|scooter) rental(?: in)?(?: hanoi)?\b/i },
  { key: 'head:hanoi scooter rental', rx: /^(?:hanoi scooter rental|scooter rental (?:in )?hanoi)\b/i },
  { key: 'head:electric motorbike rental hanoi', rx: /^electric (?:motorbike|scooter) rental(?: in)?(?: hanoi)?\b/i }
];
for (const pg of contentPages) {
  const core = pg.title.split(/\s[|:–—-]\s|:\s/)[0].trim();
  for (const ht of HEAD_TERMS) {
    const m = core.match(ht.rx);
    if (m && GENERIC_REST.test(core.slice(m[0].length).trim())) addC(ht.key, pg.path);
  }
}
for (const [k, v] of cannibal) if (v.length < 2) cannibal.delete(k);
const cannibalOf = new Map();
for (const [k, list] of cannibal) for (const p of list) { if (!cannibalOf.has(p)) cannibalOf.set(p, []); cannibalOf.get(p).push(k); }

// ---------------------------------------------------------------- duplicates of title/meta
const titleOwners = new Map(), descOwners = new Map();
for (const pg of contentPages) { if (pg.robots && /noindex/i.test(pg.robots)) continue; (titleOwners.get(pg.title) || titleOwners.set(pg.title, []).get(pg.title)).push(pg.path); (descOwners.get(pg.description) || descOwners.set(pg.description, []).get(pg.description)).push(pg.path); }

// ---------------------------------------------------------------- keywords
function kwVolume(k) {
  const r = research.keywords[k];
  if (!r) return 'UNKNOWN';
  const parts = [];
  if (typeof r.volume_global === 'number') parts.push(r.volume_global + '/mo global');
  if (typeof r.volume_vn === 'number') parts.push(r.volume_vn + '/mo VN');
  return parts.length ? parts.join(', ') + ' (Ubersuggest ' + research.collected_at + ')' : 'UNKNOWN';
}
const HUB_SECONDARY = {
  '': [],
  'hanoi-motorbike-rental': ['how to rent a motorbike in hanoi', 'where to rent a motorbike in hanoi', 'motorbike rental in hanoi', 'hanoi motorbike hire'],
  'hanoi-50cc-motorbike-rental': ['50cc scooter rental hanoi', '50cc bike rental hanoi', 'rent 50cc scooter hanoi', 'hanoi motorbike rental 50cc'],
  'hanoi-scooter-rental': ['scooter rental hanoi', 'scooter hire hanoi', 'moped rental hanoi', 'scooter rental hanoi price'],
  'hanoi-motorbike-rental-cost': ['hanoi motorbike rental price', 'how much to rent a motorbike in hanoi', 'motorbike rental hanoi price', 'scooter rental hanoi price'],
  'motorbike-rental-hanoi-old-quarter': ['scooter rental hanoi old quarter', 'motorbike rental old quarter', 'bike rental old quarter hanoi'],
  'monthly-motorbike-rental-hanoi': ['monthly scooter rental hanoi', 'monthly bike rental hanoi', 'long term motorbike rental hanoi'],
  'hanoi-motorbike-trips': ['motorbike day trips from hanoi', 'hanoi motorbike routes'],
  'hanoi-motorbike-for-sale': ['buy vs rent motorbike hanoi', 'buying a used motorbike in hanoi'],
  'renting-a-motorbike-in-vietnam': ['can a tourist rent a motorbike in vietnam', 'do you need a license to rent a motorbike in vietnam', 'motorbike license vietnam'],
  'motorbike-guides': ['riding a motorbike in hanoi', 'motorbike safety hanoi']
};
// Natural search phrasing for each template topic (targeting choices; volume UNKNOWN unless measured).
const KEY_PHRASE = {
  'bike-choice': 'best motorbike to rent in hanoi', 'parking-strategy': 'motorbike parking in hanoi', 'pickup-planning': 'motorbike rental pickup hanoi',
  'pre-ride-inspection': 'rental motorbike inspection checklist', 'rainy-day-planning': 'riding a motorbike in hanoi in the rain', 'rental-paperwork-questions': 'motorbike rental documents hanoi',
  'return-checklist': 'returning a rental motorbike', 'route-planning': 'hanoi motorbike route planning', 'traffic-preparation': 'hanoi traffic tips for motorbike riders',
  'bridges-and-inclines': '50cc scooter bridges and hills hanoi', 'choosing-a-50cc': '50cc scooter rental hanoi', 'city-traffic': '50cc scooter in hanoi traffic',
  'daily-rental-planning': '50cc daily rental hanoi', 'parking': '50cc scooter parking hanoi', 'passenger-use': '50cc scooter with a passenger',
  'rainy-weather': '50cc scooter in the rain', 'route-suitability': 'where can a 50cc go in hanoi', 'vs-automatic-scooter': '50cc vs automatic scooter',
  'commuting-setup': 'monthly motorbike rental for commuting', 'contract-questions': 'monthly motorbike rental contract', 'maintenance-expectations': 'long term motorbike rental maintenance',
  'model-choice': 'best motorbike for monthly rental hanoi', 'monthly-budget': 'monthly motorbike rental cost hanoi', 'parking-and-security': 'motorbike parking and security hanoi',
  'break-even-thinking': 'buy or rent a motorbike in hanoi', 'ownership-costs': 'cost of owning a motorbike in hanoi', 'paperwork-questions': 'buying a motorbike in vietnam paperwork',
  'rent-vs-buy-decision': 'rent vs buy motorbike vietnam', 'resale-planning': 'selling a motorbike in hanoi', 'used-bike-inspection': 'used motorbike inspection hanoi',
  'accident-steps': 'motorbike accident in vietnam what to do', 'border-area-riding': 'riding a motorbike near vietnam borders', 'helmet-rules': 'vietnam motorbike helmet law',
  'insurance-questions': 'motorbike insurance vietnam tourist', 'motorbike-license': 'motorbike license vietnam', 'rental-contracts': 'motorbike rental contract vietnam',
  'restricted-roads': 'motorbike restricted roads vietnam', 'road-signs': 'vietnam road signs for motorbike riders', 'traffic-police-stops': 'vietnam traffic police motorbike stop'
};
const AUTOCOMPLETE = new Set(Object.values(research.autocomplete_groups || {}).flat().concat(Object.keys(research.autocomplete_groups || {})));
function secondaryFor(pg) {
  if (pg.type === 'homepage') return ['motorbike rental hanoi', 'hanoi scooter rental', 'hanoi motorbike rental price', 'where to rent a motorbike in hanoi'];
  if (pg.type === 'faq') return ['how much to rent a motorbike in hanoi', 'can a tourist rent a motorbike in vietnam', 'do you need a license to rent a motorbike in vietnam'];
  if (pg.type === 'legal') return [];
  if (pg.type === 'hub') return HUB_SECONDARY[pg.hubDir] || [];
  if (pg.type !== 'article') return [];
  const hubKw = (byPath.get(pg.hubDir + '/index.html')?.matrix.primary_keyword || '').replace(/ guide$/, '');
  const out = [];
  const f = pg.family;
  const sp = s => s.replace(/-/g, ' ');
  if (f) {
    if (pg.hubDir === 'hanoi-motorbike-trips') out.push('hanoi to ' + sp(f.key) + ' by motorbike');
    else if (pg.hubDir === 'motorbike-rental-hanoi-old-quarter') out.push('motorbike ' + sp(f.key) + ' hanoi');
    else if (pg.hubDir === 'hanoi-motorbike-rental-cost') out.push(f.key === 'model-comparisons' ? sp(f.variant) + ' rental cost' : sp(f.key) + ' rental price hanoi');
    else if (KEY_PHRASE[f.key]) out.push(KEY_PHRASE[f.key]);
    else out.push(sp(f.key) + ' hanoi');
  }
  if (hubKw && !out.includes(hubKw)) out.push(hubKw);
  return uniq(out).slice(0, 3);
}
function kwTag(k) { const v = kwVolume(k); if (v !== 'UNKNOWN') return k + ' [' + v + ']'; if (AUTOCOMPLETE.has(k)) return k + ' [autocomplete-validated; volume UNKNOWN]'; return k + ' [derived from page topic; volume UNKNOWN]'; }

// ---------------------------------------------------------------- issues
const P = { P0: 0, P1: 1, P2: 2 };
function issue(code, priority, evidence, action, verify, status = 'OPEN') { return { code, priority, evidence, action, verify, status }; }
const APPROVAL = 'PROPOSED - AWAITING APPROVAL';
const OWNER = 'BLOCKED - NEEDS OWNER DATA';
const legalHub = 'renting-a-motorbike-in-vietnam';
for (const pg of pages) {
  const I = [];
  const isContent = pg.type !== 'utility';
  const noindex = /noindex/i.test(pg.robots || '');
  // technical
  if (pg.lang !== 'en') I.push(issue('T-LANG', 'P1', 'html lang="' + pg.lang + '"', 'Set <html lang="en">.', 'grep \'<html lang="en">\''));
  if (!pg.viewport) I.push(issue('T-VIEWPORT', 'P0', 'no meta viewport', 'Add responsive viewport meta.', 'view-source'));
  if (isContent && pg.canonical !== pg.url) I.push(issue('T-CANONICAL', 'P0', 'canonical=' + (pg.canonical || 'missing'), 'Self-referencing canonical to ' + pg.url, 'node tools/qa-site.mjs'));
  if (isContent && noindex) I.push(issue('T-NOINDEX', 'P0', 'robots=' + pg.robots, 'Confirm noindex is intended.', 'view-source'));
  if (isContent && pg.h1s.length !== 1) I.push(issue('T-H1', 'P0', pg.h1s.length + ' H1 tags', 'Exactly one H1.', 'node tools/qa-site.mjs'));
  if (isContent && !noindex) {
    const tl = [...pg.title].length, dl = [...pg.description].length;
    if (tl > 65 || tl < 30) I.push(issue('T-TITLE-LEN', 'P2', 'title ' + tl + ' chars', tl > 65 ? 'Shorten title to <=60-65 chars so the key phrase is not truncated (skip if PROTECTED).' : 'Expand title with the primary keyword.', 'node tools/seo-master-matrix.mjs'));
    if (dl < 70 || dl > 165) I.push(issue('T-META-LEN', 'P2', 'meta description ' + dl + ' chars', 'Rewrite meta description to ~120-160 chars (skip if PROTECTED).', 'node tools/seo-master-matrix.mjs'));
    if ((titleOwners.get(pg.title) || []).length > 1) I.push(issue('T-TITLE-DUP', 'P0', 'same title as ' + titleOwners.get(pg.title).filter(x => x !== pg.path).slice(0, 2).join(', '), 'Make the title unique.', 'node tools/seo-audit.mjs'));
    if ((descOwners.get(pg.description) || []).length > 1) I.push(issue('T-META-DUP', 'P1', 'same meta as ' + descOwners.get(pg.description).filter(x => x !== pg.path).slice(0, 2).join(', '), 'Make the meta description unique.', 'node tools/seo-audit.mjs'));
  }
  if (pg.mainUnclosed) I.push(issue('T-HTML-MAIN', 'P0', '<main> is never closed, so the footer is parsed inside the main landmark', 'Close </main> after the article.', 'node tools/seo-master-matrix.mjs'));
  if (pg.dupIds.length) I.push(issue('T-HTML-DUP-ID', 'P1', 'duplicate id(s): ' + pg.dupIds.slice(0, 4).join(', ') + ' (TOC links can jump to the wrong element)', 'Keep the id on the heading only.', 'node tools/seo-master-matrix.mjs'));
  if (pg.pUnbalanced) I.push(issue('T-HTML-P', 'P1', 'unbalanced <p> tags (stray </p> or unwrapped paragraph)', 'Repair paragraph markup.', 'node tools/seo-master-matrix.mjs'));
  if (pg.h3BeforeH2) I.push(issue('T-HEADING-ORDER', 'P2', 'H3 appears before the first H2', 'Fix heading order (H2 before H3).', 'outline check'));
  if (pg.faqH2 > 0 && pg.type !== 'faq') I.push(issue('T-FAQ-HEADINGS', 'P2', pg.faqH2 + ' FAQ questions marked up as H2 inside nested <article>; they appear as top-level sections in the TOC', 'Mark FAQ questions as H3 under the FAQ H2.', 'TOC shows questions nested under the FAQ heading'));
  const noAlt = pg.images.filter(i => i.alt === null).length;
  if (noAlt) I.push(issue('T-IMG-ALT', 'P1', noAlt + ' <img> without alt', 'Add alt text (empty alt only for decorative images).', 'node tools/qa-site.mjs'));
  if (pg.tablesUnwrapped) I.push(issue('T-TABLE-MOBILE', 'P2', pg.tablesUnwrapped + ' table(s) without .table-scroll wrapper', 'Wrap tables in .table-scroll for 320px screens.', 'mobile viewport 360px'));
  if (pg.path === '404.html' && /^0\s*;/.test(pg.metaRefresh)) I.push(issue('T-404-REFRESH', 'P2', '404 page has meta refresh "' + pg.metaRefresh + '" so visitors never see the not-found message and broken links are silently sent to the homepage', 'Replace the instant refresh with a helpful 404 page (links to hubs). No URL is removed.', 'open a missing URL: 404 status + visible message'));
  // schema
  if (pg.type === 'article' && !pg.schemaTypes.some(t => /Article|BlogPosting/.test(t))) I.push(issue('S-ARTICLE', 'P1', 'schema types: ' + uniq(pg.schemaTypes).join(', '), 'Add Article JSON-LD (headline=H1, author/publisher=the business, datePublished from Content Matrix, shown visibly on the page).', 'Rich Results Test / schema.org validator; node tools/qa-site.mjs'));
  if (pg.type === 'hub' && !pg.schemaTypes.includes('CollectionPage')) I.push(issue('S-HUB', 'P2', 'schema types: ' + uniq(pg.schemaTypes).join(', '), 'Mark hub as CollectionPage with an ItemList of the articles it visibly lists.', 'schema.org validator'));
  if (pg.type === 'homepage' && !/priceRange/.test(read('index.html'))) I.push(issue('S-PRICERANGE', 'P2', 'LocalBusiness has no priceRange although prices are visible', 'Add priceRange built from the verified price table.', 'Rich Results Test (LocalBusiness)'));
  // links
  const inb = inbound.get(pg.path);
  const anyIn = Object.values(inb).reduce((s, set) => s + set.size, 0);
  if (isContent && pg.path !== 'index.html' && anyIn === 0) I.push(issue('L-ORPHAN', 'P0', 'no internal page links here', 'Link from parent hub and related pages.', 'node tools/seo-master-matrix.mjs (inbound > 0)'));
  const d = depth.get(pg.path), de = depthEditorial.get(pg.path);
  if (pg.type === 'article') {
    const hubPath = pg.hubDir + '/index.html';
    const hubLinks = new Set([...(byPath.get(hubPath)?.links.editorial || []), ...(byPath.get(hubPath)?.links.hubindex || [])]);
    if (!hubLinks.has(pg.path)) I.push(issue('L-HUB-LINK', 'P1', 'parent hub /' + pg.hubDir + '/ does not link to this article', 'List the article in the parent hub\'s generated article index.', 'hub HTML contains href to this URL'));
    if (de === undefined || de > 3) I.push(issue('L-DEPTH', 'P1', 'click depth ' + (d ?? 'unreachable') + ' via all links; ' + (de ?? 'unreachable') + ' without auto related/prev-next blocks', 'Reach every article within 3 clicks of the homepage through hub listings.', 'node tools/seo-master-matrix.mjs (depth)'));
    if (inb.editorial.size === 0) I.push(issue('L-CONTEXT', 'P2', 'no in-text links from other articles (only generated blocks)', 'Add 1-2 contextual links from closely related articles where genuinely useful.', 'node tools/seo-master-matrix.mjs (contextual inbound)'));
  }
  if (pg.type === 'hub') {
    const children = pages.filter(x => x.type === 'article' && x.hubDir === pg.hubDir).length;
    const linked = uniq([...pg.links.editorial, ...(pg.links.hubindex || [])].filter(t => t.startsWith(pg.hubDir + '/') && t !== pg.path)).length;
    if (linked < children) I.push(issue('L-HUB-INDEX', 'P0', 'links to ' + linked + ' of ' + children + ' child articles' + (/Planned articles include/i.test(pg.edText) ? '; "Articles in this hub" lists unlinked planned titles' : ''), 'Replace the stale list with a build-generated, grouped index of all published child articles.', 'hub links to all children; node tools/seo-master-matrix.mjs'));
  }
  // direct answer near the top of commercial pages (price + location facts readers and AI answers look for)
  const SERVICE_HUBS = ['hanoi-motorbike-rental', 'hanoi-50cc-motorbike-rental', 'hanoi-scooter-rental', 'hanoi-motorbike-rental-cost', 'motorbike-rental-hanoi-old-quarter', 'monthly-motorbike-rental-hanoi'];
  if (pg.type === 'homepage' || (pg.type === 'hub' && SERVICE_HUBS.includes(pg.hubDir))) {
    const lead = pg.edText.split(/\s+/).slice(0, 130).join(' ');
    const missing = [];
    if (!/\d{2,3},000 VND/.test(lead)) missing.push('a verified price');
    if (!/Long Bien|Nguyen Van Cu/.test(lead)) missing.push('the pickup location');
    if (pg.type === 'homepage' && !/09:00/.test(lead)) missing.push('opening hours');
    if (missing.length) I.push(issue('C-DIRECT-ANSWER', 'P1', 'first 130 words lack ' + missing.join(', '), 'Add a short answer-first summary (verified prices, location, hours) near the top.', 'read first screen; node tools/seo-master-matrix.mjs'));
  }
  // content
  if (pg.metaSeo.length) I.push(issue('C-META-COPY', pg.type === 'article' ? 'P2' : 'P0', pg.metaSeo.length + ' block(s) of SEO/production notes shown to readers, e.g. "' + pg.metaSeo[0].slice(0, 110) + '"', 'Rewrite as reader-facing guidance or remove the internal note.', 'node tools/seo-master-matrix.mjs (C-META-COPY absent)'));
  for (const x of pg.policy) I.push(issue('C-UNVERIFIED-POLICY', 'P0', 'unverified policy claim: "' + x.text + '"', 'Reword so it does not state a policy that is not in data/site-system.json; ask the shop to confirm.', 'node tools/seo-master-matrix.mjs'));
  for (const x of pg.legal) I.push(issue('C-LEGAL-RISK', 'P0', 'implies riding without a licence is acceptable: "' + x.text + '"', 'Remove the implication; point to the licence guide and official sources.', 'node tools/seo-master-matrix.mjs'));
  const legalPage = pg.hubDir === legalHub || (pg.type === 'article' && LEGAL_PAGE_RX.test(pg.slug));
  if (isContent && legalPage && pg.external.length === 0 && pg.type !== 'legal') I.push(issue('C-NO-SOURCES', pg.type === 'hub' || /motorbike-license-vietnam-tourists|hanoi-motorbike-traffic-rules|motorbike-helmet-guide-hanoi/.test(pg.slug) ? 'P1' : 'P2', 'legal/safety topic with 0 links to official sources', 'Add an "Official sources" box linking primary sources (law text, UN treaty, government travel advice).', 'page contains external official links'));
  if (pg.family) {
    const fam = families.get(pg.family.family);
    const meanFam = pg.famCos.length ? pg.famCos.reduce((s, x) => s + x, 0) / pg.famCos.length : 0;
    const base = crossBaseline.get(pg.hubDir) || 0;
    pg.familyStats = { family: pg.family.family, plan: pg.family.plan, size: fam.length, varies: pg.family.varies, meanCos: round(meanFam), crossBase: round(base) };
    if (fam.length >= pg.family.min) {
      // In-place repair checks (owner rule: no merge, no redirect, no noindex).
      const siblings = fam.filter(x => x !== pg.path);
      const navLinks = new Set(pg.links.familynav || []);
      const variantToks = pg.family.variant.split('-').filter(t => t.length > 2 && !STOP.has(t));
      const h1 = (pg.h1s[0] || '').toLowerCase();
      const fails = [];
      if (!siblings.every(x => navLinks.has(x))) fails.push('no family navigation to the ' + siblings.length + ' sibling guides');
      // a selection guide may say so in plain words ("choosing", "which to rent")
      const FORMAT_SYN = { selection: /\b(choos|which|pick|select|look for)/ };
      const namesVariant = variantToks.some(t => h1.includes(t.length > 5 ? t.slice(0, 5) : t.replace(/s$/, '')) || (FORMAT_SYN[t] && FORMAT_SYN[t].test(h1)));
      if (variantToks.length && !namesVariant) fails.push('H1 does not name the ' + pg.family.varies);
      if (pg.metaSeo.length) fails.push('SEO notes in copy');
      if (pg.unnatural >= 6) fails.push(pg.unnatural + ' generator phrases');
      if (fails.length) I.push(issue('C-TEMPLATE-FAMILY', 'P0', 'one of ' + fam.length + ' pages on "' + pg.family.key.replace(/-/g, ' ') + '" in /' + pg.hubDir + '/ where only the ' + pg.family.varies + ' changes; topic similarity ' + round(meanFam) + ' inside the family vs ' + round(base) + ' across families; ' + Math.round(pg.boilerplate * 100) + '% of sentences reused on 3+ pages; open repairs: ' + fails.join('; '), 'Repair in place (owner rule: no deletion, no URL change, no noindex): clear audience-specific H1, family navigation to the sibling guides, remove SEO notes and generator phrasing, keep facts verified.', 'node tools/seo-master-matrix.mjs (family repair checks)'));
    }
  }
  if (pg.maxJac >= 0.25) I.push(issue('C-NEAR-DUP', 'P0', 'shares ' + Math.round(pg.maxJac * 100) + '% of 5-word phrases with ' + pg.maxJacWith, 'Rewrite the copied passages in place (replace repeated boilerplate with a link to the guide that covers it).', 'node tools/seo-master-matrix.mjs'));
  else if (pg.boilerplate >= 0.3 && isContent) I.push(issue('C-BOILERPLATE', 'P1', Math.round(pg.boilerplate * 100) + '% of sentences repeated on 3+ other pages', 'Rewrite repeated passages with page-specific information.', 'node tools/seo-master-matrix.mjs'));
  if (pg.purple >= 3) I.push(issue('C-PURPLE', 'P2', pg.purple + ' over-styled words ("honest", "arithmetic", "ledger", "verdict"...) in ' + pg.wordCount + ' words', 'Rewrite those sentences in plain English; keep the advice, drop the decoration.', 'node tools/seo-master-matrix.mjs'));
  if (pg.unnatural >= 6) I.push(issue('C-STYLE', 'P2', pg.unnatural + ' uses of generator tics ("the desk", "the counter", "honest arithmetic")', 'Edit to plain English ("the shop", "the rental agreement").', 'node tools/seo-master-matrix.mjs'));
  const outAll = adj.get(pg.path) || new Set();
  for (const k of (cannibalOf.get(pg.path) || [])) {
    const others = cannibal.get(k).filter(x => x !== pg.path);
    const head = k.startsWith('head:');
    // Repaired in place when the page links to every other page of its group and the titles differ.
    if (!head && others.every(x => outAll.has(x)) && others.every(x => byPath.get(x).title !== pg.title)) continue;
    const owner = head ? (k === 'head:hanoi motorbike rental' ? 'index.html' : null) : null;
    let action = 'Differentiate the intent in title/H1 and cross-link the pages of this group (no redirect).';
    if (head && owner && pg.path === owner) action = 'Keep as owner of the head term.';
    else if (head) action = 'Differentiate the title/H1 core toward this page\'s sub-intent so the owner page keeps the head term (title edit; skip if PROTECTED).';
    I.push(issue('C-CANNIBAL', 'P1', k + ' shared with ' + others.length + ' URL(s): ' + others.slice(0, 4).map(x => hrefOf(x)).join(', ') + (others.length > 4 ? ' ...' : ''), action, 'node tools/seo-master-matrix.mjs; GSC query->page (UNKNOWN)'));
  }
  if (pg.path === 'hanoi-motorbike-for-sale/index.html' && /motorbike for sale/i.test(pg.title.split(/[:|]/)[0])) I.push(issue('C-INTENT', 'P1', '"hanoi motorbike for sale" is a buying query; the business only rents (page says so)', 'Retarget title/H1 to "buying vs renting a motorbike in Hanoi" without changing the URL.', 'title/H1 review'));
  if (pg.type === 'article' && pg.contentImages === 0) I.push(issue('C-NO-PHOTOS', 'P2', 'no content images (site has no real photos of bikes or shop)', 'Add real photos supplied by the shop with descriptive alt text.', 'images present with alt', OWNER));
  // business data consistency (NAP must match data/site-system.json)
  const phones = uniq([...pg.edText.matchAll(/(?:\+?84|0)\d{2,3}[ .]?\d{3}[ .]?\d{3,4}/g)].map(x => x[0].replace(/[ .]/g, ''))).filter(x => !['0942467674', '+84942467674', '84942467674'].includes(x));
  if (phones.length) I.push(issue('B-NAP', 'P0', 'unverified phone-like number(s): ' + phones.join(', '), 'Use only the verified phone.', 'grep'));
  const emails = uniq([...pg.edText.matchAll(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g)].map(x => x[0].toLowerCase().replace(/\.$/, ''))).filter(x => x !== system.business.email);
  if (emails.length) I.push(issue('B-NAP', 'P0', 'unverified email(s): ' + emails.join(', '), 'Use only the verified email.', 'grep'));
  const addrs = uniq([...pg.edText.matchAll(/(\d+[A-Za-z]?)\s+Nguyen Van Cu/g)].map(x => x[1])).filter(x => x !== '112');
  if (addrs.length) I.push(issue('B-NAP', 'P0', 'address number(s) on Nguyen Van Cu other than 112: ' + addrs.join(', '), 'Use the verified address.', 'grep'));
  const hoursBad = [...pg.edText.matchAll(/open(?:s|ing hours?)?[^.]{0,40}?(\d{1,2}[:.]\d{2})\s*(?:-|–|to)\s*(\d{1,2}[:.]\d{2})/gi)].map(x => x[1].replace('.', ':').padStart(5, '0') + '-' + x[2].replace('.', ':').padStart(5, '0')).filter(x => x !== '09:00-21:00');
  if (hoursBad.length) I.push(issue('B-NAP', 'P0', 'opening hours differ from 09:00-21:00: ' + uniq(hoursBad).join(', '), 'Use the verified hours.', 'grep'));
  // overrides: status/priority/notes per path
  const ov = overrides.pages && overrides.pages[pg.path];
  if (ov && ov.issues) for (const x of I) if (ov.issues[x.code]) Object.assign(x, ov.issues[x.code]);
  pg.issues = I;
  pg.protected = !!(ov && ov.protected);
}

// global issues (apply to the shared template / site config)
const globalIssues = [];
{
  const ui = read('site/partials/floating-ui.html');
  if ((/wa\.me/.test(ui) || /contacts\.whatsapp\.href/.test(ui)) && system.contacts.whatsapp && system.contacts.whatsapp.verified === false) globalIssues.push(issue('B-WHATSAPP', 'P1', 'Quick Contact shows WhatsApp on every page while data/site-system.json marks contacts.whatsapp.verified=false', 'Shop owner confirms WhatsApp on 0942 467 674 -> set verified=true; otherwise hide the button.', 'data/site-system.json + rendered Quick Contact', OWNER));
  const rel = read('tools/build-site.mjs');
  if (/<h2>Related hubs<\/h2>/.test(rel)) globalIssues.push(issue('G-RELATED-LABEL', 'P2', 'related block on 1,000 pages is titled "Related hubs" but mostly lists articles', 'Rename to "Related guides".', 'rendered related block heading'));
  if (!exists('_config.yml')) globalIssues.push(issue('G-JEKYLL-STRAY', 'P2', 'GitHub Pages builds with Jekyll and no _config.yml: internal files are public (e.g. /reports/seo-audit.html rendered from Markdown, /data/content-matrix.csv, /tools/*.mjs)', 'Not done: excluding them would remove live URLs (owner rule: no deletion). New internal Markdown reports use published:false so no new stray pages are created.', 'n/a', 'WONTFIX - OWNER RULE'));
  const sm = read('sitemap.xml');
  if (!/<lastmod>/.test(sm)) globalIssues.push(issue('G-SITEMAP-LASTMOD', 'P2', 'sitemap.xml has changefreq/priority (ignored by Google) but no lastmod', 'Add accurate lastmod from Content Matrix dates (published/updated), not from build time.', 'sitemap.xml'));
  // measure the file the shared header actually loads
  const headerLogo = (read('index.html').match(/class="brand-ico"><img src="\/([^"]+)"/) || [, 'Logonh.png'])[1];
  const logo = fs.statSync(path.join(ROOT, headerLogo)).size;
  if (logo > 20000) globalIssues.push(issue('G-LOGO-WEIGHT', 'P2', 'header logo /' + headerLogo + ' (' + Math.round(logo / 1024) + ' KB) is displayed at 34x34 on every page', 'Serve a small header copy (e.g. 68x68) and keep the large file for OG/schema.', 'Lighthouse / network panel'));
  const dates = {};
  for (const r of matrixRows) if (r.published_at) dates[r.published_at] = (dates[r.published_at] || 0) + 1;
  const big = Object.entries(dates).sort((a, b) => b[1] - a[1]);
  const flagged = [...families.entries()].filter(([k, f]) => f.length >= FAMILY_RULES[k.split('/')[0]].min);
  globalIssues.push(issue('G-SCALED-CONTENT', 'P0', big.map(([d, n]) => n + ' pages published ' + d).join('; ') + '; ' + flagged.reduce((s, [, f]) => s + f.length, 0) + ' of ' + pages.filter(p => p.type === 'article').length + ' articles sit in ' + flagged.length + ' template families (same topic, only audience/period/format/destination changes)', 'Keep the factory paused; repair families in place (no deletion/URL change/noindex per owner rule); deeper per-family rewrites with real local detail remain the main lever; monitor indexing in GSC.', 'GSC Pages report (UNKNOWN until GSC is connected)', 'OPEN - RESIDUAL RISK'));
  globalIssues.push(issue('G-GSC', 'P1', 'No Search Console data available to this audit (not connected to OpenSEO/OpenRush)', 'Connect GSC (or share exports) so rankings/indexing can replace UNKNOWN values.', 'GSC property access', OWNER));
}
const gOv = overrides.global || {};
for (const x of globalIssues) if (gOv[x.code]) Object.assign(x, gOv[x.code]);


// ---------------------------------------------------------------- baseline / FIXED
const baselinePath = 'reports/seo-master-baseline.json';
const keyOf = (p, x) => p + '|' + x.code + (x.code === 'C-CANNIBAL' ? '|' + x.evidence.split(' ')[0] : '') + (x.code === 'B-NAP' || x.code === 'C-UNVERIFIED-POLICY' || x.code === 'C-LEGAL-RISK' ? '|' + x.evidence.slice(0, 60) : '');
if (WRITE_BASELINE || !exists(baselinePath)) {
  const lines = [];
  for (const pg of pages) lines.push(JSON.stringify(pg.path) + ':' + JSON.stringify(pg.issues.map(x => ({ key: keyOf(pg.path, x), code: x.code, priority: x.priority, evidence: x.evidence, action: x.action, verify: x.verify }))));
  const out = '{"generated_at":' + JSON.stringify(TODAY) + ',\n"global":' + JSON.stringify(globalIssues.map(x => ({ code: x.code, priority: x.priority, evidence: x.evidence, action: x.action }))) + ',\n"pages":{\n' + lines.join(',\n') + '\n}}\n';
  fs.mkdirSync(path.join(ROOT, 'reports'), { recursive: true });
  fs.writeFileSync(path.join(ROOT, baselinePath), out);
}
const baseline = JSON.parse(read(baselinePath));
for (const pg of pages) {
  const now = new Set(pg.issues.map(x => keyOf(pg.path, x)));
  pg.fixed = (baseline.pages[pg.path] || []).filter(x => !now.has(x.key)).map(x => ({ code: x.code, priority: x.priority, evidence: 'baseline ' + baseline.generated_at + ': ' + x.evidence, action: x.action, verify: x.verify, status: 'FIXED' }));
}
const nowGlobal = new Set(globalIssues.map(x => x.code));
const fixedGlobal = (baseline.global || []).filter(x => !nowGlobal.has(x.code)).map(x => ({ ...x, status: 'FIXED' }));

// ---------------------------------------------------------------- rows
function statusOf(I, fixed) {
  const open = I.filter(x => x.status === 'OPEN');
  if (open.length) return fixed.length ? 'IN PROGRESS' : 'OPEN';
  if (I.length) {
    const s = uniq(I.map(x => x.status === APPROVAL ? 'AWAITING APPROVAL' : x.status === OWNER ? 'NEEDS OWNER DATA' : x.status));
    return (fixed.length ? 'DONE (safe fixes) + ' : '') + s.join(' + ');
  }
  return fixed.length ? 'DONE' : 'OK';
}
const SERVICE = new Set(['hanoi-motorbike-rental', 'hanoi-50cc-motorbike-rental', 'hanoi-scooter-rental', 'hanoi-motorbike-rental-cost', 'motorbike-rental-hanoi-old-quarter', 'monthly-motorbike-rental-hanoi']);
const roleOf = pg => pg.type === 'homepage' ? 'homepage / service page' : pg.type === 'hub' ? (SERVICE.has(pg.hubDir) ? 'service hub' : 'guide hub') : pg.type === 'faq' ? 'FAQ / answer hub' : pg.type === 'legal' ? 'legal page' : pg.type === 'utility' ? '404 page' : 'article';
const rows = pages.map(pg => {
  const open = pg.issues;
  const pr = open.length ? open.map(x => x.priority).sort((a, b) => P[a] - P[b])[0] : '-';
  const hubPg = pg.hubDir ? byPath.get(pg.hubDir + '/index.html') : null;
  const primary = pg.matrix.primary_keyword || (pg.type === 'utility' ? '(none)' : 'UNKNOWN');
  return {
    url: pg.url,
    path: pg.path,
    page_type: pg.type,
    page_role: roleOf(pg),
    hub: pg.type === 'homepage' ? 'Homepage (root hub)' : pg.type === 'hub' ? (pg.matrix.hub || pg.title) : hubPg ? (hubPg.matrix.hub || pg.hubDir) : (pg.matrix.hub || '-'),
    hub_url: hubPg ? hubPg.url : (pg.type === 'homepage' ? DOMAIN + '/' : ''),
    primary_keyword: primary,
    primary_keyword_volume: pg.type === 'utility' ? 'n/a' : kwVolume(primary),
    secondary_keywords: secondaryFor(pg).map(kwTag),
    search_intent: pg.matrix.intent || (pg.type === 'utility' ? 'n/a' : 'UNKNOWN'),
    ranking: 'UNKNOWN', traffic: 'UNKNOWN',
    protected: pg.protected,
    title: pg.title, title_length: [...pg.title].length,
    meta_description: pg.description, meta_length: [...pg.description].length,
    h1: pg.h1s[0] || '', h2_count: pg.h2.length, h3_count: pg.h3.length,
    word_count: pg.wordCount,
    canonical: pg.canonical, robots: pg.robots || 'index,follow (default)', lang: pg.lang,
    schema_types: uniq(pg.schemaTypes),
    published_at: pg.matrix.published_at || '',
    click_depth: depth.get(pg.path) ?? null,
    click_depth_without_auto_blocks: depthEditorial.get(pg.path) ?? null,
    inbound: Object.fromEntries(Object.entries(inbound.get(pg.path)).map(([k, v]) => [k, v.size])),
    external_links: uniq(pg.external),
    similarity: pg.type === 'utility' ? null : { max_5gram_jaccard: round(pg.maxJac), most_similar_lexical: pg.maxJacWith, max_topic_cosine: round(pg.maxCos), most_similar_topic: pg.maxCosWith, boilerplate_ratio: round(pg.boilerplate), family: pg.familyStats || null },
    issues: open,
    fixed: pg.fixed,
    priority: pr,
    status: statusOf(open, pg.fixed),
    verification: uniq(open.map(x => x.verify)).join('; ') || 'node tools/seo-master-matrix.mjs (no open issue detected)'
  };
});

// ---------------------------------------------------------------- summary
const count = f => rows.filter(f).length;
const issueCounts = {};
for (const r of rows) for (const x of r.issues) {
  const c = issueCounts[x.code] = issueCounts[x.code] || { pages: 0, priority: x.priority, statuses: {} };
  c.pages++; if (P[x.priority] < P[c.priority]) c.priority = x.priority;
  c.statuses[x.status] = (c.statuses[x.status] || 0) + 1;
}
const fixedCounts = {};
for (const r of rows) for (const x of r.fixed) fixedCounts[x.code] = (fixedCounts[x.code] || 0) + 1;
const famList = [...families.entries()].filter(([k, v]) => v.length >= FAMILY_RULES[k.split('/')[0]].min).map(([k, v]) => {
  const ps = v.map(x => byPath.get(x));
  const m = ps.flatMap(x => x.famCos); const mean = m.length ? m.reduce((s, x) => s + x, 0) / m.length : 0;
  const rule = FAMILY_RULES[k.split('/')[0]];
  return { family: k, plan: rule.plan, varies: rule.varies, size: v.length, mean_topic_cosine: round(mean), hub_cross_topic_baseline: round(crossBaseline.get(ps[0].hubDir) || 0), mean_boilerplate: round(ps.reduce((s, x) => s + x.boilerplate, 0) / ps.length), max_5gram_jaccard: round(Math.max(...ps.map(x => x.maxJac))), hand_written_overlap: (familyOwnerCandidates.get(k) || []).map(hrefOf), urls: v.map(hrefOf) };
}).sort((a, b) => a.plan.localeCompare(b.plan, 'en', { numeric: true }) || b.size - a.size || a.family.localeCompare(b.family));
const cannibalList = [...cannibal.entries()].map(([k, v]) => ({ group: k, size: v.length, urls: v.map(hrefOf) })).sort((a, b) => b.size - a.size || a.group.localeCompare(b.group));
const batches = exists('reports/seo-master-batches.json') ? JSON.parse(read('reports/seo-master-batches.json')) : [];
const prStatus = {};
for (const r of rows) { const k = r.priority + ' / ' + r.status; prStatus[k] = (prStatus[k] || 0) + 1; }
const depthVals = rows.filter(r => r.page_type === 'article').map(r => r.click_depth_without_auto_blocks);
const summary = {
  generated_at: TODAY,
  baseline_at: baseline.generated_at,
  urls_audited: rows.length,
  by_role: rows.reduce((o, r) => (o[r.page_role] = (o[r.page_role] || 0) + 1, o), {}),
  priority: { P0: count(r => r.priority === 'P0'), P1: count(r => r.priority === 'P1'), P2: count(r => r.priority === 'P2'), none: count(r => r.priority === '-') },
  priority_by_status: prStatus,
  status: rows.reduce((o, r) => (o[r.status] = (o[r.status] || 0) + 1, o), {}),
  open_issue_counts: issueCounts,
  fixed_issue_counts: fixedCounts,
  global_issues: globalIssues,
  global_fixed: fixedGlobal,
  max_click_depth_all_links: Math.max(...rows.map(r => r.click_depth ?? 0)),
  articles_deeper_than_3_without_auto_blocks: depthVals.filter(d => d == null || d > 3).length,
  articles_unreachable_without_auto_blocks: depthVals.filter(d => d == null).length,
  template_families: famList.length,
  template_family_articles: famList.reduce((s, f) => s + f.size, 0),
  keyword_sources: research.sources || {},
  gsc: 'NOT CONNECTED - rankings, clicks, impressions and index status are UNKNOWN'
};

// ---------------------------------------------------------------- JSON (one row per line keeps git diffs readable)
const jsonOut = '{\n"summary":' + JSON.stringify(summary) +
  ',\n"batches":' + JSON.stringify(batches) +
  ',\n"template_families":[\n' + famList.map(x => JSON.stringify(x)).join(',\n') + '\n]' +
  ',\n"cannibalization_groups":[\n' + cannibalList.map(x => JSON.stringify(x)).join(',\n') + '\n]' +
  ',\n"rows":[\n' + rows.map(x => JSON.stringify(x)).join(',\n') + '\n]\n}\n';
fs.mkdirSync(path.join(ROOT, 'reports'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'reports/seo-master-matrix.json'), jsonOut);

// ---------------------------------------------------------------- Markdown
const esc = s => String(s ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ').replace(/\{\{|\}\}|\{%|%\}/g, m => m[0] + ' ' + m[1]);
const short = (s, n) => { s = String(s || ''); return s.length > n ? s.slice(0, n - 1) + '…' : s; };
const ACT = {
  'C-TEMPLATE-FAMILY': 'Merge (approval)', 'C-NEAR-DUP': 'Merge/rewrite (approval)', 'C-CANNIBAL': 'One owner URL', 'C-META-COPY': 'Remove SEO notes',
  'C-UNVERIFIED-POLICY': 'Remove unverified policy', 'C-LEGAL-RISK': 'Remove no-licence advice', 'C-NO-SOURCES': 'Official sources', 'C-DIRECT-ANSWER': 'Answer-first summary',
  'C-INTENT': 'Retarget title/H1 (approval)', 'C-STYLE': 'Plain English', 'C-PURPLE': 'Plain English', 'C-BOILERPLATE': 'Rewrite repeats', 'C-NO-PHOTOS': 'Real photos (owner)',
  'L-HUB-INDEX': 'Full hub index', 'L-HUB-LINK': 'Hub index link', 'L-DEPTH': '<=3 clicks', 'L-CONTEXT': 'Contextual link', 'L-ORPHAN': 'Link from hub',
  'S-ARTICLE': 'Article schema + date', 'S-HUB': 'CollectionPage', 'S-PRICERANGE': 'priceRange', 'T-FAQ-HEADINGS': 'FAQ as H3', 'T-TITLE-LEN': 'Title <=65',
  'T-META-LEN': 'Meta 120-160', 'T-404-REFRESH': 'Helpful 404 (approval)', 'B-NAP': 'Verified NAP', 'T-CANONICAL': 'Fix canonical', 'T-H1': 'One H1',
  'T-TITLE-DUP': 'Unique title', 'T-META-DUP': 'Unique meta', 'T-IMG-ALT': 'Add alt', 'T-TABLE-MOBILE': 'Wrap table', 'T-HEADING-ORDER': 'Heading order',
  'T-LANG': 'lang=en', 'T-NOINDEX': 'Check noindex', 'T-VIEWPORT': 'Add viewport'
};
const VER = {
  'C-TEMPLATE-FAMILY': 'GSC*', 'C-NEAR-DUP': 'GSC*', 'C-CANNIBAL': 'GSC*', 'S-ARTICLE': 'RRT', 'S-HUB': 'RRT', 'S-PRICERANGE': 'RRT', 'C-NO-PHOTOS': 'owner', 'C-INTENT': 'GSC*'
};
const compactEvidence = x => {
  const e = x.evidence, n = (e.match(/^(\d+)/) || [, ''])[1];
  switch (x.code) {
    case 'C-TEMPLATE-FAMILY': { const m = e.match(/one of (\d+) pages on "([^"]+)".*?similarity ([\d.]+) inside the family vs ([\d.]+).*?(\d+)% of sentences/); return m ? m[1] + ' pages "' + m[2] + '", cos ' + m[3] + ' vs ' + m[4] : short(e, 80); }
    case 'C-NEAR-DUP': { const m = e.match(/shares (\d+)% .* with (\S+)/); return m ? m[1] + '% 5-gram overlap ' + m[2] : short(e, 80); }
    case 'L-DEPTH': { const m = e.match(/click depth (\S+) via all links; (\S+) without/); return m ? m[1] + '/' + (m[2] === 'unreachable' ? '∞' : m[2]) : short(e, 60); }
    case 'C-CANNIBAL': return e.split(' shared with ')[0];
    case 'L-HUB-LINK': case 'S-ARTICLE': case 'C-NO-PHOTOS': case 'L-CONTEXT': case 'C-NO-SOURCES': return '';
    case 'T-FAQ-HEADINGS': case 'C-STYLE': case 'C-PURPLE': case 'C-META-COPY': return n;
    case 'T-META-LEN': case 'T-TITLE-LEN': return (e.match(/(\d+) chars/) || [, ''])[1] + 'ch';
    default: return short(e, 100);
  }
};
const md = [];
md.push('---', 'published: false', '---', '');
md.push('# SEO Master Matrix — app.rentbikehanoi.com', '');
md.push('Generated ' + TODAY + ' by `node tools/seo-master-matrix.mjs` from the repository HTML (static audit, not a live crawl). Baseline: ' + baseline.generated_at + '. Full evidence per URL and issue: `reports/seo-master-matrix.json`. Items that need a decision: `reports/seo-approval-proposals.md`.', '');
md.push('**Data limits.** Google Search Console is not connected to this audit, so rankings, clicks, impressions and index status are **UNKNOWN** on every row. Search volumes come only from Ubersuggest (free tier, ' + research.collected_at + '); every other volume is **UNKNOWN**. Business facts come only from `data/site-system.json`. No title or meta description is marked PROTECTED in the repo (field `protected` in the JSON; set it in `data/seo-master-overrides.json`).', '');
md.push('## Summary', '', '| Metric | Value |', '|---|---|');
md.push('| URLs audited | ' + rows.length + ' — ' + Object.entries(summary.by_role).map(([k, v]) => k + ' ' + v).join(', ') + ' |');
md.push('| Rows by highest open priority | P0 ' + summary.priority.P0 + ' · P1 ' + summary.priority.P1 + ' · P2 ' + summary.priority.P2 + ' · none ' + summary.priority.none + ' |');
md.push('| Rows by status | ' + Object.entries(summary.status).sort((a, b) => b[1] - a[1]).map(([k, v]) => k + ' ' + v).join(' · ') + ' |');
md.push('| Articles deeper than 3 clicks (ignoring auto related/prev-next) | ' + summary.articles_deeper_than_3_without_auto_blocks + ' of ' + depthVals.length + ' (unreachable: ' + summary.articles_unreachable_without_auto_blocks + ') |');
md.push('| Max click depth using every link | ' + summary.max_click_depth_all_links + ' |');
md.push('| Template families (proposals A1-A10) | ' + famList.length + ' families covering ' + summary.template_family_articles + ' articles |');
md.push('| Cannibalization groups | ' + cannibalList.length + ' |', '');
md.push('### Open issues by code', '', '| Code | Highest priority | Pages | Status split | Action |', '|---|---|---|---|---|');
for (const [k, v] of Object.entries(issueCounts).sort((a, b) => P[a[1].priority] - P[b[1].priority] || b[1].pages - a[1].pages)) md.push('| ' + k + ' | ' + v.priority + ' | ' + v.pages + ' | ' + Object.entries(v.statuses).map(([s, n]) => s + ' ' + n).join(', ') + ' | ' + esc(ACT[k] || '') + ' |');
md.push('');
md.push('### Fixed and verified by re-audit (vs baseline ' + baseline.generated_at + ')', '');
if (Object.keys(fixedCounts).length || fixedGlobal.length) {
  md.push('| Code | Pages fixed |', '|---|---|');
  for (const [k, v] of Object.entries(fixedCounts).sort((a, b) => b[1] - a[1])) md.push('| ' + k + ' | ' + v + ' |');
  for (const g of fixedGlobal) md.push('| ' + g.code + ' (site-wide) | site-wide |');
} else md.push('Nothing yet.');
md.push('');
md.push('### Site-wide issues', '', '| Code | Pri | Evidence | Action | Status | Verify |', '|---|---|---|---|---|---|');
for (const g of globalIssues) md.push('| ' + [g.code, g.priority, g.evidence, g.action, g.status, g.verify].map(esc).join(' | ') + ' |');
for (const g of fixedGlobal) md.push('| ' + [g.code, g.priority, g.evidence, g.action || '-', 'FIXED', 'node tools/seo-master-matrix.mjs'].map(esc).join(' | ') + ' |');
md.push('');
if (batches.length) {
  md.push('## Batch log', '', '| Batch | Date | Priority | Commit | Changes | Verification |', '|---|---|---|---|---|---|');
  for (const b of batches) md.push('| ' + [b.id, b.date, b.priority, b.commit || 'this commit', b.changes, b.verification].map(esc).join(' | ') + ' |');
  md.push('');
}
md.push('## Keyword research used', '', 'Volumes are monthly averages exactly as returned by the tool; "UNKNOWN" means no tool returned a number.', '', '| Keyword | Volume | Note |', '|---|---|---|');
for (const [k, v] of Object.entries(research.keywords)) md.push('| ' + esc(k) + ' | ' + esc(kwVolume(k)) + ' | ' + esc(v.note || (v.autocomplete_vn ? 'seen in Google autocomplete (VN)' : '')) + ' |');
md.push('', 'Do not target (service not verified or another business): ' + (research.do_not_target || []).map(esc).join(', ') + '.', '');
md.push('## Issue codes', '');
const legend = {
  'C-TEMPLATE-FAMILY': 'Article belongs to a family generated from one topic template where only the audience, rental period, format, sub-topic or destination changes (thresholds: 4+ pages; 3+ for price periods and guide formats; 2 for scooter checks/selection pairs). Evidence: family size; term-frequency cosine over content words with the varying words removed, inside the family vs between families of the same hub; share of sentences reused on 3+ pages.',
  'C-NEAR-DUP': 'Copy overlap (5-word shingle Jaccard >= 0.25) with another URL.',
  'C-CANNIBAL': 'Several URLs target the same query group (same model price, comparison, destination, or head term in the title core).',
  'C-META-COPY': 'Reader-facing text contains internal SEO/production notes ("cluster", "Matrix", "search engines", "this hub is growing").',
  'C-UNVERIFIED-POLICY': 'States a rental policy (helmet included, maintenance carried by the shop) that is not in the verified business data.',
  'C-LEGAL-RISK': 'Suggests a legal shortcut (riding without a licence).',
  'C-NO-SOURCES': 'Legal/safety topic without links to primary official sources.',
  'C-DIRECT-ANSWER': 'Commercial page whose first 130 words lack verified price/location/hours.',
  'C-INTENT': 'Primary keyword intent does not match what the business offers.',
  'C-PURPLE': '>=3 over-styled filler or metaphor words (honest, arithmetic, ledger, verdict, ritual...) on the page.',
  'C-STYLE': '>=6 repeated generator phrases ("the desk", "the counter", "honest arithmetic").',
  'C-BOILERPLATE': '>=30% of sentences repeated on 3+ other pages.',
  'C-NO-PHOTOS': 'No real photos; only the shop can supply them (never stock or AI images presented as the fleet).',
  'L-HUB-INDEX': 'Hub does not link to all of its child articles.',
  'L-HUB-LINK': 'Article is not linked from its parent hub.',
  'L-DEPTH': 'More than 3 clicks from the homepage once the auto related/prev-next blocks are ignored.',
  'L-CONTEXT': 'No in-text links from other articles (only generated blocks).',
  'S-ARTICLE': 'Article has only WebPage/BreadcrumbList schema.',
  'S-HUB': 'Hub lacks CollectionPage/ItemList for its visible article list.',
  'S-PRICERANGE': 'LocalBusiness lacks priceRange although prices are visible.',
  'T-FAQ-HEADINGS': 'FAQ questions are H2 inside nested <article>, so they appear as top-level sections.',
  'T-TITLE-LEN': 'Title > 65 characters (likely truncated) or < 30.',
  'T-META-LEN': 'Meta description outside 70-165 characters.',
  'T-404-REFRESH': '404 page redirects to the homepage instantly via meta refresh.',
  'B-NAP': 'Phone, email, address or hours differ from data/site-system.json.'
};
for (const [k, v] of Object.entries(legend)) md.push('- **' + k + '** — ' + v);
md.push('', 'Verify column: `audit` = `node tools/seo-master-matrix.mjs`; `RRT` = Google Rich Results Test / schema.org validator; `GSC*` = Search Console (not connected: UNKNOWN); `owner` = needs data from the shop.', '');
md.push('## Template families', '', '| Proposal | Family (merge key) | Varies by | Size | Topic cosine in family | Between families | Max 5-gram overlap | Sentence reuse | Hand-written overlap |', '|---|---|---|---|---|---|---|---|---|');
for (const f of famList) md.push('| ' + [f.plan, f.family, f.varies, f.size, f.mean_topic_cosine, f.hub_cross_topic_baseline, Math.round(f.max_5gram_jaccard * 100) + '%', Math.round(f.mean_boilerplate * 100) + '%', f.hand_written_overlap.join(' ') || '-'].map(esc).join(' | ') + ' |');
md.push('', '## Cannibalization groups', '', '| Group | URLs |', '|---|---|');
for (const c of cannibalList) md.push('| ' + esc(c.group) + ' | ' + c.urls.map(esc).join(' · ') + ' |');
md.push('', '## Per-URL matrix', '', 'Columns: URL · primary keyword (volume) · secondary keywords · search intent · hub · issues with evidence · action · priority · status · how to verify. Ranking and traffic are UNKNOWN for every row (no GSC).', '');
const typeOrder = { homepage: 0, hub: 1, faq: 2, legal: 3, utility: 4, article: 5 };
const sorted = [...rows].sort((a, b) => typeOrder[a.page_type] - typeOrder[b.page_type] || a.path.localeCompare(b.path));
let section = null;
for (const r of sorted) {
  const s = r.page_type === 'article' ? 'Articles — ' + r.hub : 'Homepage, hubs and site pages';
  if (s !== section) { md.push('', '### ' + s, '', '| URL | Primary KW (volume) | Secondary KWs | Intent | Hub | Issues (evidence) | Action | Pri | Status | Verify |', '|---|---|---|---|---|---|---|---|---|---|'); section = s; }
  const art = r.page_type === 'article';
  const plan = r.similarity && r.similarity.family ? r.similarity.family.plan : '';
  const iss = r.issues.map(x => art ? (x.code + ' ' + compactEvidence(x)).trim() : x.code + ': ' + short(x.evidence, 220)).join(art ? ' · ' : '<br>');
  const fx = r.fixed.length ? 'Fixed: ' + uniq(r.fixed.map(x => x.code)).join(', ') : '';
  const act = uniq(r.issues.map(x => art ? (x.code === 'C-TEMPLATE-FAMILY' ? 'Merge ' + plan + ' (approval)' : (ACT[x.code] || x.code)) : short(x.action, 170))).join(art ? ' · ' : '<br>');
  const ver = uniq(r.issues.map(x => VER[x.code] || 'audit')).join(', ') || 'audit';
  const vol = r.primary_keyword_volume === 'UNKNOWN' ? 'UNKNOWN' : r.primary_keyword_volume.replace(/ \(Ubersuggest.*\)/, '');
  const hubName = r.page_type === 'article' ? r.hub_url.replace(DOMAIN, '') : r.hub;
  md.push('| ' + [r.url.replace(DOMAIN, ''), r.primary_keyword + ' (' + vol + ')', r.secondary_keywords.map(x => x.replace(/ \[.*\]$/, '')).join('; '), r.search_intent, hubName, [iss, fx].filter(Boolean).join(art ? ' · ' : '<br>') || '—', act || '—', r.priority, r.status, ver].map(esc).join(' | ') + ' |');
}
md.push('');
fs.writeFileSync(path.join(ROOT, 'reports/seo-master-matrix.md'), md.join('\n'));
console.log('SEO master matrix: ' + rows.length + ' URLs; P0 ' + summary.priority.P0 + ', P1 ' + summary.priority.P1 + ', P2 ' + summary.priority.P2 + ', none ' + summary.priority.none + '; families ' + famList.length + '; cannibal groups ' + cannibalList.length + '; fixed ' + JSON.stringify(fixedCounts) + (fixedGlobal.length ? '; site-wide fixed ' + fixedGlobal.map(x => x.code).join(',') : ''));
