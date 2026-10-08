#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const ROOT=process.cwd();
const CHECK=process.argv.includes('--check');
const system=JSON.parse(fs.readFileSync(path.join(ROOT,'data/site-system.json'),'utf8'));

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
  if(p!=='404.html'&&!noindex(after))indexable.push(p);
}
indexable.sort((a,b)=>a==='index.html'?-1:b==='index.html'?1:a.localeCompare(b));
const rows=indexable.map(p=>{
  const [freq,pri]=priority(p);
  return '  <url><loc>'+xml(canonicalForPath(p))+'</loc><changefreq>'+freq+'</changefreq><priority>'+pri+'</priority></url>';
});
const sitemap='<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'+rows.join('\n')+'\n</urlset>\n';
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
