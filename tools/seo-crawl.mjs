#!/usr/bin/env node
// Static technical SEO crawl of the built site (no network, no dependencies).
//
//   node tools/seo-crawl.mjs            write reports/seo-round2-crawl.json and print a summary
//   node tools/seo-crawl.mjs --check    also exit 1 when a P0 or P1 issue is open
//   node tools/seo-crawl.mjs --out FILE write the JSON report somewhere else
//
// It follows the same rules as tools/qa-site.mjs and tools/seo-audit.mjs and adds what they
// do not cover: the internal link graph (inlinks, orphans, click depth), JSON-LD validity,
// FAQ schema against visible text, image attributes, sitemap against the files, and
// near-duplicate body text. Every finding carries a code, a priority and the evidence.
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const argv = process.argv.slice(2);
const CHECK = argv.includes('--check');
const outIdx = argv.indexOf('--out');
const OUT = path.resolve(ROOT, outIdx >= 0 ? argv[outIdx + 1] : 'reports/seo-round2-crawl.json');

const system = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/site-system.json'), 'utf8'));
const DOMAIN = system.domain.replace(/\/$/, '');
const HUBS = [
  'hanoi-motorbike-rental', 'hanoi-50cc-motorbike-rental', 'hanoi-scooter-rental', 'hanoi-motorbike-rental-cost',
  'motorbike-rental-hanoi-old-quarter', 'monthly-motorbike-rental-hanoi', 'hanoi-motorbike-trips',
  'hanoi-motorbike-for-sale', 'renting-a-motorbike-in-vietnam', 'motorbike-guides'
];
const KEY_PAGES = ['index.html', ...HUBS.map(h => h + '/index.html')];
const COMPANY = new Set(['about/index.html', 'contact/index.html', 'privacy-policy.html', 'terms-of-use.html', 'faq/index.html']);

