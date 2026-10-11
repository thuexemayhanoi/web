#!/usr/bin/env node
// Compact, deterministic search catalog of published pages; no third-party service.
import fs from 'node:fs';
import path from 'node:path';
const root=process.cwd();
const config=JSON.parse(fs.readFileSync(path.join(root,'data/site-system.json'),'utf8'));
function parseCSV(data){
  const rows=[];let fields=[],value='',quoted=false;
  for(let i=0;i<data.length;i++){
    const c=data[i];
    if(quoted){
      if(c==='"'&&data[i+1]==='"'){value+='"';i++;}
      else if(c==='"')quoted=false;
      else value+=c;
    }else if(c==='"')quoted=true;
    else if(c===','){fields.push(value);value='';}
    else if(c==='\n'){fields.push(value);rows.push(fields);fields=[];value='';}
    else if(c!=='\r')value+=c;
  }
  if(value||fields.length){fields.push(value);rows.push(fields);}
  return rows;
}
const data=parseCSV(fs.readFileSync(path.join(root,'data/content-matrix.csv'),'utf8'));
const cols=data.shift();
const decode=s=>String(s||'').replace(/<[^>]+>/g,' ').replace(/&amp;/g,'&')
  .replace(/&quot;/g,'"').replace(/&#39;|&apos;/g,"'").replace(/&(?:ndash|mdash);/g,'–')
  .replace(/\s+/g,' ').trim();
const entries=[],seen=new Set();
for(const fields of data){
  const row=Object.fromEntries(cols.map((k,i)=>[k,fields[i]||'']));
  if(row.factory_status!=='PUBLISHED'||!row.path||config.schema.excludePaths.includes(row.path)||row.path==='faq/index.html')continue;
  const file=path.join(root,row.path);
  if(!fs.existsSync(file))throw Error('Published search page missing: '+row.path);
  const page=fs.readFileSync(file,'utf8');
  if(/<meta name=["']robots["'] content=["'][^"']*noindex/i.test(page))continue;
  const title=decode((page.match(/<title>([\s\S]*?)<\/title>/i)||[])[1]);
  const description=decode((page.match(/<meta name="description" content="([^"]*)"/i)||[])[1]);
  const main=page.split('<!-- SLOT:AUTHOR:START -->')[0].split('<!-- HOOK:ARTICLE_BEFORE_RELATED:START -->')[0];
  const heads=[...main.matchAll(/<h[23]\b[^>]*>([\s\S]*?)<\/h[23]>/gi)]
    .map(m=>decode(m[1])).filter(Boolean).slice(0,18).join(' ').slice(0,1000);
  const url=row.path==='index.html'?'/':row.path.endsWith('/index.html')?'/'+row.path.slice(0,-10):'/'+row.path;
  if(!title||!description||seen.has(url))throw Error('Invalid search page: '+row.path);
  seen.add(url);
  entries.push({u:url,t:title,d:description,k:row.primary_keyword||'',h:heads});
}
if(entries.length<900)throw Error('Unexpectedly small search catalog: '+entries.length);
const out=path.join(root,'assets/search/article-index.json');
fs.mkdirSync(path.dirname(out),{recursive:true});
const payload=JSON.stringify({version:1,site:config.domain,e:entries})+'\n';
if(!fs.existsSync(out)||fs.readFileSync(out,'utf8')!==payload)fs.writeFileSync(out,payload);
console.log('Article search index: '+entries.length+' published URLs.');
