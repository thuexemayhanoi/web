#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
const root=process.cwd(),read=p=>fs.readFileSync(path.join(root,p),'utf8');
const sys=JSON.parse(read('data/site-system.json'));
const errors=[],indexFile='assets/search/article-index.json';
if(!fs.existsSync(path.join(root,indexFile)))errors.push('Missing article search index');
let indexed=[];
if(fs.existsSync(path.join(root,indexFile))){
  const data=JSON.parse(read(indexFile));indexed=data.e||[];
  if(indexed.length<900)errors.push('Search catalog has only '+indexed.length+' pages');
  const seen=new Set();
  for(const item of indexed){
    if(!item.u||!item.t||!item.d)errors.push('Search item missing fields');
    if(seen.has(item.u))errors.push('Duplicate search URL '+item.u);
    seen.add(item.u);
    const file=item.u==='/'?'index.html':item.u.replace(/^\//,'')+'index.html';
    if(!fs.existsSync(path.join(root,file)))errors.push('Broken search link '+item.u);
  }
}
let posts=0,authors=0,navs=0;
function articleEnd(html,start){
  let depth=0;
  for(const m of html.slice(start).matchAll(/<\/?article\b[^>]*>/gi)){
    if(m[0].startsWith('</')){depth--;if(depth===0)return start+m.index;}
    else depth++;
  }
  return -1;
}
function walk(dir){
  for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
    if(['.git','node_modules','site'].includes(entry.name))continue;
    const full=path.join(dir,entry.name);
    if(entry.isDirectory())walk(full);
    else if(entry.name==='index.html'){
      const rel=path.relative(root,full).split(path.sep).join('/');
      const html=fs.readFileSync(full,'utf8');
      if(!html.includes('class="site-search-trigger"') || !html.includes('id="site-search-panel"'))errors.push(rel+': shared search control missing');
      if(rel.split('/').length!==3)continue;
      const a=html.indexOf('<article class="article">'),e=articleEnd(html,a);
      if(a<0||e<0){errors.push(rel+': article body missing');continue;}
      const body=html.slice(a,e);posts++;
      const author=body.match(/<!-- SLOT:AUTHOR:START -->[\s\S]*?<!-- SLOT:AUTHOR:END -->/g)||[];
      const nav=body.match(/<!-- SLOT:POST_NAV:START -->[\s\S]*?<!-- SLOT:POST_NAV:END -->/g)||[];
      if(sys.features.authorBox!==false){
        if(author.length!==1||!author[0].includes(sys.business.name))errors.push(rel+': publisher box missing or wrong');
        else authors++;
      }
      if(sys.features.postNavigation!==false){
        if(nav.length!==1)errors.push(rel+': adjacent post navigation missing');
        else{
          navs++;
          for(const link of nav[0].matchAll(/href="(\/[^"]+)"/g)){
            const f=link[1].slice(1)+'index.html';
            if(!fs.existsSync(path.join(root,f)))errors.push(rel+': broken neighbor '+link[1]);
            if(link[1].split('/')[1]!==rel.split('/')[0])errors.push(rel+': cross-hub neighbor '+link[1]);
          }
        }
      }
    }
  }
}
walk(root);
if(errors.length){console.error('Discovery QA FAILED ('+errors.length+' errors)');errors.slice(0,30).forEach(x=>console.error('- '+x));process.exit(1);}
console.log('Discovery QA PASS: '+indexed.length+' searchable pages, '+authors+' publisher boxes, '+navs+' neighbor menus in '+posts+' cluster posts.');
