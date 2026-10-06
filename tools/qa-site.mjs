#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const ROOT=process.cwd();
const system=JSON.parse(fs.readFileSync(path.join(ROOT,'data/site-system.json'),'utf8'));
const errors=[];
const files=[];
function walk(dir){
  for(const e of fs.readdirSync(dir,{withFileTypes:true})){
    if(['.git','node_modules','site'].includes(e.name)) continue;
    const full=path.join(dir,e.name);
    if(e.isDirectory()) walk(full); else files.push(path.relative(ROOT,full).split(path.sep).join('/'));
  }
}
walk(ROOT);
const fileSet=new Set(files);
const htmlPaths=files.filter(p=>p.endsWith('.html'));
const pages=new Map(htmlPaths.map(p=>[p,fs.readFileSync(path.join(ROOT,p),'utf8')]));
function resolve(pagePath,raw){
  let href=raw.trim();
  if(!href||/^(mailto:|tel:|javascript:|data:|#)/i.test(href)) return null;
  if(/^https?:\/\//i.test(href)){
    try{const u=new URL(href);if(u.origin!==system.domain)return null;href=u.pathname;}catch{return null;}
  }
  href=href.split('#')[0].split('?')[0];
  const base=pagePath==='index.html'?'':pagePath.replace(/[^/]+$/,'');
  let p=href.startsWith('/')?href.slice(1):base+href;
  const seg=[];
  for(const s of p.split('/')){if(!s||s==='.')continue;if(s==='..')seg.pop();else seg.push(s);}
  p=seg.join('/');
  if(!p)return 'index.html';
  if(href.endsWith('/'))return p+'/index.html';
  if(!/\.[A-Za-z0-9]+$/.test(p)&&fileSet.has(p+'/index.html'))return p+'/index.html';
  return p;
}
for(const [p,c] of pages){
  if(p!=='404.html'){
    const canon=(c.match(/<link rel="canonical" href="([^"]+)"/i)||[])[1]||'';
    if(!canon.startsWith(system.domain+'/')) errors.push(p+': bad or missing canonical');
    const h1=(c.match(/<h1\b/gi)||[]).length;
    if(h1!==1) errors.push(p+': expected exactly one H1, got '+h1);
    if(!c.includes('<!-- SHARED_NAV_START -->')||!c.includes('<!-- SHARED_FOOTER_START -->')) errors.push(p+': shared shell markers missing');
    if(/thuexemayhanoi\.github\.io|https:\/\/app\.rentbikehanoi\.com\/web\//i.test(c)) errors.push(p+': legacy production URL found');
  }
  for(const m of c.matchAll(/(?:href|src)=["']([^"']+)["']/g)){
    const target=resolve(p,m[1]);
    if(target&&!fileSet.has(target)) errors.push(p+': broken internal reference '+m[1]+' -> '+target);
  }
  for(const m of c.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/gi)){
    try{JSON.parse(m[1]);}catch(e){errors.push(p+': invalid JSON-LD: '+e.message);}
  }
}
for(const p of system.schema.excludePaths){
  if(pages.has(p)&&/<script type="application\/ld\+json">/i.test(pages.get(p))) errors.push(p+': schema should remain excluded');
}
for(const [p,list] of Object.entries(system.relatedByPage)){
  if(!pages.has(p)) errors.push('related config references missing page '+p);
  for(const item of list){
    const href=typeof item==='string'?item:item.href;
    if(!system.cards[href]) errors.push(p+': missing card catalog entry '+href);
    const target=resolve(p,href);
    if(target&&!fileSet.has(target)) errors.push(p+': related target missing '+href);
  }
}
if((pages.get('index.html')||'').includes('<iframe')) errors.push('index.html: iframe found; homepage should stay lightweight');
const sitemap=fs.readFileSync(path.join(ROOT,'sitemap.xml'),'utf8');
for(const m of sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)) if(!m[1].startsWith(system.domain+'/')) errors.push('sitemap: non-production URL '+m[1]);
const robots=fs.readFileSync(path.join(ROOT,'robots.txt'),'utf8');
if(!robots.includes('Sitemap: '+system.domain+'/sitemap.xml')) errors.push('robots.txt: sitemap URL mismatch');
const cname=fs.readFileSync(path.join(ROOT,'CNAME'),'utf8').trim();
if(cname!==new URL(system.domain).hostname) errors.push('CNAME does not match configured domain');
const home=pages.get('index.html')||'';
if(!home.includes('"@type":"LocalBusiness"')) errors.push('index.html: LocalBusiness schema missing after build');
const faq=pages.get('faq/index.html')||'';
if(!faq.includes('"@type":"FAQPage"')) errors.push('faq/index.html: FAQPage schema missing after build');

if(errors.length){
  console.error('QA FAILED ('+errors.length+' issue(s))');
  for(const e of errors) console.error('- '+e);
  process.exit(1);
}
console.log('QA PASS: '+htmlPaths.length+' HTML files, no broken internal refs, canonicals/schema/domain checks clean.');
