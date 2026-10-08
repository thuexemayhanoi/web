#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const ROOT=process.cwd();
const system=JSON.parse(fs.readFileSync(path.join(ROOT,'data/site-system.json'),'utf8'));
const errors=[];
const warnings=[];
const titleOwners=new Map();
const canonicalOwners=new Map();
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
function expectedCanonical(pagePath){
  if(pagePath==='index.html') return system.domain+'/';
  if(pagePath.endsWith('/index.html')) return system.domain+'/'+pagePath.slice(0,-'index.html'.length);
  return system.domain+'/'+pagePath;
}
function decodeEntities(value){
  const named={amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' ',ndash:'–',mdash:'—',middot:'·',hellip:'…',rsquo:'’',lsquo:'‘',rdquo:'”',ldquo:'“'};
  let out=String(value||'');
  for(let pass=0;pass<3;pass++){
    const next=out
      .replace(/&([a-z]+);/gi,(m,n)=>Object.prototype.hasOwnProperty.call(named,n.toLowerCase())?named[n.toLowerCase()]:m)
      .replace(/&#(\d+);/g,(m,n)=>{try{return String.fromCodePoint(Number(n));}catch{return m;}})
      .replace(/&#x([0-9a-f]+);/gi,(m,n)=>{try{return String.fromCodePoint(parseInt(n,16));}catch{return m;}});
    if(next===out)break;
    out=next;
  }
  return out;
}
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
    const expected=expectedCanonical(p);
    if(canon!==expected) errors.push(p+': canonical mismatch; expected '+expected+' got '+(canon||'(missing)'));
    const titleRaw=((c.match(/<title>([\s\S]*?)<\/title>/i)||[])[1]||'').replace(/<[^>]+>/g,'').trim();
    const descRaw=(c.match(/<meta name="description" content="([^"]*)"/i)||[])[1]||'';
    const title=decodeEntities(titleRaw);
    const desc=decodeEntities(descRaw);
    if(!title) errors.push(p+': missing title');
    if(!desc) errors.push(p+': missing meta description');
    if(title && (title.length<25 || title.length>70)) warnings.push(p+': title length '+title.length+' (review 25-70)');
    if(desc && (desc.length<70 || desc.length>180)) warnings.push(p+': meta description length '+desc.length+' (review 70-180)');
    if(title){
      if(titleOwners.has(title)) errors.push(p+': duplicate title with '+titleOwners.get(title));
      else titleOwners.set(title,p);
    }
    if(canon){
      if(canonicalOwners.has(canon)) errors.push(p+': duplicate canonical with '+canonicalOwners.get(canon));
      else canonicalOwners.set(canon,p);
    }
    const h1=(c.match(/<h1\b/gi)||[]).length;
    if(h1!==1) errors.push(p+': expected exactly one H1, got '+h1);
    if(!c.includes('<!-- SHARED_NAV_START -->')||!c.includes('<!-- SHARED_FOOTER_START -->')) errors.push(p+': shared shell markers missing');
    if(/thuexemayhanoi\.github\.io|https:\/\/app\.rentbikehanoi\.com\/web\//i.test(c)) errors.push(p+': legacy production URL found');
    if(system.features&&system.features.autoSocialMeta!==false){
      const ogUrl=(c.match(/<meta property="og:url" content="([^"]+)"/i)||[])[1]||'';
      const ogImg=(c.match(/<meta property="og:image" content="([^"]+)"/i)||[])[1]||'';
      const ogTitle=decodeEntities((c.match(/<meta property="og:title" content="([^"]*)"/i)||[])[1]||'');
      const ogDesc=decodeEntities((c.match(/<meta property="og:description" content="([^"]*)"/i)||[])[1]||'');
      const twTitle=decodeEntities((c.match(/<meta name="twitter:title" content="([^"]*)"/i)||[])[1]||'');
      const twDesc=decodeEntities((c.match(/<meta name="twitter:description" content="([^"]*)"/i)||[])[1]||'');
      if(ogUrl!==canon) errors.push(p+': og:url does not match canonical');
      if(ogImg!==system.brand.logoAbsolute) errors.push(p+': og:image does not match central logo');
      if(ogTitle!==title) errors.push(p+': og:title does not match title');
      if(ogDesc!==desc) errors.push(p+': og:description does not match meta description');
      if(twTitle!==title) errors.push(p+': twitter:title does not match title');
      if(twDesc!==desc) errors.push(p+': twitter:description does not match meta description');
      if(/&amp;(?:rsquo|lsquo|rdquo|ldquo|ndash|mdash|hellip|quot|apos|#39);/i.test(c)) errors.push(p+': double-escaped social/meta entity found');
    }
    if(system.features&&system.features.quickContact!==false && !c.includes('<!-- SHARED_FLOATING_START -->')) errors.push(p+': shared floating component missing');
    if(!c.includes('<!-- SHARED_SCRIPTS_START -->')) errors.push(p+': shared script component missing');
  }
  for(const img of c.matchAll(/<img\b([^>]*)>/gi)){
    if(!/\balt=/.test(img[1])) errors.push(p+': image missing alt attribute');
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
const sitemapUrls=new Set();
for(const m of sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)){
  sitemapUrls.add(m[1]);
  if(!m[1].startsWith(system.domain+'/')) errors.push('sitemap: non-production URL '+m[1]);
}
for(const [p,c] of pages){
  if(p==='404.html' || /<meta name="robots" content="[^"]*noindex/i.test(c)) continue;
  const canon=(c.match(/<link rel="canonical" href="([^"]+)"/i)||[])[1]||'';
  if(canon && !sitemapUrls.has(canon)) errors.push(p+': canonical missing from sitemap');
}
const robots=fs.readFileSync(path.join(ROOT,'robots.txt'),'utf8');
if(!robots.includes('Sitemap: '+system.domain+'/sitemap.xml')) errors.push('robots.txt: sitemap URL mismatch');
const cname=fs.readFileSync(path.join(ROOT,'CNAME'),'utf8').trim();
if(cname!==new URL(system.domain).hostname) errors.push('CNAME does not match configured domain');
const home=pages.get('index.html')||'';
if(!home.includes('"@type":"LocalBusiness"')) errors.push('index.html: LocalBusiness schema missing after build');
const faq=pages.get('faq/index.html')||'';
if(!faq.includes('"@type":"FAQPage"')) errors.push('faq/index.html: FAQPage schema missing after build');

if(warnings.length){
  console.warn('QA WARNINGS ('+warnings.length+')');
  for(const w of warnings) console.warn('- '+w);
}
if(errors.length){
  console.error('QA FAILED ('+errors.length+' issue(s))');
  for(const e of errors) console.error('- '+e);
  process.exit(1);
}
console.log('QA PASS: '+htmlPaths.length+' HTML files, shared components + links + sitemap + canonical + schema/domain checks clean.');
