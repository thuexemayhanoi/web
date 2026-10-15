#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {execSync} from 'node:child_process';

const ROOT=process.cwd();
const CHECK=process.argv.includes('--check');
const system=JSON.parse(fs.readFileSync(path.join(ROOT,'data/site-system.json'),'utf8'));
const INIT_FROM_GIT=process.argv.includes('--init-from-git');
const TODAY=new Date().toISOString().slice(0,10);
// Content dates: "modified" changes only when the editorial text of a page changes
// (generated blocks such as TOC, related cards, author box and schema are ignored).
const datesPath=path.join(ROOT,'data/content-dates.json');
const dates=fs.existsSync(datesPath)?JSON.parse(fs.readFileSync(datesPath,'utf8')):{pages:{}};
const matrixPublished=new Map();
try{
  const csv=fs.readFileSync(path.join(ROOT,'data/content-matrix.csv'),'utf8').split('\n');
  const head=csv[0].split('","').map(x=>x.replace(/"/g,''));
  const pi=head.indexOf('path'),di=head.indexOf('published_at');
  for(const line of csv.slice(1)){const cells=line.split('","').map(x=>x.replace(/^"|"$/g,''));if(cells[pi])matrixPublished.set(cells[pi],cells[di]||'');}
}catch{}
function editorialHash(html){
  let m=(html.match(/<main\b[\s\S]*?(?:<\/main>|<!-- SHARED_FOOTER_START -->)/i)||[''])[0];
  m=m.replace(/<!-- (SLOT|HOOK):([A-Z_]+):START -->[\s\S]*?<!-- \1:\2:END -->/g,' ').replace(/<nav class="crumbs"[\s\S]*?<\/nav>/i,' ');
  const text=m.replace(/<script[\s\S]*?<\/script>/gi,' ').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim();
  return crypto.createHash('sha1').update(text).digest('hex').slice(0,16);
}
let dateDrift=0;
function trackDates(p,html){
  const h=editorialHash(html);
  const cur=dates.pages[p];
  if(CHECK){ if(!cur||cur.hash!==h) dateDrift++; return; }
  if(!cur){
    let modified='';
    if(INIT_FROM_GIT){try{const old=execSync('git show HEAD:'+JSON.stringify(p).slice(1,-1),{cwd:ROOT,encoding:'utf8',stdio:['ignore','pipe','ignore']});if(editorialHash(old)!==h)modified=TODAY;}catch{}}
    dates.pages[p]={published:matrixPublished.get(p)||'',modified,hash:h};
    dateDrift++;
  }else if(cur.hash!==h){
    cur.hash=h; cur.modified=TODAY; dateDrift++;
  }
}

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
function xml(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;');}
function noindex(html){return /<meta name=["']robots["'] content=["'][^"']*noindex/i.test(html);}
function canonicalize(html,p){
  if(p==='404.html')return html;
  const tag='<link rel="canonical" href="'+canonicalForPath(p)+'">';
  if(/<link rel="canonical" href="[^"]*">/i.test(html))return html.replace(/<link rel="canonical" href="[^"]*">/i,tag);
  return html.replace(/<\/head>/i,tag+'\n</head>');
}
function priority(p){
  if(p==='index.html')return ['weekly','1.0'];
  if(p==='privacy-policy.html'||p==='terms-of-use.html')return ['yearly','0.3'];
  if(p.endsWith('/index.html')&&p.split('/').length===2)return ['weekly','0.8'];
  return ['monthly','0.6'];
}

let changed=0;
const indexable=[];
for(const file of walk(ROOT).sort()){
  const p=rel(file);
  const before=fs.readFileSync(file,'utf8');
  const after=canonicalize(before,p);
  if(after!==before){
    changed++;
    if(!CHECK)fs.writeFileSync(file,after,'utf8');
    console.log((CHECK?'would fix: ':'fixed: ')+p+' canonical');
  }
  if(p!=='404.html'&&!noindex(after)){indexable.push(p);trackDates(p,after);}
}
indexable.sort((a,b)=>a==='index.html'?-1:b==='index.html'?1:a.localeCompare(b));
const rows=indexable.map(p=>{
  const [freq,pri]=priority(p);
  const d=dates.pages[p]||{};
  const lastmod=d.modified||d.published||'';
  return '  <url><loc>'+xml(canonicalForPath(p))+'</loc>'+(lastmod?'<lastmod>'+lastmod+'</lastmod>':'')+'<changefreq>'+freq+'</changefreq><priority>'+pri+'</priority></url>';
});
const sitemap='<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'+rows.join('\n')+'\n</urlset>\n';
if(!CHECK) for(const k of Object.keys(dates.pages)) if(!indexable.includes(k)) delete dates.pages[k];
const datesOut=JSON.stringify({_comment:'Maintained by tools/seo-fix.mjs. modified = last date the editorial text changed.',pages:Object.fromEntries(Object.keys(dates.pages).sort().map(k=>[k,dates.pages[k]]))},null,0).replace(/\},"/g,'},\n"')+'\n';
const oldDates=fs.existsSync(datesPath)?fs.readFileSync(datesPath,'utf8'):'';
if(CHECK&&dateDrift) console.warn('content dates out of date for '+dateDrift+' page(s); SEO Maintenance will refresh them (not a failure).');
if(!CHECK&&datesOut!==oldDates){
  if(CHECK) console.warn('content dates out of date for '+dateDrift+' page(s); SEO Maintenance will refresh them (not a failure).');
  else {fs.writeFileSync(datesPath,datesOut,'utf8');console.log('updated: data/content-dates.json ('+dateDrift+' page(s))');}
}
const sitemapPath=path.join(ROOT,'sitemap.xml');
const oldSitemap=fs.existsSync(sitemapPath)?fs.readFileSync(sitemapPath,'utf8'):'';
if(sitemap!==oldSitemap){
  changed++;
  if(!CHECK)fs.writeFileSync(sitemapPath,sitemap,'utf8');
  console.log((CHECK?'would rebuild: ':'rebuilt: ')+'sitemap.xml ('+indexable.length+' URLs)');
}
const robotsPath=path.join(ROOT,'robots.txt');
const wanted='User-agent: *\nAllow: /\n\nSitemap: '+system.domain+'/sitemap.xml\n';
const oldRobots=fs.existsSync(robotsPath)?fs.readFileSync(robotsPath,'utf8'):'';
if(wanted!==oldRobots){
  changed++;
  if(!CHECK)fs.writeFileSync(robotsPath,wanted,'utf8');
  console.log((CHECK?'would normalize: ':'normalized: ')+'robots.txt');
}
if(CHECK&&changed){
  console.error('SEO safe-fix drift: '+changed+' change(s) required.');
  process.exit(1);
}
console.log('SEO safe-fix '+(CHECK?'check clean':'complete')+': '+indexable.length+' indexable URLs.');
