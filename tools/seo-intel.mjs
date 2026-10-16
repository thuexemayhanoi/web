#!/usr/bin/env node
// SEO intelligence (zero-data / cold-start mode).
// Builds keyword clusters, cluster -> owner URL mapping, a topical map and a
// content-gap list from data that actually exists:
//   data/keyword-research.json   keyword metrics + autocomplete (UNKNOWN when absent)
//   data/serp-research.json      public SERP observations (no rankings implied)
//   reports/seo-master-matrix.json  per-URL titles, H1s, primary keywords, hubs
//   the published HTML           to test whether a gap topic is already covered
// Writes reports/seo-intel.json + reports/seo-intel.md. Read-only for pages.
//
//   node tools/seo-intel.mjs          build the reports
//   node tools/seo-intel.mjs --check  validate the research data only (CI-safe):
//                                     fails if a metric has no source, a query has
//                                     an unknown source, or a check pattern is invalid.
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const CHECK = process.argv.includes('--check');
const read = p => fs.readFileSync(path.join(ROOT, p), 'utf8');
const exists = p => fs.existsSync(path.join(ROOT, p));
const kw = JSON.parse(read('data/keyword-research.json'));
const ownersCfg = exists('data/keyword-owners.json') ? JSON.parse(read('data/keyword-owners.json')).owners || {} : {};
const serp = exists('data/serp-research.json') ? JSON.parse(read('data/serp-research.json')) : { queries: [], gap_topics: [], domain_types: {} };

// ---------------------------------------------------------------- validation
const errors = [], warnings = [];
const METRIC_KEYS = /^(volume|volume_global|volume_vn|cpc_usd_global|cpc_usd_vn|seo_difficulty_vn|monthly_global)$/;
for (const [k, v] of Object.entries(kw.keywords || {})) {
  const numeric = Object.entries(v).filter(([m, x]) => METRIC_KEYS.test(m) && x !== 'UNKNOWN');
  if (numeric.length && !(Array.isArray(v.source) && v.source.length)) errors.push(`keyword-research: "${k}" has metrics but no source`);
  for (const s of v.source || []) if (!(kw.sources || {})[s]) errors.push(`keyword-research: "${k}" cites unknown source "${s}"`);
}
const SERP_SOURCES = new Set(['websearch', 'firecrawl']);
const typeOf = new Map();
for (const [t, list] of Object.entries(serp.domain_types || {})) for (const d of list) typeOf.set(d, t);
for (const q of serp.queries || []) {
  if (!SERP_SOURCES.has(q.source)) errors.push(`serp-research: query "${q.query}" has unknown source "${q.source}"`);
  if ('position' in q || 'rank' in q) errors.push(`serp-research: query "${q.query}" stores a ranking; observations must not imply rankings`);
  for (const d of q.results || []) if (!typeOf.has(d)) warnings.push(`serp-research: domain "${d}" (query "${q.query}") has no domain type`);
}
const queryNames = new Set((serp.queries || []).map(q => q.query));
for (const g of serp.gap_topics || []) {
  try { new RegExp(g.check, 'i'); } catch (e) { errors.push(`serp-research: gap topic ${g.id} has invalid check pattern`); }
  for (const s of g.seen_in || []) if (!queryNames.has(s)) errors.push(`serp-research: gap topic ${g.id} cites unrecorded query "${s}"`);
}
if (CHECK) {
  for (const w of warnings) console.log('warning: ' + w);
  for (const e of errors) console.log('error: ' + e);
  if (errors.length) { console.log(`SEO intel data check FAILED: ${errors.length} error(s).`); process.exit(1); }
  console.log(`SEO intel data check clean: ${Object.keys(kw.keywords || {}).length} keywords, ${(serp.queries || []).length} SERP observations, ${(serp.gap_topics || []).length} gap topics.`);
  process.exit(0);
}
if (errors.length) { for (const e of errors) console.log('error: ' + e); process.exit(1); }
if (!exists('reports/seo-master-matrix.json')) { console.log('Run node tools/seo-master-matrix.mjs first.'); process.exit(1); }
const matrix = JSON.parse(read('reports/seo-master-matrix.json'));
const rows = matrix.rows;

