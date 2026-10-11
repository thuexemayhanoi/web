#!/usr/bin/env node
// Regression guard: shared components/hooks must match the only source of truth.
// Safe for large static sites: it reads generated HTML and never writes files.
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const system = JSON.parse(read('data/site-system.json'));
const ctx = {...system, business: {...system.business, website: system.domain + '/'}};
const get = (obj, key) => key.split('.').reduce((v, k) => v == null ? undefined : v[k], obj);
const render = tpl => tpl.replace(/\{\{([A-Za-z0-9_.]+)\}\}/g, (_, key) => {
  const value = get(ctx, key);
  return value == null ? '' : String(value);
});
const features = tpl => tpl.replace(
  /<!-- FEATURE:([A-Za-z0-9_.-]+):START -->([\s\S]*?)<!-- FEATURE:\1:END -->/g,
  (_, key, body) => system.features?.[key] === false ? '' : body.trim()
);
const expected = new Map([
  ['SHARED_NAV', render(read('site/partials/header.html')).trim()],
  ['SHARED_FOOTER', render(read('site/partials/footer.html')).trim()],
  ['SHARED_FLOATING', render(features(read('site/partials/floating-ui.html'))).trim()],
  ['SHARED_SCRIPTS', render(features(read('site/partials/scripts.html'))).trim()]
]);
const hookFile = read('site/hooks.html');
const hookNames = ['AFTER_HEADER', 'BEFORE_FOOTER', 'ARTICLE_BEFORE_RELATED'];
for (const name of hookNames) {
  const exp = hookFile.match(new RegExp('<!-- HOOK:' + name + ':START -->([\\s\\S]*?)<!-- HOOK:' + name + ':END -->'));
  if (!exp) throw new Error('Missing shared hook source: ' + name);
  expected.set('HOOK:' + name, exp[0].trim());
}
for (const [name, markup] of expected) {
  if (/\{\{[A-Za-z0-9_.]+\}\}/.test(markup)) throw new Error('Unresolved placeholder in ' + name);
}
const errors = [];
let count = 0;
function walk(dir) {
  for (const item of fs.readdirSync(dir, {withFileTypes: true})) {
    if (['.git', 'node_modules', 'site'].includes(item.name)) continue;
    const full = path.join(dir, item.name);
    if (item.isDirectory()) walk(full);
    else if (item.isFile() && item.name.endsWith('.html')) {
      const rel = path.relative(root, full).split(path.sep).join('/');
      if (rel === '404.html') continue;
      count++;
      const html = fs.readFileSync(full, 'utf8');
      for (const [name, markup] of expected) {
        if (name === 'HOOK:ARTICLE_BEFORE_RELATED' && !html.includes('<!-- SLOT:RELATED:START -->')) continue;
        const start = '<!-- ' + name + (name.startsWith('HOOK:') ? ':START' : '_START') + ' -->';
        const end = '<!-- ' + name + (name.startsWith('HOOK:') ? ':END' : '_END') + ' -->';
        const a = html.indexOf(start);
        const b = html.indexOf(end);
        if (a < 0 || b < a) { errors.push(rel + ': missing ' + name); continue; }
        if (html.indexOf(start, a + start.length) !== -1) errors.push(rel + ': duplicate ' + name);
        const actual = html.slice(a, b + end.length).trim();
        if (actual !== markup) errors.push(rel + ': out-of-sync ' + name);
      }
    }
  }
}
walk(root);
if (!count) errors.push('No site HTML pages found');
if (errors.length) {
  console.error('Shared component QA FAILED (' + errors.length + ' errors)');
  for (const msg of errors.slice(0, 30)) console.error('- ' + msg);
  if (errors.length > 30) console.error('...and ' + (errors.length - 30) + ' more');
  process.exit(1);
}
console.log('Shared component QA PASS: ' + count + ' pages use central partials, features and hooks.');