// ---------------------------------------------------------------- helpers
function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['.git', 'node_modules', 'site'].includes(e.name)) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, out);
    else if (e.isFile() && e.name.endsWith('.html')) out.push(full);
  }
  return out;
}
const rel = f => path.relative(ROOT, f).split(path.sep).join('/');
const canonicalFor = p => p === 'index.html' ? DOMAIN + '/' : p.endsWith('/index.html') ? DOMAIN + '/' + p.slice(0, -10) : DOMAIN + '/' + p;
const NAMED = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', middot: '·', hellip: '…', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', times: '×', copy: '©' };
function decode(v) {
  let out = String(v || '');
  for (let i = 0; i < 3; i++) {
    const n = out.replace(/&([a-z]+);/gi, (m, k) => NAMED[k.toLowerCase()] ?? m)
      .replace(/&#(\d+);/g, (m, k) => { try { return String.fromCodePoint(+k); } catch { return m; } })
      .replace(/&#x([0-9a-f]+);/gi, (m, k) => { try { return String.fromCodePoint(parseInt(k, 16)); } catch { return m; } });
    if (n === out) break; out = n;
  }
  return out;
}
const textOf = h => decode(String(h).replace(/<script\b[\s\S]*?<\/script>/gi, ' ').replace(/<style\b[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
const words = t => (t.match(/[A-Za-z0-9][A-Za-z0-9'’-]*/g) || []);
const attr = (tag, name) => { const m = tag.match(new RegExp('\\b' + name + '\\s*=\\s*("([^"]*)"|\'([^\']*)\')', 'i')); return m ? (m[2] ?? m[3]) : null; };
const metaContent = (c, key, val) => {
  for (const m of c.matchAll(/<meta\b[^>]*>/gi)) if ((attr(m[0], key) || '').toLowerCase() === val) return attr(m[0], 'content');
  return null;
};
const norm = s => decode(s).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const tokens = s => new Set(norm(s).split(' ').filter(w => w.length > 2));
const jaccardSets = (a, b) => { let i = 0; for (const x of a) if (b.has(x)) i++; return i / (a.size + b.size - i || 1); };

const issues = [];
const add = (code, pri, page, evidence, extra) => issues.push({ code, pri, page, evidence, ...(extra || {}) });

// ---------------------------------------------------------------- inventory
const files = walk(ROOT).sort();
const pages = new Map();
const SLOT_RE = /<!-- (SLOT|HOOK|FEATURE):([A-Za-z_]+):START -->[\s\S]*?<!-- \1:\2:END -->/g;
const REGION_SLOTS = {
  RELATED: 'related', POST_NAV: 'postnav', FAMILY_NAV: 'family', AUTHOR: 'author', CTA: 'cta', TOC: 'toc',
  HUB_INDEX: 'hubindex', SOURCES: 'sources', RATES: 'data', DEPOSITS: 'data', NAP: 'data', LEZ: 'data', LEZ_NOTE: 'data', SCHEMA: 'schema', SOCIAL_META: 'schema'
};

function regionsOf(c) {
  // Returns [{start,end,region}] covering the shell, breadcrumbs and generated slots.
  const out = [];
  for (const m of c.matchAll(/<!-- SHARED_NAV_START -->[\s\S]*?<!-- SHARED_NAV_END -->/g)) out.push({ start: m.index, end: m.index + m[0].length, region: 'shell' });
  for (const m of c.matchAll(/<!-- SHARED_FOOTER_START -->[\s\S]*?<!-- SHARED_FOOTER_END -->/g)) out.push({ start: m.index, end: m.index + m[0].length, region: 'shell' });
  for (const m of c.matchAll(/<nav class="crumbs"[\s\S]*?<\/nav>/g)) out.push({ start: m.index, end: m.index + m[0].length, region: 'crumbs' });
  for (const m of c.matchAll(SLOT_RE)) {
    const region = m[1] === 'SLOT' ? (REGION_SLOTS[m[2]] || 'generated') : 'shell';
    out.push({ start: m.index, end: m.index + m[0].length, region });
  }
  return out;
}
function regionAt(regs, i) {
  let best = null;
  for (const r of regs) if (i >= r.start && i < r.end && (!best || r.end - r.start < best.end - best.start)) best = r;
  return best ? best.region : 'body';
}

for (const file of files) {
  const p = rel(file);
  const c = fs.readFileSync(file, 'utf8');
  if (!/<html[\s>]/i.test(c)) continue; // fragments
  const robots = (metaContent(c, 'name', 'robots') || '').toLowerCase();
  const noindex = /noindex|none/.test(robots);
  const mainM = c.match(/<main\b[\s\S]*?<\/main>/i);
  const mainHtml = mainM ? mainM[0] : '';
  const mainStart = mainM ? mainM.index : -1;
  const slotless = mainHtml.replace(SLOT_RE, ' ').replace(/<nav class="crumbs"[\s\S]*?<\/nav>/g, ' ');
  const prose = textOf(slotless);
  const title = decode((c.match(/<title>([\s\S]*?)<\/title>/i) || [])[1] || '').replace(/<[^>]+>/g, '').trim();
  pages.set(p, {
    p, c, noindex, robots, title, mainHtml, mainStart, prose,
    url: canonicalFor(p),
    isArticle: /<script type="application\/ld\+json">[\s\S]*?"@type":"Article"/.test(c),
    desc: decode(metaContent(c, 'name', 'description') || '').trim(),
    canonical: (c.match(/<link rel="canonical" href="([^"]*)"/i) || [])[1] || '',
    h1s: [...mainHtml.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi)].map(m => textOf(m[1])),
    wordCount: words(prose).length,
    regs: regionsOf(c)
  });
}
const indexable = [...pages.values()].filter(x => x.p !== '404.html' && !x.noindex);
const byPath = new Map([...pages.keys()].map(k => [k, pages.get(k)]));

// ---------------------------------------------------------------- link resolution
function resolveHref(fromP, href) {
  if (!href) return { kind: 'empty' };
  href = href.trim();
  if (/^(mailto:|tel:|javascript:|sms:|whatsapp:|data:)/i.test(href)) return { kind: 'scheme' };
  let u = href;
  if (/^https?:\/\//i.test(u)) {
    if (!u.toLowerCase().startsWith(DOMAIN.toLowerCase())) return { kind: 'external', url: u };
    u = u.slice(DOMAIN.length) || '/';
  } else if (u.startsWith('//')) return { kind: 'external', url: u };
  const hashI = u.indexOf('#');
  const frag = hashI >= 0 ? u.slice(hashI + 1) : '';
  if (hashI >= 0) u = u.slice(0, hashI);
  const qI = u.indexOf('?');
  if (qI >= 0) u = u.slice(0, qI);
  if (u === '') return { kind: 'internal', target: fromP, frag, form: 'self' };
  if (!u.startsWith('/')) u = '/' + path.posix.normalize(path.posix.join(path.posix.dirname('/' + fromP), u)).replace(/^\//, '');
  let form = 'canonical', t;
  if (u.endsWith('/')) t = u.slice(1) + 'index.html';
  else if (/\.[a-z0-9]+$/i.test(u)) {
    t = u.slice(1);
    if (t.endsWith('/index.html') || t === 'index.html') form = 'explicit-index';
  } else { t = u.slice(1) + '/index.html'; form = 'no-trailing-slash'; }
  if (/[A-Z]/.test(u.replace(/\.[A-Za-z0-9]+$/, '').replace(/%[0-9A-F]{2}/g, ''))) form += '+uppercase';
  return { kind: 'internal', target: decodeURIComponent(t), frag, form, raw: u };
}

const edges = []; // {from,to,region,anchor,frag}
const imgs = [];
const idsCache = new Map();
function idsOf(p) {
  if (idsCache.has(p)) return idsCache.get(p);
  const pg = byPath.get(p); const set = new Set();
  if (pg) for (const m of pg.c.matchAll(/\b(?:id|name)\s*=\s*"([^"]+)"/g)) set.add(m[1]);
  idsCache.set(p, set); return set;
}
const generic = /^(click here|here|read more|learn more|more|this page|this article|this guide|link|go|visit)$/i;
const extDomains = new Map();

for (const pg of pages.values()) {
  const { c, p } = pg;
  for (const m of c.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
    const href = attr('<a ' + m[1] + '>', 'href');
    const region = regionAt(pg.regs, m.index);
    const anchor = textOf(m[2]) || (attr(m[2], 'alt') || '') || attr('<a ' + m[1] + '>', 'aria-label') || '';
    const r = resolveHref(p, href);
    if (r.kind === 'internal') {
      edges.push({ from: p, to: r.target, region, anchor, frag: r.frag, form: r.form, raw: r.raw || href });
    } else if (r.kind === 'external') {
      let host = ''; try { host = new URL(r.url, 'https://x').hostname; } catch {}
      extDomains.set(host, (extDomains.get(host) || 0) + 1);
      const tag = '<a ' + m[1] + '>';
      const target = attr(tag, 'target'), relA = (attr(tag, 'rel') || '').toLowerCase();
      if (target === '_blank' && !/noopener|noreferrer/.test(relA)) add('L-EXT-REL', 'P2', p, `external link ${r.url} opens a new tab without rel="noopener"`);
    } else if (r.kind === 'empty') add('L-EMPTY-HREF', 'P1', p, 'anchor without href: ' + (anchor || '(no text)'));
    if (region !== 'shell' && region !== 'data' && anchor && generic.test(anchor)) add('L-GENERIC-ANCHOR', 'P2', p, `generic anchor text "${anchor}" -> ${href}`);
    if (region !== 'shell' && !anchor && !/<img\b/i.test(m[2])) add('L-NO-ANCHOR-TEXT', 'P2', p, `link without text -> ${href}`);
  }
  for (const m of c.matchAll(/<img\b[^>]*>/gi)) {
    const tag = m[0];
    imgs.push({ p, tag, src: attr(tag, 'src'), alt: attr(tag, 'alt'), width: attr(tag, 'width'), height: attr(tag, 'height'), loading: attr(tag, 'loading'), srcset: attr(tag, 'srcset'), sizes: attr(tag, 'sizes'), fetchpriority: attr(tag, 'fetchpriority'), region: regionAt(pg.regs, m.index) });
  }
}

// ---------------------------------------------------------------- link checks
const inlinks = new Map(), outlinks = new Map();
for (const pg of indexable) { inlinks.set(pg.p, []); outlinks.set(pg.p, new Set()); }
const FORM_PRI = { 'no-trailing-slash': 'P2', 'explicit-index': 'P2' };
const reported = new Set();
for (const e of edges) {
  const tgt = byPath.get(e.to);
  const isAsset = !/\.html$/.test(e.to);
  if (isAsset) {
    if (!fs.existsSync(path.join(ROOT, e.to)) && e.region !== 'schema') {
      const k = 'asset|' + e.from + '|' + e.to; if (!reported.has(k)) { reported.add(k); add('L-BROKEN-ASSET-LINK', 'P1', e.from, `link to missing file /${e.to}`); }
    }
    continue;
  }
  if (!tgt) { add('L-BROKEN', 'P0', e.from, `internal link to missing page: ${e.raw} (${e.region}, anchor "${e.anchor}")`); continue; }
  if (e.form !== 'canonical' && e.form !== 'self') {
    const k = 'form|' + e.from + '|' + e.raw; if (!reported.has(k)) { reported.add(k); add('L-NONCANONICAL-FORM', 'P2', e.from, `link uses ${e.form}: ${e.raw}`); }
  }
  if (e.frag && !idsOf(e.to).has(e.frag)) {
    const k = 'frag|' + e.from + '|' + e.to + '#' + e.frag; if (!reported.has(k)) { reported.add(k); add('L-BROKEN-FRAGMENT', 'P1', e.from, `#${e.frag} does not exist on /${e.to.replace(/index\.html$/, '')} (${e.region})`); }
  }
  if (tgt.noindex && e.to !== '404.html' && e.region !== 'shell') add('L-TO-NOINDEX', 'P1', e.from, `links to noindex page /${e.to}`);
  if (e.from !== e.to && inlinks.has(e.to)) { inlinks.get(e.to).push(e); outlinks.get(e.from)?.add(e.to); }
}

// click depth: BFS from home over (a) every link, (b) links outside shell/crumbs, (c) body + hub index only.
function bfs(filter) {
  const depth = new Map([['index.html', 0]]); const q = ['index.html'];
  const adj = new Map();
  for (const e of edges) if (filter(e) && inlinks.has(e.to) && e.from !== e.to) { if (!adj.has(e.from)) adj.set(e.from, new Set()); adj.get(e.from).add(e.to); }
  while (q.length) { const x = q.shift(); for (const y of adj.get(x) || []) if (!depth.has(y)) { depth.set(y, depth.get(x) + 1); q.push(y); } }
  return depth;
}
const dAll = bfs(() => true);
const dNav = bfs(e => e.region !== 'shell' && e.region !== 'crumbs');
const dEdit = bfs(e => e.region === 'body' || e.region === 'hubindex');
for (const pg of indexable) {
  if (pg.p === 'index.html') continue;
  if (!dAll.has(pg.p)) add('L-UNREACHABLE', 'P0', pg.p, 'no path from the homepage through any link');
  else if (!dNav.has(pg.p) && !COMPANY.has(pg.p)) add('L-SHELL-ONLY', 'P1', pg.p, 'reachable only through the header, footer or breadcrumbs');
  else if (!dEdit.has(pg.p) && pg.isArticle) add('L-NO-EDITORIAL-PATH', 'P2', pg.p, 'no path from the homepage through editorial links (body text or hub index)');
  const ed = inlinks.get(pg.p).filter(e => e.region === 'body' || e.region === 'hubindex');
  const distinctSrc = new Set(ed.map(e => e.from));
  if (pg.isArticle && distinctSrc.size === 0) add('L-ORPHAN-EDITORIAL', 'P1', pg.p, 'no body or hub-index link from any other page');
}

// ---------------------------------------------------------------- per-page checks
const titleOwners = new Map(), descOwners = new Map(), h1Owners = new Map(), canonOwners = new Map();
const pageRows = [];
let schemaCount = 0;
for (const pg of indexable) {
  const { p, c } = pg;
  const row = { p };
  const push = (m, k, v) => { if (!m.has(k)) m.set(k, []); m.get(k).push(v); };
  // head
  if (!/<html[^>]*\blang="en/i.test(c)) add('T-LANG', 'P1', p, 'html lang is not en');
  if (!/<meta charset/i.test(c)) add('T-CHARSET', 'P1', p, 'missing meta charset');
  if (!/<meta name="viewport"/i.test(c)) add('T-VIEWPORT', 'P1', p, 'missing viewport meta');
  if (!pg.title) add('T-TITLE-MISSING', 'P0', p, 'missing title'); else {
    push(titleOwners, pg.title, p);
    if (pg.title.length > 65) add('T-TITLE-LEN', 'P2', p, `title ${pg.title.length} chars: ${pg.title}`);
    if (pg.title.length < 20) add('T-TITLE-SHORT', 'P2', p, `title ${pg.title.length} chars: ${pg.title}`);
  }
  if (!pg.desc) add('T-META-MISSING', 'P1', p, 'missing meta description'); else {
    push(descOwners, pg.desc, p);
    if (pg.desc.length > 160) add('T-META-LEN', 'P2', p, `description ${pg.desc.length} chars`);
    if (pg.desc.length < 70) add('T-META-SHORT', 'P2', p, `description ${pg.desc.length} chars`);
  }
  const expected = canonicalFor(p);
  if (!pg.canonical) add('T-CANONICAL-MISSING', 'P0', p, 'missing canonical');
  else if (pg.canonical !== expected) add('T-CANONICAL-MISMATCH', 'P0', p, `canonical ${pg.canonical} expected ${expected}`);
  push(canonOwners, pg.canonical, p);
  if (/github\.io/i.test(c)) add('T-GITHUB-IO', 'P0', p, 'github.io appears in the page');
  // social tags
  const og = k => metaContent(c, 'property', k), tw = k => metaContent(c, 'name', k);
  for (const k of ['og:title', 'og:description', 'og:url', 'og:image', 'og:type', 'og:site_name']) if (!og(k)) add('T-OG-MISSING', 'P1', p, 'missing ' + k);
  for (const k of ['twitter:card', 'twitter:title', 'twitter:description', 'twitter:image']) if (!tw(k)) add('T-TWITTER-MISSING', 'P1', p, 'missing ' + k);
  if (og('og:url') && og('og:url') !== pg.canonical) add('T-OG-URL', 'P1', p, `og:url ${og('og:url')} differs from canonical`);
  if (og('og:title') && decode(og('og:title')) !== pg.title) add('T-OG-TITLE', 'P2', p, 'og:title differs from the title');
  if (og('og:image')) { const rp = resolveHref(p, og('og:image')); if (rp.kind === 'internal' && !fs.existsSync(path.join(ROOT, rp.target))) add('T-OG-IMAGE-MISSING', 'P1', p, 'og:image file missing: ' + og('og:image')); }
  // headings
  if (pg.h1s.length !== 1) add('T-H1-COUNT', 'P1', p, `${pg.h1s.length} h1 elements`);
  else push(h1Owners, norm(pg.h1s[0]), p);
  if (!pg.mainHtml) add('T-MAIN-MISSING', 'P1', p, 'no <main> element');
  const heads = [...pg.mainHtml.replace(SLOT_RE, ' ').matchAll(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi)].map(m => ({ l: +m[1], t: textOf(m[2]) }));
  let prev = 1;
  for (const h of heads) { if (h.l > prev + 1) { add('T-HEADING-SKIP', 'P2', p, `h${prev} followed by h${h.l}: ${h.t}`); } if (!h.t) add('T-HEADING-EMPTY', 'P1', p, `empty h${h.l}`); prev = h.l; }
  const h2s = heads.filter(h => h.l === 2).map(h => norm(h.t));
  const dupH2 = h2s.filter((t, i) => t && h2s.indexOf(t) !== i);
  if (dupH2.length) add('T-H2-DUP', 'P2', p, 'repeated h2: ' + [...new Set(dupH2)].join(' | '));
  if (pg.h1s[0] && pg.title) { const a = tokens(pg.title), b = tokens(pg.h1s[0]); if (jaccardSets(a, b) < 0.25) add('T-TITLE-H1-DIVERGE', 'P2', p, `title "${pg.title}" vs h1 "${pg.h1s[0]}"`); }
  // content
  if (!COMPANY.has(p) && pg.wordCount < 300) add('C-THIN', 'P2', p, `${pg.wordCount} words of prose`);
  // schema
  const blocks = [...c.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/gi)];
  const nodes = [];
  const schemaExcluded = (system.schema?.excludePaths || []).includes(p);
  if (!blocks.length && !schemaExcluded) add('S-MISSING', 'P1', p, 'no JSON-LD');
  for (const b of blocks) {
    try { const o = JSON.parse(b[1]); schemaCount++; nodes.push(...(Array.isArray(o['@graph']) ? o['@graph'] : [o])); }
    catch (e) { add('S-INVALID-JSON', 'P0', p, 'JSON-LD does not parse: ' + e.message); }
  }
  const types = nodes.flatMap(n => [].concat(n['@type'] || []));
  row.types = [...new Set(types)];
  const ids = new Set(nodes.map(n => n['@id']).filter(Boolean));
  const walkRefs = (o, f) => { if (o && typeof o === 'object') { if (Array.isArray(o)) o.forEach(x => walkRefs(x, f)); else { f(o); Object.values(o).forEach(x => walkRefs(x, f)); } } };
  walkRefs(nodes, o => {
    const keys = Object.keys(o);
    if (keys.length === 1 && keys[0] === '@id' && !ids.has(o['@id']) && !String(o['@id']).startsWith('http')) add('S-DANGLING-REF', 'P1', p, 'unresolved @id ' + o['@id']);
    for (const [k, v] of Object.entries(o)) if (typeof v === 'string' && /^https?:\/\//.test(v) && ['url', 'item', '@id', 'mainEntityOfPage', 'sameAs', 'image', 'logo', 'hasMap'].includes(k) && /github\.io/.test(v)) add('S-GITHUB-IO', 'P0', p, 'github.io in schema: ' + v);
  });
  const wp = nodes.find(n => [].concat(n['@type']).some(t => /WebPage|CollectionPage|AboutPage|ContactPage|FAQPage/.test(t)));
  if (!wp && !schemaExcluded) add('S-NO-WEBPAGE', 'P1', p, 'no WebPage-type node');
  else if (wp && wp.url && wp.url !== pg.canonical) add('S-URL-MISMATCH', 'P1', p, `schema url ${wp.url} differs from canonical`);
  const crumbSchema = nodes.find(n => n['@type'] === 'BreadcrumbList');
  if (p !== 'index.html' && !crumbSchema && !schemaExcluded) add('S-BREADCRUMB-MISSING', 'P1', p, 'no BreadcrumbList');
  if (crumbSchema) {
    const li = crumbSchema.itemListElement || [];
    li.forEach((x, i) => { if (x.position !== i + 1) add('S-BREADCRUMB-POSITION', 'P1', p, `position ${x.position} at index ${i}`); });
    const crumbNav = (c.match(/<nav class="crumbs"[\s\S]*?<\/nav>/) || [''])[0];
    const htmlCrumbs = /<ol[\s>]/.test(crumbNav) ? [...crumbNav.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/g)].map(m => textOf(m[1])).filter(Boolean) : crumbNav.split(/&rsaquo;|›/).map(textOf).filter(Boolean);
    if (htmlCrumbs.length && li.length && htmlCrumbs.length !== li.length) add('S-BREADCRUMB-HTML', 'P2', p, `visible crumbs ${htmlCrumbs.length} vs schema ${li.length}`);
    const last = li[li.length - 1];
    if (last && last.item && last.item !== pg.canonical) add('S-BREADCRUMB-LAST', 'P2', p, `last breadcrumb ${last.item} differs from canonical`);
  }
  const art = nodes.find(n => n['@type'] === 'Article');
  if (art) {
    for (const k of ['headline', 'datePublished', 'dateModified', 'author', 'publisher', 'image', 'mainEntityOfPage']) if (!art[k]) add('S-ARTICLE-FIELD', 'P1', p, 'Article missing ' + k);
    if (art.dateModified && art.datePublished && art.dateModified < art.datePublished) add('S-ARTICLE-DATES', 'P1', p, `dateModified ${art.dateModified} before datePublished ${art.datePublished}`);
    if (art.headline && art.headline.length > 110) add('S-ARTICLE-HEADLINE', 'P2', p, `headline ${art.headline.length} chars`);
    row.modified = art.dateModified; row.published = art.datePublished;
  }
  const faq = nodes.find(n => n['@type'] === 'FAQPage');
  if (faq) {
    const visible = norm(textOf(c.replace(/<script\b[\s\S]*?<\/script>/gi, ' ')));
    for (const q of faq.mainEntity || []) {
      const qn = norm(q.name || ''), an = norm(q.acceptedAnswer?.text || '');
      if (!qn || !an) { add('S-FAQ-EMPTY', 'P1', p, 'FAQ question or answer is empty'); continue; }
      if (!visible.includes(qn)) add('S-FAQ-NOT-VISIBLE', 'P1', p, 'FAQ question not visible on the page: ' + q.name);
      else if (!visible.includes(an.slice(0, 60))) add('S-FAQ-ANSWER-MISMATCH', 'P1', p, 'FAQ answer differs from the visible text: ' + q.name);
    }
  }
  const lb = nodes.find(n => [].concat(n['@type']).some(t => /LocalBusiness|Organization/.test(t)) && n.telephone);
  if (lb) {
    if (lb.telephone && !String(lb.telephone).replace(/\D/g, '').endsWith(system.business.phone.replace(/\D/g, '').replace(/^0/, ''))) add('S-NAP-PHONE', 'P0', p, 'schema phone ' + lb.telephone);
    if (lb.address?.streetAddress && !String(lb.address.streetAddress).includes('112 Nguyen Van Cu')) add('S-NAP-ADDRESS', 'P0', p, 'schema address ' + lb.address.streetAddress);
  }
  row.words = pg.wordCount; row.title = pg.title; row.h1 = pg.h1s[0] || '';
  row.inEditorial = new Set(inlinks.get(p).filter(e => e.region === 'body' || e.region === 'hubindex').map(e => e.from)).size;
  row.inAll = new Set(inlinks.get(p).map(e => e.from)).size;
  row.out = outlinks.get(p).size;
  row.depth = dAll.get(p) ?? null; row.depthEditorial = dEdit.get(p) ?? null;
  pageRows.push(row);
}
for (const [k, v] of titleOwners) if (v.length > 1) add('T-TITLE-DUP', 'P1', v[0], `same title on ${v.length} pages: ${k}`, { pages: v });
for (const [k, v] of descOwners) if (v.length > 1) add('T-META-DUP', 'P1', v[0], `same description on ${v.length} pages`, { pages: v });
for (const [k, v] of h1Owners) if (v.length > 1) add('T-H1-DUP', 'P1', v[0], `same h1 on ${v.length} pages: ${k}`, { pages: v });
for (const [k, v] of canonOwners) if (v.length > 1) add('T-CANONICAL-DUP', 'P0', v[0], `same canonical on ${v.length} pages: ${k}`, { pages: v });

// ---------------------------------------------------------------- near-duplicate titles
{
  const items = indexable.filter(x => x.isArticle).map(x => ({ p: x.p, t: tokens(x.title) }));
  let near = 0;
  for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) {
    if (Math.abs(items[i].t.size - items[j].t.size) > 3) continue;
    const s = jaccardSets(items[i].t, items[j].t);
    if (s >= 0.85) { near++; if (near <= 40) add('C-TITLE-NEAR-DUP', 'P2', items[i].p, `title ${(s * 100) | 0}% similar to ${items[j].p}`); }
  }
  if (near > 40) add('C-TITLE-NEAR-DUP-COUNT', 'P2', '(site)', `${near} near-duplicate title pairs (40 listed)`);
}

// ---------------------------------------------------------------- near-duplicate body text
const simPairs = [];
{
  const docs = indexable.filter(x => x.isArticle).map(x => {
    const w = words(x.prose.toLowerCase()); const set = new Set();
    for (let i = 0; i + 5 <= w.length; i++) { let h = 2166136261; const s = w.slice(i, i + 5).join(' '); for (let k = 0; k < s.length; k++) { h ^= s.charCodeAt(k); h = Math.imul(h, 16777619) >>> 0; } set.add(h); }
    return { p: x.p, a: Uint32Array.from([...set]).sort(), n: w.length };
  });
  const inter = (a, b) => { let i = 0, j = 0, n = 0; while (i < a.length && j < b.length) { if (a[i] === b[j]) { n++; i++; j++; } else if (a[i] < b[j]) i++; else j++; } return n; };
  for (let i = 0; i < docs.length; i++) for (let j = i + 1; j < docs.length; j++) {
    const A = docs[i], B = docs[j];
    if (!A.a.length || !B.a.length) continue;
    const mn = Math.min(A.a.length, B.a.length), mx = Math.max(A.a.length, B.a.length);
    if (mn / mx < 0.3) continue;
    const n = inter(A.a, B.a), jac = n / (A.a.length + B.a.length - n);
    if (jac >= 0.3) simPairs.push({ a: A.p, b: B.p, jaccard: +jac.toFixed(3) });
  }
  simPairs.sort((x, y) => y.jaccard - x.jaccard);
  for (const s of simPairs) if (s.jaccard >= 0.5) add('C-BODY-NEAR-DUP', s.jaccard >= 0.7 ? 'P1' : 'P2', s.a, `${(s.jaccard * 100) | 0}% of 5-word phrases shared with ${s.b}`, { with: s.b, jaccard: s.jaccard });
}

// ---------------------------------------------------------------- images
let bigImages = 0;
for (const im of imgs) {
  const pg = byPath.get(im.p); if (!pg || pg.noindex) continue;
  if (im.region === 'shell' && im.alt === '') continue;
  if (im.alt === null) add('I-ALT-MISSING', 'P1', im.p, 'img without alt: ' + im.src);
  else if (im.alt === '' && im.region !== 'shell' && !/\/logo[^/]*\.(png|webp|svg)$/i.test(im.src || '')) add('I-ALT-EMPTY', 'P2', im.p, 'empty alt on a content image: ' + im.src);
  if (im.alt && im.alt.length > 125) add('I-ALT-LONG', 'P2', im.p, `alt ${im.alt.length} chars: ${im.src}`);
  if (!im.width || !im.height) add('I-DIMENSIONS', 'P2', im.p, 'img without width/height (layout shift): ' + im.src);
  const r = im.src ? resolveHref(im.p, im.src) : null;
  if (r && r.kind === 'internal') {
    const fp = path.join(ROOT, r.target);
    if (!fs.existsSync(fp)) add('I-MISSING-FILE', 'P1', im.p, 'image file missing: ' + im.src);
    else {
      const kb = fs.statSync(fp).size / 1024;
      if (kb > 160) { bigImages++; add('I-HEAVY', 'P2', im.p, `${im.src} is ${kb | 0} KB`); }
      if (/\.(png|jpe?g)$/i.test(fp) && kb > 40) add('I-LEGACY-FORMAT', 'P2', im.p, `${im.src} is ${kb | 0} KB and not WebP/AVIF`);
    }
  }
  if (im.width && +im.width >= 600 && !im.srcset) add('I-NO-SRCSET', 'P2', im.p, 'large image without srcset: ' + im.src);
}
const heroes = imgs.filter(i => i.fetchpriority === 'high');
for (const h of heroes) if (h.loading === 'lazy') add('I-LCP-LAZY', 'P1', h.p, 'priority image is lazy-loaded: ' + h.src);

// ---------------------------------------------------------------- sitemap and robots
const sm = fs.existsSync(path.join(ROOT, 'sitemap.xml')) ? fs.readFileSync(path.join(ROOT, 'sitemap.xml'), 'utf8') : '';
const smUrls = [...sm.matchAll(/<url>([\s\S]*?)<\/url>/g)].map(m => ({ loc: (m[1].match(/<loc>(.*?)<\/loc>/) || [])[1], lastmod: (m[1].match(/<lastmod>(.*?)<\/lastmod>/) || [])[1] }));
const smSet = new Map();
const today = new Date().toISOString().slice(0, 10);
for (const u of smUrls) {
  if (smSet.has(u.loc)) add('M-DUP', 'P1', '(sitemap)', 'duplicate loc ' + u.loc);
  smSet.set(u.loc, u);
  if (!u.loc || !u.loc.startsWith(DOMAIN + '/')) { add('M-HOST', 'P0', '(sitemap)', 'loc outside the canonical domain: ' + u.loc); continue; }
  const pp = u.loc.slice(DOMAIN.length + 1); const fp = pp === '' ? 'index.html' : pp.endsWith('/') ? pp + 'index.html' : pp;
  const pg = byPath.get(fp);
  if (!pg) add('M-NO-FILE', 'P0', '(sitemap)', 'sitemap URL has no page: ' + u.loc);
  else if (pg.noindex) add('M-NOINDEX', 'P0', '(sitemap)', 'sitemap lists a noindex page: ' + u.loc);
  else if (pg.canonical !== u.loc) add('M-CANONICAL', 'P0', '(sitemap)', `sitemap ${u.loc} differs from canonical ${pg.canonical}`);
  if (!u.lastmod) add('M-LASTMOD-MISSING', 'P2', '(sitemap)', 'no lastmod: ' + u.loc);
  else if (!/^\d{4}-\d{2}-\d{2}(T[\d:.+-]+Z?)?$/.test(u.lastmod) || isNaN(Date.parse(u.lastmod))) add('M-LASTMOD-FORMAT', 'P1', '(sitemap)', `bad lastmod ${u.lastmod} for ${u.loc}`);
  else if (u.lastmod.slice(0, 10) > today) add('M-LASTMOD-FUTURE', 'P1', '(sitemap)', `future lastmod ${u.lastmod} for ${u.loc}`);
}
for (const pg of indexable) if (!smSet.has(pg.canonical)) add('M-MISSING', 'P0', pg.p, 'indexable page is not in the sitemap');
const lastmods = {};
for (const u of smUrls) if (u.lastmod) lastmods[u.lastmod.slice(0, 10)] = (lastmods[u.lastmod.slice(0, 10)] || 0) + 1;
const robotsTxt = fs.existsSync(path.join(ROOT, 'robots.txt')) ? fs.readFileSync(path.join(ROOT, 'robots.txt'), 'utf8') : '';
if (!/Sitemap:\s*https:\/\/app\.rentbikehanoi\.com\/sitemap\.xml/i.test(robotsTxt)) add('R-SITEMAP', 'P1', 'robots.txt', 'robots.txt does not reference the sitemap');
for (const m of robotsTxt.matchAll(/^Disallow:\s*(\S+)/gim)) if (/^\/(assets|$)/.test(m[1]) || m[1] === '/') add('R-BLOCKS-CONTENT', 'P0', 'robots.txt', 'Disallow ' + m[1] + ' blocks crawlable content or assets');
if (!fs.existsSync(path.join(ROOT, '404.html'))) add('T-404-MISSING', 'P1', '404.html', 'no 404 page');
else { const c = pages.get('404.html').c; if (!/noindex/i.test(c)) add('T-404-INDEXABLE', 'P1', '404.html', '404 page is indexable'); if (/http-equiv="refresh"/i.test(c)) add('T-404-REFRESH', 'P1', '404.html', '404 page redirects with meta refresh'); }

// ---------------------------------------------------------------- output
const order = { P0: 0, P1: 1, P2: 2 };
issues.sort((a, b) => order[a.pri] - order[b.pri] || a.code.localeCompare(b.code) || String(a.page).localeCompare(String(b.page)));
const byCode = {};
for (const i of issues) { const k = i.code; byCode[k] ||= { pri: i.pri, pages: new Set(), count: 0, examples: [] }; byCode[k].count++; byCode[k].pages.add(i.page); if (byCode[k].examples.length < 8) byCode[k].examples.push({ page: i.page, evidence: i.evidence }); }
const codes = Object.entries(byCode).map(([code, v]) => ({ code, pri: v.pri, count: v.count, pages: v.pages.size, examples: v.examples })).sort((a, b) => order[a.pri] - order[b.pri] || b.count - a.count);
const totals = { P0: 0, P1: 0, P2: 0 };
for (const i of issues) totals[i.pri]++;
const depthHist = {}; for (const r of pageRows) { const k = r.depth ?? 'unreachable'; depthHist[k] = (depthHist[k] || 0) + 1; }
const edHist = {}; for (const r of pageRows) { const k = r.depthEditorial ?? 'none'; edHist[k] = (edHist[k] || 0) + 1; }
const summary = {
  generated: new Date().toISOString().slice(0, 10),
  htmlFiles: pages.size, indexablePages: indexable.length, sitemapUrls: smUrls.length, jsonLdBlocks: schemaCount,
  internalLinks: edges.length, images: imgs.length, externalDomains: extDomains.size,
  issueTotals: totals, clickDepthAnyLink: depthHist, clickDepthEditorial: edHist, sitemapLastmodDates: lastmods,
  keyPages: KEY_PAGES.map(k => pageRows.find(r => r.p === k)).filter(Boolean).map(r => ({ p: r.p, words: r.words, inEditorial: r.inEditorial, inAll: r.inAll, out: r.out, depth: r.depth }))
};
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify({ summary, codes, issues: issues.slice(0, 4000), similarPairs: simPairs.slice(0, 300), pages: pageRows }, null, 1) + '\n');

console.log(`SEO crawl: ${indexable.length} indexable pages (${pages.size} html files), ${edges.length} internal links, ${imgs.length} images, ${smUrls.length} sitemap URLs`);
console.log(`Open issues: P0 ${totals.P0} · P1 ${totals.P1} · P2 ${totals.P2}`);
for (const c of codes) console.log(`  ${c.pri} ${c.code.padEnd(24)} ${String(c.count).padStart(5)} on ${String(c.pages).padStart(4)} pages  e.g. ${c.examples[0].page}: ${String(c.examples[0].evidence).slice(0, 110)}`);
console.log('Click depth (any link):', JSON.stringify(depthHist), ' editorial only:', JSON.stringify(edHist));
console.log('Report:', path.relative(ROOT, OUT));
if (CHECK && (totals.P0 || totals.P1)) { console.error('SEO crawl check failed: open P0/P1 issues.'); process.exit(1); }