// ---------------------------------------------------------------- keyword clusters
const DNT = new Set((kw.do_not_target || []).map(s => s.toLowerCase()));
const phrases = new Map(); // phrase -> {sources}
const addPhrase = (p, src) => { p = p.toLowerCase().trim(); if (!p || DNT.has(p)) return; if (!phrases.has(p)) phrases.set(p, new Set()); phrases.get(p).add(src); };
for (const k of Object.keys(kw.keywords || {})) addPhrase(k, 'keyword');
for (const [seed, list] of Object.entries(kw.autocomplete_groups || {})) { addPhrase(seed, 'keyword'); for (const p of list) addPhrase(p, 'autocomplete'); }

const MODS = [
  ['price', /\b(price|prices|cost|costs|cheap|cheapest|how much)\b/],
  ['50cc', /\b50cc\b/],
  ['electric', /\belectric\b/],
  ['monthly', /\b(monthly|month|long term)\b/],
  ['weekly', /\bweekly\b/],
  ['daily', /\bdaily\b/],
  ['old-quarter', /\bold quarter\b/],
  ['license', /\b(license|licence)\b/],
  ['how-to', /\b(how to|where to|can i|can a|do you need)\b/],
  ['scooter', /\b(scooter|moped)\b/],
  ['sales', /\b(sale|sales|buy|buying)\b/]
];
const geoOf = p => /\bvietnam\b/.test(p) ? 'vietnam' : /\bhanoi\b/.test(p) ? 'hanoi' : 'generic';
function signature(p) {
  let mods = MODS.filter(([, rx]) => rx.test(p)).map(([m]) => m);
  // a vehicle word is only its own cluster when nothing more specific is asked
  if (mods.length > 1) mods = mods.filter(m => m !== 'scooter');
  // "how much does it cost" is a price question, not a how-to
  if (mods.includes('price')) mods = mods.filter(m => m !== 'how-to');
  return { geo: geoOf(p), mods: mods.sort() };
}
const INTENT = { price: 'Commercial investigation (price)', '50cc': 'Commercial (50cc rental)', electric: 'Commercial (electric rental)', monthly: 'Commercial (long stay)', weekly: 'Commercial (weekly)', daily: 'Commercial (daily)', 'old-quarter': 'Local commercial', license: 'Informational (legal)', 'how-to': 'Informational (how to rent)', scooter: 'Commercial (scooter rental)', sales: 'Informational (buy vs rent)' };
const clusters = new Map();
for (const [p, srcs] of phrases) {
  const s = signature(p);
  const key = s.geo + ':' + (s.mods.join('+') || 'head');
  if (!clusters.has(key)) clusters.set(key, { key, geo: s.geo, mods: s.mods, phrases: [] });
  const m = (kw.keywords || {})[p] || {};
  const vol = typeof m.volume_global === 'number' ? m.volume_global : typeof m.volume_vn === 'number' ? m.volume_vn : null;
  clusters.get(key).phrases.push({ phrase: p, volume: vol, volume_field: typeof m.volume_global === 'number' ? 'global' : typeof m.volume_vn === 'number' ? 'vn' : 'UNKNOWN', from: [...srcs].sort() });
}
const STOP = new Set(['a', 'an', 'the', 'in', 'of', 'for', 'and', 'or', 'is', 'it', 'does', 'i', 'best', 'my', 'on', 'at', 'by']);
const SYN = { hire: 'rental', rent: 'rental', renting: 'rental', rentals: 'rental', moped: 'scooter', bike: 'motorbike', motorcycle: 'motorbike', licence: 'license', cost: 'price', costs: 'price', prices: 'price', cheap: 'price', cheapest: 'price', month: 'monthly', scooters: 'scooter', motorbikes: 'motorbike' };
const toks = s => (s.toLowerCase().match(/[a-z0-9]+/g) || []).map(t => SYN[t] || t).filter(t => !STOP.has(t));
const tset = s => new Set(toks(s));
function jac(a, b) { let i = 0; for (const x of a) if (b.has(x)) i++; return a.size + b.size - i ? i / (a.size + b.size - i) : 0; }

