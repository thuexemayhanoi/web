#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const ROOT=process.cwd();
const CHECK=process.argv.includes('--check');
const read=(p)=>fs.readFileSync(path.join(ROOT,p),'utf8');
const system=JSON.parse(read('data/site-system.json'));
const headerTpl=read('site/partials/header.html');
const footerTpl=read('site/partials/footer.html');
const ctaTpl=read('site/partials/article-cta.html');
const cardTpl=read('site/partials/related-card.html');
const hooksSource=read('site/hooks.html');

function get(obj,key){
  return key.split('.').reduce((v,k)=>v==null?undefined:v[k],obj);
}
function render(tpl,data){
  return tpl.replace(/\{\{([A-Za-z0-9_.]+)\}\}/g,(_,k)=>{
    const v=get(data,k);
    return v==null?'':String(v);
  });
}
const ctx={...system,business:{...system.business,website:system.domain+'/'}};
const header=render(headerTpl,ctx);
const footer=render(footerTpl,ctx);
const cta=render(ctaTpl,ctx);

function parseHook(name){
  const re=new RegExp('<!-- HOOK:'+name+':START -->([\\s\\S]*?)<!-- HOOK:'+name+':END -->');
  const m=hooksSource.match(re);
  return m?m[1].trim():'';
}
const hookAfterHeader=parseHook('AFTER_HEADER');
const hookArticle=parseHook('ARTICLE_BEFORE_RELATED');
const hookBeforeFooter=parseHook('BEFORE_FOOTER');

