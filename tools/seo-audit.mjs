#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const ROOT=process.cwd();
const system=JSON.parse(fs.readFileSync(path.join(ROOT,'data/site-system.json'),'utf8'));
const errors=[],warnings=[],rows=[];
function walk(dir,out=[]){
  for(const e of fs.readdirSync(dir,{withFileTypes:true})){
    if(['.git','node_modules','site'].includes(e.name))continue;
    const full=path.join(dir,e.name);
    if(e.isDirectory())walk(full,out);
    else if(e.isFile()&&e.name.endsWith('.html'))out.push(full);
  }
  return out;
}
function rel(file){return path.relative(ROOT,file).split(path.sep).join('/');}
function canonicalForPath(p){
  if(p==='index.html')return system.domain+'/';
  if(p.endsWith('/index.html'))return system.domain+'/'+p.slice(0,-'index.html'.length);
  return system.domain+'/'+p;
}
function decodeEntities(value){
  const named={amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' ',ndash:'–',mdash:'—',middot:'·',hellip:'…',rsquo:'’',lsquo:'‘',rdquo:'”',ldquo:'“'};
  let out=String(value||'');
  for(let pass=0;pass<3;pass++){
    const next=out
      .replace(/&([a-z]+);/gi,(m,n)=>Object.prototype.hasOwnProperty.call(named,n.toLowerCase())?named[n.toLowerCase()]:m)
      .replace(/&#(\d+);/g,(m,n)=>{try{return String.fromCodePoint(Number(n));}catch{return m;}})
      .replace(/&#x([0-9a-f]+);/gi,(m,n)=>{try{return String.fromCodePoint(parseInt(n,16));}catch{return m;}});
    if(next===out)break;out=next;
  }
  return out;
}
function tag(c,re){return (c.match(re)||[])[1]||'';}
function noindex(c){return /<meta name=["']robots["'] content=["'][^"']*noindex/i.test(c);}
function schemaWebPageUrl(c){
  for(const m of c.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/gi)){
    try{
      const o=JSON.parse(m[1]);
      const graph=Array.isArray(o?.['@graph'])?o['@graph']:[o];
      const wp=graph.find(x=>x&&x['@type']==='WebPage');
      if(wp&&wp.url)return wp.url;
    }catch{}
  }
  return '';
}
const titleOwners=new Map(),descOwners=new Map(),canonicalOwners=new Map();
const files=walk(ROOT).sort();
for(const file of files){
  const p=rel(file),c=fs.readFileSync(file,'utf8');
  if(p==='404.html'||noindex(c))continue;
  const expected=canonicalForPath(p);
  const canonical=tag(c,/<link rel="canonical" href="([^"]*)"/i);
  const title=decodeEntities(tag(c,/<title>([\s\S]*?)<\/title>/i).replace(/<[^>]+>/g,'')).trim();
  const desc=decodeEntities(tag(c,/<meta name="description" content="([^"]*)"/i)).trim();
  const ogUrl=tag(c,/<meta property="og:url" content="([^"]*)"/i);
  const ogTitle=decodeEntities(tag(c,/<meta property="og:title" content="([^"]*)"/i));
  const ogDesc=decodeEntities(tag(c,/<meta property="og:description" content="([^"]*)"/i));
  const twTitle=decodeEntities(tag(c,/<meta name="twitter:title" content="([^"]*)"/i));
  const twDesc=decodeEntities(tag(c,/<meta name="twitter:description" content="([^"]*)"/i));
  const schemaUrl=schemaWebPageUrl(c);
  const pageErrors=[],pageWarnings=[];
  if(canonical!==expected)pageErrors.push('canonical mismatch');
  if(!title)pageErrors.push('missing title');
  if(!desc)pageErrors.push('missing meta description');
  if(title&&(title.length<25||title.length>70))pageWarnings.push('title length '+title.length);
  if(desc&&(desc.length<70||desc.length>180))pageWarnings.push('description length '+desc.length);
  if(ogUrl!==canonical)pageErrors.push('og:url mismatch');
  if(ogTitle!==title)pageErrors.push('og:title mismatch');
  if(ogDesc!==desc)pageErrors.push('og:description mismatch');
  if(twTitle!==title)pageErrors.push('twitter:title mismatch');
  if(twDesc!==desc)pageErrors.push('twitter:description mismatch');
  if(/&amp;(?:rsquo|lsquo|rdquo|ldquo|ndash|mdash|hellip|quot|apos|#39);/i.test(c))pageErrors.push('double-escaped entity');
  if(!system.schema.excludePaths.includes(p)&&schemaUrl&&schemaUrl!==canonical)pageErrors.push('schema WebPage URL mismatch');
  if(title){
    if(titleOwners.has(title))pageErrors.push('duplicate title with '+titleOwners.get(title));
    else titleOwners.set(title,p);
  }
  if(desc){
    if(descOwners.has(desc))pageWarnings.push('duplicate description with '+descOwners.get(desc));
    else descOwners.set(desc,p);
  }
  if(canonical){
    if(canonicalOwners.has(canonical))pageErrors.push('duplicate canonical with '+canonicalOwners.get(canonical));
    else canonicalOwners.set(canonical,p);
  }
  for(const x of pageErrors)errors.push(p+': '+x);
  for(const x of pageWarnings)warnings.push(p+': '+x);
  rows.push({path:p,canonical,title_length:title.length,description_length:desc.length,errors:pageErrors,warnings:pageWarnings});
}
const sitemap=fs.readFileSync(path.join(ROOT,'sitemap.xml'),'utf8');
const sitemapUrls=[...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m=>m[1]);
const sitemapSet=new Set(sitemapUrls);
if(sitemapSet.size!==sitemapUrls.length)errors.push('sitemap: duplicate URL(s)');
const expectedSet=new Set(rows.map(r=>r.canonical));
for(const u of expectedSet)if(!sitemapSet.has(u))errors.push('sitemap: missing '+u);
for(const u of sitemapSet)if(!expectedSet.has(u))errors.push('sitemap: extra '+u);
const report={
  domain:system.domain,
  summary:{
    indexable_pages:rows.length,
    sitemap_urls:sitemapUrls.length,
    errors:errors.length,
    warnings:warnings.length,
    pages_with_errors:rows.filter(r=>r.errors.length).length,
    pages_with_warnings:rows.filter(r=>r.warnings.length).length
  },
  errors,warnings,pages:rows
};
fs.mkdirSync(path.join(ROOT,'reports'),{recursive:true});
fs.writeFileSync(path.join(ROOT,'reports/seo-audit.json'),JSON.stringify(report,null,2)+'\n');
const md=[
  '# SEO Audit',
  '',
  '- Domain: '+system.domain,
  '- Indexable pages: '+report.summary.indexable_pages,
  '- Sitemap URLs: '+report.summary.sitemap_urls,
  '- Errors: '+report.summary.errors,
  '- Warnings: '+report.summary.warnings,
  '- Pages with errors: '+report.summary.pages_with_errors,
  '- Pages with warnings: '+report.summary.pages_with_warnings,
  '',
  '## Errors',
  ...(errors.length?errors.map(x=>'- '+x):['- None']),
  '',
  '## Warnings',
  ...(warnings.length?warnings.map(x=>'- '+x):['- None']),
  ''
].join('\n');
fs.writeFileSync(path.join(ROOT,'reports/seo-audit.md'),md);
console.log('SEO AUDIT: '+rows.length+' pages, '+errors.length+' errors, '+warnings.length+' warnings.');
if(errors.length){
  for(const e of errors.slice(0,50))console.error('- '+e);
  if(errors.length>50)console.error('... '+(errors.length-50)+' more; see reports/seo-audit.md');
  process.exit(1);
}