// owner = page whose primary keyword / title / H1 best matches the cluster's lead phrase;
// hubs and the homepage win ties because they are built to own head terms.
const ROLE_BONUS = { 'homepage / service page': 0.06, 'service hub': 0.05, 'guide hub': 0.05, 'FAQ / answer hub': 0.02, article: 0 };
const headingsOf = p => { try { return [...read(p).matchAll(/<h[23]\b[^>]*>([\s\S]*?)<\/h[23]>/gi)].map(m => m[1].replace(/<[^>]+>/g, ' ').replace(/&[a-z#0-9]+;/gi, ' ')).filter(t => /\?\s*$/.test(t.trim())); } catch { return []; } };
// question headings (H2/H3 ending in "?") count as an answer to that query on the page
const pagesIdx = rows.filter(r => r.page_type !== '404' && !/legal/.test(r.page_role)).map(r => ({ r, pk: tset(r.primary_keyword || ''), ti: tset((r.title || '') + ' ' + (r.h1 || '')), qs: headingsOf(r.path).map(tset) }));
for (const c of clusters.values()) {
  c.phrases.sort((a, b) => (b.volume ?? -1) - (a.volume ?? -1) || a.phrase.length - b.phrase.length);
  c.lead = c.phrases[0].phrase;
  c.known_volume_phrases = c.phrases.filter(p => p.volume !== null).length;
  c.intent = c.mods.length ? c.mods.map(m => INTENT[m]).join(' + ') : (c.geo === 'vietnam' ? 'Informational / commercial (country)' : 'Commercial (head term)');
  // for 50cc / electric / price ... clusters the vehicle word does not change the intent
  const fold = c.mods.some(m => m !== 'scooter') ? (set => new Set([...set].map(t => t === 'scooter' ? 'motorbike' : t))) : (set => set);
  const lt = fold(tset(c.lead));
  const scored = pagesIdx.map(x => ({ url: x.r.url, role: x.r.page_role, hub: x.r.hub, score: Math.max(jac(lt, fold(x.pk)), 0.8 * jac(lt, fold(x.ti)), ...x.qs.map(q => 0.9 * jac(lt, fold(q)))) + (ROLE_BONUS[x.r.page_role] || 0) })).sort((a, b) => b.score - a.score);
  const [o1, o2] = scored;
  c.owner = o1 && o1.score >= 0.5 ? { url: o1.url, role: o1.role, hub: o1.hub, score: +o1.score.toFixed(2) } : null;
  c.runner_up = o2 ? { url: o2.url, score: +o2.score.toFixed(2) } : null;
  const assigned = ownersCfg[c.key];
  if (assigned) {
    const row = rows.find(r => r.url.replace(/^https?:\/\/[^/]+/, '') === assigned.url);
    if (!row) errors.push(`keyword-owners: ${c.key} points to unknown URL ${assigned.url}`);
    else { const hit = scored.find(x => x.url === row.url); c.owner = { url: row.url, role: row.page_role, hub: row.hub, score: hit ? +hit.score.toFixed(2) : 0, assigned: assigned.reason }; c.runner_up = null; c.status = 'OWNED (assigned)'; c.action = 'Assigned owner: ' + assigned.reason + ' Point supporting pages to it with descriptive anchors.'; continue; }
  }
  c.status = !c.owner ? 'GAP - no page targets this cluster' : (o2 && o1.score - o2.score < 0.05 && o2.score >= 0.5 ? 'CHECK - two pages compete' : 'OWNED');
  c.action = !c.owner
    ? 'Answer this query inside the closest existing page (a short section with a direct answer); do not create a near-duplicate page.'
    : c.status.startsWith('CHECK') ? `Keep ${c.owner.url} as the owner: make its title/H1 the closest match and link to it from ${c.runner_up.url} with a descriptive anchor.`
      : 'Owner is clear: keep the title/H1 aligned and point contextual links to it.';
}
if (errors.length) { for (const e of errors) console.log('error: ' + e); process.exit(1); }
const clusterList = [...clusters.values()].sort((a, b) => (b.phrases[0].volume ?? -1) - (a.phrases[0].volume ?? -1) || b.phrases.length - a.phrases.length);

// ---------------------------------------------------------------- content gaps
function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['.git', 'node_modules', 'site', 'reports', 'data', 'tools', 'assets', 'factory', '_factory'].includes(e.name)) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, out); else if (e.name.endsWith('.html')) out.push(path.relative(ROOT, full).split(path.sep).join('/'));
  }
  return out;
}
const bodyText = new Map();
for (const p of walk(ROOT)) {
  if (p === '404.html') continue;
  let h = read(p);
  const a = h.indexOf('<main'); let b = h.length;
  for (const mk of ['<!-- SLOT:AUTHOR:START', '<!-- HOOK:ARTICLE_BEFORE_RELATED:START', '<!-- SLOT:RELATED:START', '<!-- SHARED_FOOTER_START']) { const i = h.indexOf(mk, a); if (i > 0) { b = i; break; } }
  h = h.slice(Math.max(0, a), b).replace(/<!-- SLOT:([A-Z_]+):START -->[\s\S]*?<!-- SLOT:\1:END -->/g, ' ');
  bodyText.set(p, h.replace(/<[^>]+>/g, ' ').replace(/&[a-z#0-9]+;/gi, ' ').replace(/\s+/g, ' ').toLowerCase());
}
const urlOf = p => (matrix.rows.find(r => r.path === p) || {}).url || p;
const gaps = (serp.gap_topics || []).map(g => {
  const rx = new RegExp(g.check, 'i');
  const hits = [...bodyText].filter(([, t]) => rx.test(t)).map(([p]) => p);
  const inOwnerDir = hits.filter(p => p.startsWith(g.owner_hint));
  const ownerHub = g.owner_hint + 'index.html';
  const status = hits.length === 0 ? 'GAP' : bodyText.has(ownerHub) && rx.test(bodyText.get(ownerHub)) ? 'COVERED' : inOwnerDir.length ? 'COVERED (articles, not hub)' : 'PARTIAL (outside its hub)';
  return { id: g.id, topic: g.topic, seen_in: g.seen_in, status, pages_mentioning: hits.length, in_owner_hub_dir: inOwnerDir.length, owner_hub: urlOf(ownerHub), examples: hits.slice(0, 3).map(urlOf),
    action: status === 'GAP' ? `Add a short, sourced section to ${urlOf(ownerHub)} or its most relevant article (no new page).` : status.startsWith('PARTIAL') ? `Add a one-paragraph answer with a link to the detailed page on ${urlOf(ownerHub)}.` : status.startsWith('COVERED (') ? `Summarise in one sentence on ${urlOf(ownerHub)} and link to the article that covers it.` : 'Covered; keep facts current.' };
});

// ---------------------------------------------------------------- topical map
const hubs = new Map();
for (const r of rows) {
  if (!r.hub_url && r.page_role !== 'service hub' && r.page_role !== 'guide hub') continue;
  const hubUrl = r.hub_url || r.url;
  if (!hubs.has(hubUrl)) hubs.set(hubUrl, { hub: r.hub, url: hubUrl, articles: 0, families: new Map(), clusters: [] });
  const h = hubs.get(hubUrl);
  if (r.page_type === 'article') { h.articles++; const f = r.similarity && r.similarity.family; const k = f ? f.family.split('/')[1] : '(standalone guides)'; h.families.set(k, (h.families.get(k) || 0) + 1); }
}
for (const c of clusterList) if (c.owner) { const hubUrl = (rows.find(r => r.url === c.owner.url) || {}).hub_url || c.owner.url; if (hubs.has(hubUrl)) hubs.get(hubUrl).clusters.push(c.lead); }
const topical = [...hubs.values()].map(h => ({ hub: h.hub, url: h.url, articles: h.articles, series: [...h.families].sort((a, b) => b[1] - a[1]).map(([k, n]) => ({ series: k, pages: n })), keyword_clusters: h.clusters }));

// ---------------------------------------------------------------- SERP landscape
const typeCount = {}; let totalResults = 0;
for (const q of serp.queries || []) for (const d of q.results || []) { const t = typeOf.get(d) || 'unclassified'; typeCount[t] = (typeCount[t] || 0) + 1; totalResults++; }
const landscape = (serp.queries || []).map(q => { const c = {}; for (const d of q.results) { const t = typeOf.get(d) || 'unclassified'; c[t] = (c[t] || 0) + 1; } return { query: q.query, source: q.source, intent: q.intent, result_types: c, topics_seen: q.topics_seen }; });

// ---------------------------------------------------------------- output
const TODAY = new Date().toISOString().slice(0, 10);
const out = {
  generated_at: TODAY, mode: 'ZERO-DATA / COLD START',
  data_sources: { keywords: kw.sources, serp: serp.notes, gsc: 'NOT CONNECTED - clicks, impressions, rankings UNKNOWN' },
  summary: { phrases: phrases.size, clusters: clusterList.length, owned: clusterList.filter(c => c.status.startsWith('OWNED')).length, check: clusterList.filter(c => c.status.startsWith('CHECK')).length, gap_clusters: clusterList.filter(c => c.status.startsWith('GAP')).length, serp_queries: (serp.queries || []).length, serp_result_types: typeCount, gap_topics: gaps.length, gap_topics_open: gaps.filter(g => g.status !== 'COVERED').length },
  clusters: clusterList.map(c => ({ key: c.key, lead: c.lead, intent: c.intent, status: c.status, owner: c.owner, runner_up: c.runner_up, action: c.action, phrases: c.phrases })),
  content_gaps: gaps, topical_map: topical, serp_landscape: landscape, warnings
};
fs.writeFileSync(path.join(ROOT, 'reports/seo-intel.json'), JSON.stringify(out, null, 1) + '\n');

const esc = s => String(s ?? '').replace(/\|/g, '\\|');
const rel = u => u ? u.replace(/^https?:\/\/[^/]+/, '') || '/' : '-';
const md = ['---', 'published: false', '---', '', '# SEO intelligence - zero-data mode', '',
  `Generated ${TODAY} by \`node tools/seo-intel.mjs\`. Search Console and analytics are not connected, so clicks, impressions and rankings are UNKNOWN. Volumes come only from \`data/keyword-research.json\` (Ubersuggest, 2026-10-14); SERP observations from \`data/serp-research.json\` show which pages a search tool returned, not Google positions.`, '',
  '## Summary', '',
  `- ${phrases.size} search phrases (keywords + autocomplete, do-not-target excluded) in ${clusterList.length} intent clusters: ${out.summary.owned} owned, ${out.summary.check} with two competing pages, ${out.summary.gap_clusters} without a dedicated page.`,
  `- ${out.summary.serp_queries} SERP observations, ${totalResults} results: ` + Object.entries(typeCount).sort((a, b) => b[1] - a[1]).map(([t, n]) => `${t} ${n}`).join(', ') + '.',
  `- ${gaps.length} questions seen answered on competing pages; ${out.summary.gap_topics_open} are not yet answered on the hub that should own them.`, '',
  '## Keyword clusters and owner URLs', '', '| Cluster | Lead phrase | Known volume | Intent | Owner URL | Status | Action |', '|---|---|---|---|---|---|---|'];
for (const c of clusterList) md.push('| ' + [c.key, c.lead, c.phrases[0].volume === null ? 'UNKNOWN' : `${c.phrases[0].volume}/mo (${c.phrases[0].volume_field})`, c.intent, rel(c.owner && c.owner.url), c.status, c.action].map(esc).join(' | ') + ' |');
md.push('', '## Content gaps (questions competitors answer)', '', '| Topic | Seen in queries | Status | Pages mentioning | Owner hub | Action |', '|---|---|---|---|---|---|');
for (const g of gaps) md.push('| ' + [g.topic, g.seen_in.length, g.status, g.pages_mentioning, rel(g.owner_hub), g.action].map(esc).join(' | ') + ' |');
md.push('', '## Topical map', '');
for (const t of topical) { md.push(`### ${t.hub} (${rel(t.url)}) - ${t.articles} articles`, '', 'Series: ' + t.series.map(s => `${s.series} (${s.pages})`).join(', ') + '.', '', 'Keyword clusters owned here: ' + (t.keyword_clusters.length ? t.keyword_clusters.join('; ') : 'none mapped') + '.', ''); }
md.push('## SERP landscape (observed result types per query)', '', '| Query | Source | Intent | Result types | Topics seen |', '|---|---|---|---|---|');
for (const l of landscape) md.push('| ' + [l.query, l.source, l.intent, Object.entries(l.result_types).map(([t, n]) => `${t} ${n}`).join(', '), l.topics_seen.join('; ')].map(esc).join(' | ') + ' |');
md.push('', '## Reading the SERP', '',
  '- Head terms return thin, auto-generated "parasite" pages and rental-operator pages, which suggests the query space is under-served by original, specific content.',
  '- Legal and how-to queries are answered by forums and travel publishers; clear, sourced answers (licence classes, IDP type, insurance) are the opening for a local shop.',
  '- Electric-scooter queries return almost nothing electric-specific: a direct, honest answer on the existing electric page is the cheapest win.',
  '- Switch to DATA-DRIVEN mode once Search Console is connected: replace these observations with real queries, impressions and positions.', '');
fs.writeFileSync(path.join(ROOT, 'reports/seo-intel.md'), md.join('\n'));
console.log(`SEO intel: ${phrases.size} phrases, ${clusterList.length} clusters (${out.summary.owned} owned, ${out.summary.check} check, ${out.summary.gap_clusters} gap); ${gaps.length} gap topics (${out.summary.gap_topics_open} open); ${warnings.length} warning(s).`);
