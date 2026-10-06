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
const floatingTpl=read('site/partials/floating-ui.html');
const scriptsTpl=read('site/partials/scripts.html');
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
function featureOn(key){return !system.features || system.features[key]!==false;}
function applyFeatureSections(tpl){
  return tpl.replace(/<!-- FEATURE:([A-Za-z0-9_.-]+):START -->([\s\S]*?)<!-- FEATURE:\1:END -->/g,(_,key,body)=>featureOn(key)?body.trim():'');
}
const ctx={...system,business:{...system.business,website:system.domain+'/'}};
// Normalize partial boundaries so repeated builds do not accumulate blank lines.
const header=render(headerTpl,ctx).trimEnd();
const footer=render(footerTpl,ctx).trimEnd();
const floating=render(applyFeatureSections(floatingTpl),ctx).trim();
const scripts=render(applyFeatureSections(scriptsTpl),ctx).trim();

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
function h1Of(html){return textOnly((html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)||[])[1]||'');}
function attr(s){return String(s||'').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
function syncSocialMeta(html,pagePath){
  if(!featureOn('autoSocialMeta')) return html;
  const title=titleOf(html),description=descOf(html),canonical=canonicalOf(html);
  if(!title||!canonical) return html;
  const oldType=(html.match(/<meta property="og:type" content="([^"]+)"/i)||[])[1];
  const type=oldType||(pagePath==='index.html'?'website':'article');
  const locale=(system.language||'en-US').replace('-','_');
  const block='<!-- SLOT:SOCIAL_META:START -->\n'
    +'<meta property="og:type" content="'+attr(type)+'">\n'
    +'<meta property="og:site_name" content="'+attr(system.business.name)+'">\n'
    +'<meta property="og:locale" content="'+attr(locale)+'">\n'
    +'<meta property="og:title" content="'+attr(title)+'">\n'
    +'<meta property="og:description" content="'+attr(description)+'">\n'
    +'<meta property="og:url" content="'+attr(canonical)+'">\n'
    +'<meta property="og:image" content="'+attr(system.brand.logoAbsolute)+'">\n'
    +'<meta name="twitter:card" content="summary">\n'
    +'<meta name="twitter:title" content="'+attr(title)+'">\n'
    +'<meta name="twitter:description" content="'+attr(description)+'">\n'
    +'<meta name="twitter:image" content="'+attr(system.brand.logoAbsolute)+'">\n'
    +'<!-- SLOT:SOCIAL_META:END -->';
  const marked=/<!-- SLOT:SOCIAL_META:START -->[\s\S]*?<!-- SLOT:SOCIAL_META:END -->/;
  if(marked.test(html)) return html.replace(marked,block);
  const legacy=/<meta property="og:type"[\s\S]*?<meta name="twitter:image"[^>]*>/i;
  if(legacy.test(html)) return html.replace(legacy,block);
  const css=html.indexOf('<link rel="stylesheet"');
  return css>=0?html.slice(0,css)+block+'\n'+html.slice(css):html;
}
function syncAssetVersion(html){
  const v=system.assets&&system.assets.version;
  if(!v) return html;
  return html.replace(/<link rel="stylesheet" href="\/assets\/css\/style\.css(?:\?v=[^"]*)?">/i,'<link rel="stylesheet" href="/assets/css/style.css?v='+attr(v)+'">');
}
function lazyContentImages(html){
  if(!featureOn('lazyContentImages')) return html;
  return html.replace(/<img\b([^>]*)>/gi,(tag,attrs)=>{
    if(/src=["']\/Logonh\.png["']/i.test(tag) || /loading=/i.test(tag)) return tag;
    let out=tag.replace(/>$/,'');
    if(!/decoding=/i.test(out)) out+=' decoding="async"';
    out+=' loading="lazy">';
    return out;
  });
}
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
  if(!featureOn('autoSchema') || system.schema.excludePaths.includes(pagePath)) return null;
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
const matrixByPath=new Map();
const matrixRows=[];
try{
  const rows=parseCSV(read('data/content-matrix.csv'));
  const h=rows[0]||[];
  for(let i=1;i<rows.length;i++){
    if(!rows[i].length) continue;
    const rec={};
    h.forEach((k,j)=>rec[k]=rows[i][j]||'');
    if(!rec.path) continue;
    matrixRows.push(rec);
    matrixByPath.set(rec.path,rec);
    matrixLinks.set(rec.path,(rec.internal_link_targets||'').split(';').filter(Boolean));
  }
}catch{}
function pathToHref(p){
  if(p==='index.html') return '/';
  if(p.endsWith('/index.html')) return '/'+p.slice(0,-'index.html'.length);
  return '/'+p;
}
function hrefToPath(href){
  const clean=href.split('#')[0].split('?')[0];
  if(clean==='/') return 'index.html';
  const p=clean.replace(/^\//,'');
  if(clean.endsWith('/')) return p+'index.html';
  return p;
}
const genericCardIcon='<svg class="card-ico" width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M7 7h10v10H7zM4 12h3m10 0h3M12 4v3m0 10v3" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>';
function autoCard(href){
  const pagePath=hrefToPath(href);
  const full=path.join(ROOT,pagePath);
  if(!fs.existsSync(full)) return null;
  const html=fs.readFileSync(full,'utf8');
  return {href,title:h1Of(html)||titleOf(html),description:descOf(html),icon:genericCardIcon};
}
function inferredRelated(pagePath){
  const row=matrixByPath.get(pagePath);
  if(!row) return [];
  return matrixRows
    .filter(r=>r.path!==pagePath && r.content_role!=='LEGAL' && ((row.hub&&r.hub===row.hub)||(row.silo&&r.silo===row.silo)))
    .sort((a,b)=>{
      const rank=x=>x.content_role==='ROOT_HUB'?0:x.content_role==='HUB'?1:x.content_role==='ANSWER_HUB'?2:3;
      return rank(a)-rank(b);
    })
    .map(r=>pathToHref(r.path))
    .slice(0,5);
}
function relatedEntries(pagePath){
  const explicit=system.relatedByPage[pagePath];
  const targets=(matrixLinks.get(pagePath)||[]).filter(Boolean);
  const raw=explicit||(targets.length?targets:inferredRelated(pagePath));
  return raw.map(x=>typeof x==='string'?{href:x}:{...x}).map(x=>{
    const base=system.cards[x.href]||autoCard(x.href);
    if(!base) return null;
    return {...base,...x};
  }).filter(Boolean).slice(0,5);
}
function relatedBlock(pagePath){
  if(!featureOn('relatedPosts')) return '';
  const entries=relatedEntries(pagePath);
  if(!entries.length) return '';
  const cards=entries.map(e=>render(cardTpl,e)).join('\n');
  return '<!-- SLOT:RELATED:START -->\n<h2>Related hubs</h2>\n<div class="card-grid">\n'+cards+'\n    </div>\n<!-- SLOT:RELATED:END -->';
}
function ctaForPage(pagePath){
  const row=matrixByPath.get(pagePath);
  const override=row&&system.ctaBySilo&&system.ctaBySilo[row.silo]?system.ctaBySilo[row.silo]:{};
  return render(ctaTpl,{...ctx,cta:{...system.cta,...override}}).trim();
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

  if(/<!-- SHARED_FLOATING_START -->[\s\S]*?<!-- SHARED_FLOATING_END -->/.test(html)) html=html.replace(/<!-- SHARED_FLOATING_START -->[\s\S]*?<!-- SHARED_FLOATING_END -->/,floating);
  else if(/<div class="quick-contact"[\s\S]*?(?=<script src="\/assets\/js\/business-config\.js)/i.test(html)) html=html.replace(/\s*<div class="quick-contact"[\s\S]*?(?=<script src="\/assets\/js\/business-config\.js)/i,'\n'+floating+'\n\n');
  else html=html.replace('</body>',floating+'\n</body>');

  if(/<!-- SHARED_SCRIPTS_START -->[\s\S]*?<!-- SHARED_SCRIPTS_END -->/.test(html)) html=html.replace(/<!-- SHARED_SCRIPTS_START -->[\s\S]*?<!-- SHARED_SCRIPTS_END -->/,scripts);
  else {
    const legacyScripts=/<script src="\/assets\/js\/business-config\.js[^"]*" defer><\/script>\s*<script src="\/assets\/js\/app\.js[^"]*" defer><\/script>\s*(?:<script src="\/assets\/js\/assistant\.js[^"]*" defer><\/script>)?/i;
    if(legacyScripts.test(html)) html=html.replace(legacyScripts,scripts);
    else html=html.replace('</body>',scripts+'\n</body>');
  }

  html=syncAssetVersion(html);
  html=syncSocialMeta(html,pagePath);
  html=lazyContentImages(html);

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

  if(featureOn('articleCta')){
    const pageCta=ctaForPage(pagePath);
    const ctaBlock='<!-- SLOT:CTA:START -->\n'+pageCta+'\n<!-- SLOT:CTA:END -->';
    if(/<!-- SLOT:CTA:START -->[\s\S]*?<!-- SLOT:CTA:END -->/.test(html)) html=html.replace(/<!-- SLOT:CTA:START -->[\s\S]*?<!-- SLOT:CTA:END -->/,ctaBlock);
    else if(html.includes('<!-- SLOT:CTA -->')) html=html.replace('<!-- SLOT:CTA -->',ctaBlock);
    else if(/<div class="contact-cta">[\s\S]*?<div class="hero-cta">[\s\S]*?<\/div>\s*<\/div>/i.test(html)) html=html.replace(/<div class="contact-cta">[\s\S]*?<div class="hero-cta">[\s\S]*?<\/div>\s*<\/div>/i,ctaBlock);
  }else{
    html=html.replace(/<!-- SLOT:CTA:START -->[\s\S]*?<!-- SLOT:CTA:END -->/,'');
    html=html.replace(/<div class="contact-cta">[\s\S]*?<div class="hero-cta">[\s\S]*?<\/div>\s*<\/div>/i,'');
  }

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