function hookBlock(name,content){
  return '<!-- HOOK:'+name+':START -->\n'+(content?content+'\n':'')+'<!-- HOOK:'+name+':END -->';
}
function walk(dir,out=[]){
  for(const e of fs.readdirSync(dir,{withFileTypes:true})){
    if(['.git','node_modules','site'].includes(e.name)) continue;
    const full=path.join(dir,e.name);
    if(e.isDirectory()) walk(full,out);
    else if(e.isFile()&&e.name.endsWith('.html')) out.push(full);
  }
  return out;
}
function rel(file){return path.relative(ROOT,file).split(path.sep).join('/');}
function absUrl(href){
  if(/^https?:\/\//i.test(href)) return href;
  return system.domain+(href.startsWith('/')?href:'/'+href);
}
function decode(s){
  const map={'&amp;':'&','&ndash;':'–','&mdash;':'—','&middot;':'·','&hellip;':'…','&quot;':'"','&#39;':"'",'&apos;':"'"};
  return s.replace(/&(amp|ndash|mdash|middot|hellip|quot|#39|apos);/g,m=>map[m]||m);
}
function textOnly(s){
  return decode(s.replace(/<script[\s\S]*?<\/script>/gi,' ').replace(/<style[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim());
}
function titleOf(html){return textOnly((html.match(/<title>([\s\S]*?)<\/title>/i)||[])[1]||'');}
function descOf(html){return decode((html.match(/<meta name="description" content="([^"]*)"/i)||[])[1]||'');}
function canonicalOf(html){return (html.match(/<link rel="canonical" href="([^"]*)"/i)||[])[1]||'';}
function breadcrumbItems(html,canonical){
  const nav=(html.match(/<nav class="crumbs"[\s\S]*?<\/nav>/i)||[])[0]||'';
  const items=[];
  for(const m of nav.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)){
    const part=m[1];
    const a=part.match(/<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
    const name=textOnly(a?a[2]:part);
    if(!name) continue;
    items.push({'@type':'ListItem',position:items.length+1,name,item:a?absUrl(a[1]):canonical});
  }
  return items;
}
function faqItems(html){
  const out=[];
  for(const m of html.matchAll(/<article class="faq-entry">([\s\S]*?)<\/article>/gi)){
    const q=textOnly((m[1].match(/<h2[^>]*>([\s\S]*?)<\/h2>/i)||[])[1]||'');
    const ans=[...m[1].matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)].map(x=>textOnly(x[1])).filter(Boolean).join(' ');
    if(q&&ans) out.push({'@type':'Question',name:q,acceptedAnswer:{'@type':'Answer',text:ans}});
  }
  return out;
}
function schemaFor(html,pagePath){
  if(system.schema.excludePaths.includes(pagePath)) return null;
  const canonical=canonicalOf(html);
  if(!canonical) return null;
  const title=titleOf(html);
  const description=descOf(html);
  const graph=[];
  if(pagePath==='index.html'){
    graph.push({'@type':'WebSite','@id':system.domain+'/#website',url:system.domain+'/',name:'Hanoi Motorbike Rental',alternateName:system.business.name,inLanguage:system.language,image:system.brand.logoAbsolute,publisher:{'@id':system.domain+'/#business'}});
    graph.push({'@type':'WebPage','@id':system.domain+'/#webpage',url:canonical,name:title,description,inLanguage:system.language,isPartOf:{'@id':system.domain+'/#website'},about:{'@id':system.domain+'/#service'},primaryImageOfPage:{'@type':'ImageObject',url:system.brand.logoAbsolute}});
    graph.push({'@type':'LocalBusiness','@id':system.domain+'/#business',name:system.business.name,alternateName:system.business.alternateName,url:system.domain+'/',logo:system.brand.logoAbsolute,image:system.brand.logoAbsolute,telephone:system.business.phoneTel,email:system.business.email,address:{'@type':'PostalAddress',streetAddress:system.business.streetAddress,addressLocality:system.business.locality,addressRegion:system.business.region,addressCountry:system.business.country},areaServed:{'@type':'City',name:'Hanoi'},openingHoursSpecification:[{'@type':'OpeningHoursSpecification',dayOfWeek:['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'],opens:String(system.business.openHour).padStart(2,'0')+':00',closes:String(system.business.closeHour).padStart(2,'0')+':00'}],hasMap:system.business.mapsUrl,sameAs:system.social});
    graph.push({'@type':'Service','@id':system.domain+'/#service',name:'Hanoi Motorbike Rental',serviceType:'Motorbike rental in Hanoi',description:'Scooter, semi-automatic, 50cc and electric motorbike rental with verified daily, weekly and monthly prices where published.',provider:{'@id':system.domain+'/#business'},areaServed:{'@type':'City',name:'Hanoi'},url:system.domain+'/'});
  }else{
    graph.push({'@type':'WebPage','@id':canonical,url:canonical,name:title,description,inLanguage:system.language,image:system.brand.logoAbsolute,isPartOf:{'@id':system.domain+'/#website'}});
    const crumbs=breadcrumbItems(html,canonical);
    if(crumbs.length) graph.push({'@type':'BreadcrumbList',itemListElement:crumbs});
    if(pagePath==='faq/index.html'){
      const faq=faqItems(html);
      if(faq.length) graph.push({'@type':'FAQPage',mainEntity:faq});
    }
  }
  return '<!-- SLOT:SCHEMA:START -->\n<script type="application/ld+json">'+JSON.stringify({'@context':'https://schema.org','@graph':graph})+'</script>\n<!-- SLOT:SCHEMA:END -->';
}
function parseCSV(text){
  const rows=[];let row=[],field='',q=false;
  for(let i=0;i<text.length;i++){
    const ch=text[i];
    if(q){if(ch==='"'&&text[i+1]==='"'){field+='"';i++;}else if(ch==='"')q=false;else field+=ch;}
    else{if(ch==='"')q=true;else if(ch===','){row.push(field);field='';}else if(ch==='\n'){row.push(field);rows.push(row);row=[];field='';}else if(ch!=='\r')field+=ch;}
  }
  if(field||row.length){row.push(field);rows.push(row);}
  return rows;
}
const matrixLinks=new Map();
try{
  const rows=parseCSV(read('data/content-matrix.csv'));
  const h=rows[0]||[];
  const pidx=h.indexOf('path'),lidx=h.indexOf('internal_link_targets');
  for(let i=1;i<rows.length;i++){
    if(rows[i][pidx]) matrixLinks.set(rows[i][pidx],(rows[i][lidx]||'').split(';').filter(Boolean));
  }
}catch{}

function relatedEntries(pagePath){
  const explicit=system.relatedByPage[pagePath];
  const raw=explicit||matrixLinks.get(pagePath)||[];
  return raw.map(x=>typeof x==='string'?{href:x}:{...x}).map(x=>{
    const base=system.cards[x.href];
    if(!base) return null;
    return {...base,...x};
  }).filter(Boolean).slice(0,5);
}
function relatedBlock(pagePath){
  const entries=relatedEntries(pagePath);
  if(!entries.length) return '';
  const cards=entries.map(e=>render(cardTpl,e)).join('\n');
  return '<!-- SLOT:RELATED:START -->\n<h2>Related hubs</h2>\n<div class="card-grid">\n'+cards+'\n    </div>\n<!-- SLOT:RELATED:END -->';
}
function replaceOrInsertHook(html,name,content,anchor,where='before'){
  const block=hookBlock(name,content);
  const re=new RegExp('<!-- HOOK:'+name+':START -->[\\s\\S]*?<!-- HOOK:'+name+':END -->');
  if(re.test(html)) return html.replace(re,block);
  const i=html.indexOf(anchor);
  if(i<0) return html;
  return where==='after'?html.slice(0,i+anchor.length)+'\n'+block+html.slice(i+anchor.length):html.slice(0,i)+block+'\n'+html.slice(i);
}
function buildHtml(html,pagePath){
  if(pagePath==='404.html') return html;
  if(html.includes('<!-- SLOT:HEADER -->')) html=html.replace('<!-- SLOT:HEADER -->',header);
  else html=html.replace(/<!-- SHARED_NAV_START -->[\s\S]*?<!-- SHARED_NAV_END -->/,header);
  if(html.includes('<!-- SLOT:FOOTER -->')) html=html.replace('<!-- SLOT:FOOTER -->',footer);
  else html=html.replace(/<!-- SHARED_FOOTER_START -->[\s\S]*?<!-- SHARED_FOOTER_END -->/,footer);

  const schema=schemaFor(html,pagePath);
  if(schema){
    if(/<!-- SLOT:SCHEMA:START -->[\s\S]*?<!-- SLOT:SCHEMA:END -->/.test(html)) html=html.replace(/<!-- SLOT:SCHEMA:START -->[\s\S]*?<!-- SLOT:SCHEMA:END -->/,schema);
    else if(html.includes('<!-- SLOT:SCHEMA -->')) html=html.replace('<!-- SLOT:SCHEMA -->',schema);
    else if(/<script type="application\/ld\+json">[\s\S]*?<\/script>/.test(html)) html=html.replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/,schema);
  }

  const related=relatedBlock(pagePath);
  if(related){
    if(/<!-- SLOT:RELATED:START -->[\s\S]*?<!-- SLOT:RELATED:END -->/.test(html)) html=html.replace(/<!-- SLOT:RELATED:START -->[\s\S]*?<!-- SLOT:RELATED:END -->/,related);
    else if(html.includes('<!-- SLOT:RELATED -->')) html=html.replace('<!-- SLOT:RELATED -->',related);
    else html=html.replace(/<h2>Related hubs<\/h2>\s*<div class="card-grid">[\s\S]*?<\/div>\s*(?=<div class="contact-cta"|<p class="back-home"|<\/article>)/i,related+'\n');
  }

  const ctaBlock='<!-- SLOT:CTA:START -->\n'+cta+'\n<!-- SLOT:CTA:END -->';
  if(/<!-- SLOT:CTA:START -->[\s\S]*?<!-- SLOT:CTA:END -->/.test(html)) html=html.replace(/<!-- SLOT:CTA:START -->[\s\S]*?<!-- SLOT:CTA:END -->/,ctaBlock);
  else if(html.includes('<!-- SLOT:CTA -->')) html=html.replace('<!-- SLOT:CTA -->',ctaBlock);
  else if(/<div class="contact-cta">[\s\S]*?<div class="hero-cta">[\s\S]*?<\/div>\s*<\/div>/i.test(html)) html=html.replace(/<div class="contact-cta">[\s\S]*?<div class="hero-cta">[\s\S]*?<\/div>\s*<\/div>/i,ctaBlock);

  html=replaceOrInsertHook(html,'AFTER_HEADER',hookAfterHeader,'<!-- SHARED_NAV_END -->','after');
  html=replaceOrInsertHook(html,'BEFORE_FOOTER',hookBeforeFooter,'<!-- SHARED_FOOTER_START -->','before');
  if(related) html=replaceOrInsertHook(html,'ARTICLE_BEFORE_RELATED',hookArticle,'<!-- SLOT:RELATED:START -->','before');
  return html;
}
function businessJs(){
  const b={name:system.business.name,address:system.business.address,phone:system.business.phone,phoneTel:system.business.phoneTel,email:system.business.email,mapsUrl:system.business.mapsUrl,mapsEmbed:'https://maps.google.com/maps?q=112%20Nguyen%20Van%20Cu%2C%20Long%20Bien%2C%20Hanoi&t=&z=15&ie=UTF8&iwloc=&output=embed',hoursText:system.business.hoursText,timezone:system.business.timezone,openHour:system.business.openHour,closeHour:system.business.closeHour,website:system.domain+'/'};
  return '/* GENERATED by tools/build-site.mjs — edit data/site-system.json, not this file. */\nvar BUSINESS = '+JSON.stringify(b,null,2)+';\n\nvar PRICES = '+JSON.stringify(system.prices,null,2)+';\n\nvar CONTACT_METHODS = '+JSON.stringify(system.contacts,null,2)+';\n';
}

let changed=0;
for(const file of walk(ROOT)){
  const pagePath=rel(file);
  const before=fs.readFileSync(file,'utf8');
  const after=buildHtml(before,pagePath);
  if(after!==before){
    changed++;
    if(!CHECK) fs.writeFileSync(file,after,'utf8');
    console.log((CHECK?'would update: ':'updated: ')+pagePath);
  }
}
const jsPath=path.join(ROOT,'assets/js/business-config.js');
const js=businessJs();
const currentJs=fs.readFileSync(jsPath,'utf8');
if(js!==currentJs){
  changed++;
  if(!CHECK) fs.writeFileSync(jsPath,js,'utf8');
  console.log((CHECK?'would update: ':'updated: ')+'assets/js/business-config.js');
}
if(CHECK&&changed){
  console.error('Build drift detected: '+changed+' file(s) would change. Run node tools/build-site.mjs first.');
  process.exit(1);
}
console.log(CHECK?'Build is idempotent.':'Shared site build complete. Updated '+changed+' file(s).');
