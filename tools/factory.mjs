#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT=process.cwd();
const read=p=>fs.readFileSync(path.join(ROOT,p),'utf8');
const write=(p,s)=>{const f=path.join(ROOT,p);fs.mkdirSync(path.dirname(f),{recursive:true});fs.writeFileSync(f,s);};
const cfg=JSON.parse(read('data/factory-config.json'));
const now=()=>new Date().toISOString();
const today=()=>now().slice(0,10);

function parseCSV(text){
  const rows=[];let row=[],field='',q=false;
  for(let i=0;i<text.length;i++){
    const ch=text[i];
    if(q){
      if(ch==='"'&&text[i+1]==='"'){field+='"';i++;}
      else if(ch==='"')q=false;
      else field+=ch;
    }else{
      if(ch==='"')q=true;
      else if(ch===','){row.push(field);field='';}
      else if(ch==='\n'){row.push(field);rows.push(row);row=[];field='';}
      else if(ch!=='\r')field+=ch;
    }
  }
  if(field||row.length){row.push(field);rows.push(row);}
  return rows.filter(r=>r.length&&!(r.length===1&&r[0]===''));
}
const csvCell=v=>'"'+String(v??'').replace(/"/g,'""')+'"';

function loadMatrix(){
  const raw=parseCSV(read(cfg.matrix_path));
  const headers=raw[0]||[];
  const rows=raw.slice(1).map(r=>{const o={};headers.forEach((h,i)=>o[h]=r[i]??'');return o;});
  return {headers,rows};
}
function saveMatrix(m){
  const out=[m.headers.map(csvCell).join(',')];
  for(const r of m.rows)out.push(m.headers.map(h=>csvCell(r[h]??'')).join(','));
  write(cfg.matrix_path,out.join('\n')+'\n');
}
function loadState(){return JSON.parse(read(cfg.state_path));}
function saveState(s){write(cfg.state_path,JSON.stringify(s,null,2)+'\n');}
function isExcluded(r){return cfg.excluded_roles.includes(r.content_role)||r.factory_status==='EXCLUDED';}
function stats(m){
  const rows=m.rows.filter(r=>!isExcluded(r));
  const count=s=>rows.filter(r=>r.factory_status===s).length;
  const published=count('PUBLISHED');
  return {
    target:cfg.target_total_content_pages,
    matrix_content_rows:rows.length,
    published,
    planned:count('PLANNED'),
    writing:count('WRITING'),
    repair:count('REPAIR'),
    blocked:count('BLOCKED'),
    remaining_to_target:Math.max(0,cfg.target_total_content_pages-published),
    unplanned_slots:Math.max(0,cfg.target_total_content_pages-rows.length)
  };
}
function queuePayload(m){
  const s=stats(m),state=loadState();
  const active=m.rows.filter(r=>['WRITING','REPAIR'].includes(r.factory_status)).slice(0,cfg.batch_size);
  let status='READY';
  if(state.blocked)status='BLOCKED';
  else if(!state.enabled)status='PAUSED';
  else if(s.remaining_to_target===0)status='TARGET_REACHED';
  else if(!active.length&&s.planned===0)status='PLAN_EXHAUSTED';
  return {
    schema_version:1,status,generated_at:now(),
    target_total_content_pages:s.target,
    current_published_content_pages:s.published,
    remaining_to_target:s.remaining_to_target,
    unplanned_slots:s.unplanned_slots,
    queue:active.map(r=>({
      id:r.id,url:r.url,path:r.path,silo:r.silo,hub:r.hub,content_role:r.content_role,
      primary_keyword:r.primary_keyword,intent:r.intent,target_min_words:r.target_min_words,
      target_max_words:r.target_max_words,content_brief:r.content_brief,
      internal_link_targets:(r.internal_link_targets||'').split(';').filter(Boolean),
      source_policy:r.source_policy,draft_file:cfg.inbox_dir+'/'+r.id+cfg.draft_extension,
      template:'site/templates/article.html'
    }))
  };
}
function writeQueue(m){const q=queuePayload(m);write(cfg.writer_queue_path,JSON.stringify(q,null,2)+'\n');return q;}
function claimNext(m){
  const active=m.rows.filter(r=>['WRITING','REPAIR'].includes(r.factory_status)).length;
  let slots=Math.max(0,cfg.batch_size-active);
  for(const r of m.rows){
    if(slots<=0)break;
    if(r.factory_status==='PLANNED'&&!isExcluded(r)){r.factory_status='WRITING';slots--;}
  }
}
function refreshQueue(){
  const m=loadMatrix(),state=loadState(),s=stats(m);
  if(state.enabled&&!state.blocked&&s.remaining_to_target>0){claimNext(m);saveMatrix(m);}
  if(s.remaining_to_target===0){state.enabled=false;state.target_reached=true;state.last_run=now();saveState(state);}
  const q=writeQueue(loadMatrix());
  console.log('FACTORY_QUEUE '+JSON.stringify({status:q.status,ids:q.queue.map(x=>x.id),remaining:q.remaining_to_target,unplanned_slots:q.unplanned_slots}));
}

function articleRegion(html){return (html.match(/<article\b[\s\S]*?<\/article>/i)||[])[0]||html;}
function plainText(html){return html.replace(/<script[\s\S]*?<\/script>/gi,' ').replace(/<style[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ').replace(/&[a-zA-Z#0-9]+;/g,' ').replace(/\s+/g,' ').trim();}
function wordCount(html){const t=plainText(articleRegion(html));return t?t.split(/\s+/).filter(Boolean).length:0;}
function internalLinks(html){
  const out=[];
  for(const m of articleRegion(html).matchAll(/href=["']([^"'#]+)["']/gi)){
    let h=m[1].trim();
    if(h.startsWith(cfg.production_domain))h=h.slice(cfg.production_domain.length)||'/';
    if(h.startsWith('/'))out.push(h);
  }
  return [...new Set(out)];
}
function hrefToPath(href){
  const clean=href.split('#')[0].split('?')[0];
  if(clean==='/')return 'index.html';
  const p=clean.replace(/^\//,'');
  return clean.endsWith('/')?p+'index.html':p;
}
function normalizeDraft(html,row){
  html=html.replace(/<html(?:\s+[^>]*)?>/i,'<html lang="en">');
  const canonical='<link rel="canonical" href="'+row.url+'">';
  if(/<link rel="canonical" href="[^"]*">/i.test(html))html=html.replace(/<link rel="canonical" href="[^"]*">/i,canonical);
  else html=html.replace(/<\/head>/i,canonical+'\n</head>');
  if(!html.includes('<!-- SLOT:SCHEMA -->')&&!html.includes('<!-- SLOT:SCHEMA:START -->'))html=html.replace(/<\/head>/i,'<!-- SLOT:SCHEMA -->\n</head>');
  if(!html.includes('<!-- SLOT:HEADER -->')&&!html.includes('<!-- SHARED_NAV_START -->'))html=html.replace(/<body[^>]*>/i,m=>m+'\n<a class="skip-link" href="#main">Skip to content</a>\n<!-- SLOT:HEADER -->');
  if(!html.includes('<!-- SLOT:FOOTER -->')&&!html.includes('<!-- SHARED_FOOTER_START -->'))html=html.replace(/<\/body>/i,'<!-- SLOT:FOOTER -->\n</body>');
  if(!html.includes('<!-- SLOT:RELATED -->')&&!html.includes('<!-- SLOT:RELATED:START -->'))html=html.replace(/<\/article>/i,'<!-- SLOT:RELATED -->\n<!-- SLOT:CTA -->\n</article>');
  if(!/\/assets\/css\/style\.css/.test(html))html=html.replace(/<\/head>/i,'<link rel="stylesheet" href="/assets/css/style.css">\n</head>');
  if(!/\/assets\/js\/business-config\.js/.test(html))html=html.replace(/<\/body>/i,'<script src="/assets/js/business-config.js" defer></script>\n<script src="/assets/js/app.js" defer></script>\n</body>');
  return html;
}
function validateDraft(html,row){
  const errors=[],warnings=[];
  const title=(html.match(/<title>([\s\S]*?)<\/title>/i)||[])[1]||'';
  const desc=(html.match(/<meta name="description" content="([^"]+)"/i)||[])[1]||'';
  const canon=(html.match(/<link rel="canonical" href="([^"]+)"/i)||[])[1]||'';
  const h1=(html.match(/<h1\b/gi)||[]).length;
  if(!row.url||!row.url.startsWith(cfg.production_domain+'/'))errors.push('matrix URL outside production domain');
  if(title.trim().length<10)errors.push('title missing/too short');
  if(desc.trim().length<50)errors.push('meta description missing/too short');
  if(canon!==row.url)errors.push('canonical mismatch');
  if(h1!==1)errors.push('expected exactly one H1, got '+h1);
  if(/thuexemayhanoi\.github\.io|https:\/\/app\.rentbikehanoi\.com\/web\//i.test(html))errors.push('legacy production URL found');
  const wc=wordCount(html);
  const matrixMin=parseInt(row.target_min_words||'0',10)||cfg.first_pass_min_words;
  const min=Math.min(cfg.first_pass_min_words,matrixMin);
  if(wc<min)errors.push('word count '+wc+' below first-pass minimum '+min);
  const links=internalLinks(html);
  if(links.length<cfg.first_pass_min_internal_links)errors.push('internal links '+links.length+' below minimum '+cfg.first_pass_min_internal_links);
  if(links.length>cfg.first_pass_max_internal_links)warnings.push('internal links '+links.length+' above preferred maximum '+cfg.first_pass_max_internal_links);
  const targets=(row.internal_link_targets||'').split(';').filter(Boolean);
  if(targets.length&&!targets.some(t=>links.includes(t)))errors.push('no Matrix target link found');
  for(const href of links){
    const p=hrefToPath(href);
    if(!fs.existsSync(path.join(ROOT,p)))errors.push('broken internal link: '+href);
  }
  return {errors:[...new Set(errors)],warnings:[...new Set(warnings)],word_count:wc};
}
function changedDrafts(before,after){
  let list=[];
  try{
    if(before&&after&&before!=='0000000000000000000000000000000000000000'){
      const out=execFileSync('git',['diff','--name-status',before,after,'--',cfg.inbox_dir],{encoding:'utf8'});
      for(const line of out.split(/\r?\n/)){
        if(!line.trim())continue;
        const parts=line.split('\t'),status=parts[0],p=parts[parts.length-1];
        if((status.startsWith('A')||status.startsWith('M'))&&p.endsWith(cfg.draft_extension))list.push(p);
      }
    }
  }catch{}
  if(!list.length){
    const dir=path.join(ROOT,cfg.inbox_dir);
    if(fs.existsSync(dir))list=fs.readdirSync(dir).filter(n=>n.endsWith(cfg.draft_extension)).map(n=>cfg.inbox_dir+'/'+n);
  }
  return [...new Set(list)].slice(0,cfg.batch_size);
}
function appendSitemap(urls){
  if(!urls.length)return;
  let xml=read('sitemap.xml');
  const existing=new Set([...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m=>m[1]));
  const add=urls.filter(u=>!existing.has(u)).map(u=>'  <url><loc>'+u+'</loc><changefreq>monthly</changefreq><priority>0.6</priority></url>').join('\n');
  if(add)xml=xml.replace(/\s*<\/urlset>\s*$/,'\n'+add+'\n</urlset>\n');
  write('sitemap.xml',xml);
}
function processDrafts(before,after){
  const m=loadMatrix(),state=loadState(),beforeStats=stats(m);
  const report={schema_version:1,started:now(),finished:null,base_commit:after||null,processed:[],published_ids:[],repair_ids:[],blocked_ids:[],fatal:null,stats_before:beforeStats,stats_after:null};
  if(!state.enabled||state.blocked){
    report.fatal=state.blocked?'factory is BLOCKED':'factory is PAUSED';
    report.finished=now();report.stats_after=beforeStats;write(cfg.report_path,JSON.stringify(report,null,2)+'\n');writeQueue(m);return report;
  }
  for(const draftPath of changedDrafts(before,after)){
    const id=path.basename(draftPath,cfg.draft_extension),row=m.rows.find(r=>r.id===id);
    const item={id,draft:draftPath,output:null,status:null,errors:[],warnings:[],word_count:0};
    if(!row){item.status='REJECTED';item.errors.push('ID not found in Matrix');report.processed.push(item);continue;}
    if(isExcluded(row)||!['PLANNED','WRITING','REPAIR'].includes(row.factory_status)){item.status='REJECTED';item.errors.push('Matrix status not writable: '+row.factory_status);report.processed.push(item);continue;}
    const html=normalizeDraft(read(draftPath),row),qa=validateDraft(html,row);
    item.errors=qa.errors;item.warnings=qa.warnings;item.word_count=qa.word_count;item.output=row.path;
    if(qa.errors.length){
      const attempts=(parseInt(row.repair_attempts||'0',10)||0)+1;row.repair_attempts=String(attempts);
      if(attempts>=cfg.max_repair_attempts){row.factory_status='BLOCKED';item.status='BLOCKED';report.blocked_ids.push(id);}
      else{row.factory_status='REPAIR';item.status='REPAIR';report.repair_ids.push(id);}
      report.processed.push(item);continue;
    }
    const outPath=path.join(ROOT,row.path);
    if(fs.existsSync(outPath)){row.factory_status='BLOCKED';item.status='BLOCKED';item.errors.push('refusing to overwrite existing output path');report.blocked_ids.push(id);report.processed.push(item);continue;}
    fs.mkdirSync(path.dirname(outPath),{recursive:true});fs.writeFileSync(outPath,html);fs.unlinkSync(path.join(ROOT,draftPath));
    row.factory_status='PUBLISHED';row.production_status='PUBLISHED';row.repair_attempts='0';row.published_at=today();
    item.status='PUBLISHED';report.published_ids.push(id);report.processed.push(item);state.last_successful_id=id;state.last_error=null;
  }
  if(report.blocked_ids.length&&cfg.stop_on_blocked){state.blocked=true;state.enabled=false;state.last_error='BLOCKED: '+report.blocked_ids.join(',');}
  state.last_run=now();saveMatrix(m);appendSitemap(report.published_ids.map(id=>m.rows.find(r=>r.id===id)?.url).filter(Boolean));
  const afterStats=stats(m);if(afterStats.remaining_to_target===0){state.target_reached=true;state.enabled=false;}saveState(state);
  if(cfg.auto_claim_next&&state.enabled&&!state.blocked){claimNext(m);saveMatrix(m);}
  const finalMatrix=loadMatrix(),q=writeQueue(finalMatrix);
  report.finished=now();report.stats_after=stats(finalMatrix);report.queue_status=q.status;report.next_queue=q.queue.map(x=>x.id);
  write(cfg.report_path,JSON.stringify(report,null,2)+'\n');
  console.log('FACTORY_PROCESS_DONE '+JSON.stringify({published:report.published_ids,repair:report.repair_ids,blocked:report.blocked_ids,next:report.next_queue,remaining:report.stats_after.remaining_to_target,unplanned_slots:report.stats_after.unplanned_slots}));
  return report;
}
function verifyLast(){
  if(!fs.existsSync(path.join(ROOT,cfg.report_path)))return;
  const rep=JSON.parse(read(cfg.report_path)),m=loadMatrix(),errors=[];
  for(const id of rep.published_ids||[]){
    const row=m.rows.find(r=>r.id===id);if(!row){errors.push(id+': Matrix row missing');continue;}
    const p=path.join(ROOT,row.path);if(!fs.existsSync(p)){errors.push(id+': output missing');continue;}
    const html=fs.readFileSync(p,'utf8');
    if((html.match(/<h1\b/gi)||[]).length!==1)errors.push(id+': H1 invalid');
    const canon=(html.match(/<link rel="canonical" href="([^"]+)"/i)||[])[1]||'';if(canon!==row.url)errors.push(id+': canonical invalid');
    if(!html.includes('<!-- SHARED_NAV_START -->')||!html.includes('<!-- SHARED_FOOTER_START -->'))errors.push(id+': shared shell missing');
  }
  if(errors.length){console.error('FACTORY_VERIFY_FAILED\n- '+errors.join('\n- '));process.exit(1);}
  console.log('FACTORY_VERIFY_PASS '+JSON.stringify(rep.published_ids||[]));
}
function setPaused(paused){
  const state=loadState();state.enabled=!paused;if(!paused){state.blocked=false;state.last_error=null;}state.target_reached=false;state.last_run=now();saveState(state);
  if(!paused)refreshQueue();else writeQueue(loadMatrix());
}
function status(){
  const m=loadMatrix(),s=stats(m),state=loadState(),q=queuePayload(m);
  console.log(JSON.stringify({...s,enabled:state.enabled,blocked:state.blocked,target_reached:state.target_reached,last_successful_id:state.last_successful_id,queue_status:q.status,queue_ids:q.queue.map(x=>x.id)},null,2));
}
function publishedCount(){try{const rep=JSON.parse(read(cfg.report_path));console.log(String((rep.published_ids||[]).length));}catch{console.log('0');}}
function assertNotBlocked(){const s=loadState();if(s.blocked){console.error('FACTORY BLOCKED: '+(s.last_error||'manual review required'));process.exit(1);}}

const [,,cmd,...args]=process.argv;
const arg=name=>{const i=args.indexOf(name);return i>=0?args[i+1]:null;};
switch(cmd){
  case 'process':processDrafts(arg('--before'),arg('--after'));break;
  case 'refresh-queue':refreshQueue();break;
  case 'pause':setPaused(true);break;
  case 'resume':setPaused(false);break;
  case 'status':status();break;
  case 'verify-last':verifyLast();break;
  case 'published-count':publishedCount();break;
  case 'assert-not-blocked':assertNotBlocked();break;
  default:console.log('Usage: node tools/factory.mjs <process|refresh-queue|pause|resume|status|verify-last|published-count|assert-not-blocked>');process.exit(cmd?2:0);
}
