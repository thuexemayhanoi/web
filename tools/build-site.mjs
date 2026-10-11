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
const authorTpl=read('site/partials/author-box.html');
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
  const named={
    amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' ',
    ndash:'–',mdash:'—',middot:'·',hellip:'…',
    rsquo:'’',lsquo:'‘',rdquo:'”',ldquo:'“'
  };
  let out=String(s||'');
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
function textOnly(s){
  return decode(s.replace(/<script[\s\S]*?<\/script>/gi,' ').replace(/<style[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim());
}
function titleOf(html){return textOnly((html.match(/<title>([\s\S]*?)<\/title>/i)||[])[1]||'');}
function descOf(html){return decode((html.match(/<meta name="description" content="([^"]*)"/i)||[])[1]||'');}
function canonicalOf(html){return (html.match(/<link rel="canonical" href="([^"]*)"/i)||[])[1]||'';}
function canonicalForPath(pagePath){
  if(pagePath==='index.html') return system.domain+'/';
  if(pagePath.endsWith('/index.html')) return system.domain+'/'+pagePath.slice(0,-'index.html'.length);
  return system.domain+'/'+pagePath;
}
function syncCanonical(html,pagePath){
  const expected=canonicalForPath(pagePath);
  const tag='<link rel="canonical" href="'+attr(expected)+'">';
  if(/<link rel="canonical" href="[^"]*">/i.test(html)) return html.replace(/<link rel="canonical" href="[^"]*">/i,tag);
  return html.replace(/<\/head>/i,tag+'\n</head>');
}
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
    .filter(r=>r.path!==pagePath && r.content_role!=='LEGAL' &&
      ((row.hub && r.hub===row.hub)||(row.silo && r.silo===row.silo)))
    .sort((a,b)=>{
      const rank=x=>x.content_role==='ROOT_HUB'?0:x.content_role==='HUB'?1:x.content_role==='ANSWER_HUB'?2:3;
      return rank(a)-rank(b);
    })
    .map(r=>pathToHref(r.path))
    .slice(0,12);
}
// Adjacent editorial posts are stable in Content Matrix order and stay in their
// own hub directory. No dates or imaginary author names are introduced.
const articleGroups=new Map();
for(const record of matrixRows){
  if(record.content_role!=='CLUSTER' || record.factory_status!=='PUBLISHED') continue;
  const group=record.path.split('/')[0];
  if(!articleGroups.has(group)) articleGroups.set(group,[]);
  articleGroups.get(group).push(record);
}
function adjacentLinks(pagePath){
  const group=articleGroups.get(pagePath.split('/')[0])||[];
  const i=group.findIndex(r=>r.path===pagePath);
  if(i<0) return '';
  const item=(row,label,klass)=>{
    if(!row || !fs.existsSync(path.join(ROOT,row.path))) return '';
    const h=pathToHref(row.path);
    const text=(row.working_title||row.primary_keyword||'').trim();
    return '<a class="post-neighbor '+klass+'" href="'+h+'"><span>'+label+'</span><strong>'+escapeTocText(text)+'</strong></a>';
  };
  const prev=item(group[i-1],'← Previous article','post-prev');
  const next=item(group[i+1],'Next article →','post-next');
  if(!prev&&!next) return '';
  return '<!-- SLOT:POST_NAV:START -->\n<nav class="post-neighbors" aria-label="Previous and next articles">'+prev+next+'</nav>\n<!-- SLOT:POST_NAV:END -->';
}
function syncArticleDiscovery(html,pagePath){
  const row=matrixByPath.get(pagePath);
  if(!row || row.content_role!=='CLUSTER') return html;
  let start=html.indexOf('<article class="article">');
  if(start<0){
    const opening=html.match(/<main\b[^>]*>\s*<article\b[^>]*>/i);
    if(opening)start=html.indexOf('<article',opening.index);
  }
  if(start<0) return html;
  const authorRe=/<!-- SLOT:AUTHOR:START -->[\s\S]*?<!-- SLOT:AUTHOR:END -->/;
  const navRe=/<!-- SLOT:POST_NAV:START -->[\s\S]*?<!-- SLOT:POST_NAV:END -->/;
  if(featureOn('authorBox')){
    const author='<!-- SLOT:AUTHOR:START -->\n'+render(authorTpl,ctx).trim()+'\n<!-- SLOT:AUTHOR:END -->';
    if(authorRe.test(html)) html=html.replace(authorRe,author);
    else {
      let before=outerArticleEnd(html,start);
      if(before<0) return html;
      for(const marker of ['<!-- HOOK:ARTICLE_BEFORE_RELATED:START -->','<!-- SLOT:RELATED:START -->','<!-- SLOT:CTA:START -->']){
        const pos=html.indexOf(marker,start);
        if(pos>=0&&pos<before) before=pos;
      }
      html=html.slice(0,before)+'\n'+author+'\n'+html.slice(before);
    }
  }else html=html.replace(/\n?<!-- SLOT:AUTHOR:START -->[\s\S]*?<!-- SLOT:AUTHOR:END -->\n?/g,'');
  if(featureOn('postNavigation')){
    const nav=adjacentLinks(pagePath);
    if(nav){
      if(navRe.test(html)) html=html.replace(navRe,nav);
      else {
        const end=outerArticleEnd(html,start);
        if(end>=0)html=html.slice(0,end)+'\n'+nav+'\n'+html.slice(end);
      }
    }
  }else html=html.replace(/\n?<!-- SLOT:POST_NAV:START -->[\s\S]*?<!-- SLOT:POST_NAV:END -->\n?/g,'');
  return html;
}

function relatedEntries(pagePath){
  const explicit=system.relatedByPage[pagePath]||[];
  const targets=(matrixLinks.get(pagePath)||[]).filter(Boolean);
  // Some older/custom articles have no Matrix record. Fall back to published
  // articles from their own hub directory rather than leaving Related empty.
  const dir=pagePath.includes('/')?pagePath.split('/')[0]:'';
  const siblingPaths=dir?matrixRows
    .filter(r=>r.path!==pagePath && r.content_role==='CLUSTER' && r.path.startsWith(dir+'/'))
    .map(r=>pathToHref(r.path))
    .slice(0,12):[];
  const candidates=[...explicit,...targets,...inferredRelated(pagePath),...siblingPaths];
  const seen=new Set([pathToHref(pagePath)]);
  const entries=[];
  for(const x of candidates){
    const item=typeof x==='string'?{href:x}:{...x};
    if(!item.href || seen.has(item.href)) continue;
    const base=system.cards[item.href]||autoCard(item.href);
    if(!base) continue;
    seen.add(item.href);
    entries.push({...base,...item});
    if(entries.length===9) break;
  }
  return entries;
}
function relatedBlock(pagePath){
  if(!featureOn('relatedPosts')) return '';
  const entries=relatedEntries(pagePath);
  if(!entries.length) return '';
  const cards=entries.map((entry,i)=>{
    const card=render(cardTpl,entry);
    return i<3?card:card.replace('<a class="card"','<a class="card" hidden');
  }).join('\n');
  const pager=entries.length>3?
    '<div class="related-controls" hidden><button class="related-prev" type="button" aria-label="Previous related articles">Previous</button><span class="related-count" aria-live="polite"></span><button class="related-next" type="button" aria-label="Next related articles">Next</button></div>':'';
  return '<!-- SLOT:RELATED:START -->\n<section class="related-reading" aria-label="Related articles">\n<h2>Related hubs</h2>\n<div class="card-grid related-grid">\n'+cards+'\n</div>\n'+pager+'\n</section>\n<!-- SLOT:RELATED:END -->';
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
// Replace legacy static TOCs with one deterministic, collapsible H2/H3 outline.
// Only editorial article bodies are changed; generated related cards/CTAs are excluded.
function escapeTocText(value){
  return String(value).replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
// Match the closing tag of the outer article, even with nested FAQ <article> nodes.
function outerArticleEnd(html,start){
  let depth=0;
  for(const m of html.slice(start).matchAll(/<\/?article\b[^>]*>/gi)){
    if(/^<\/article/i.test(m[0])){
      depth--;
      if(depth===0) return start+m.index;
    }else depth++;
  }
  return -1;
}

function articleToc(html){
  const start=html.indexOf('<article class="article">');
  if(start<0) return html;
  const end=outerArticleEnd(html,start);
  if(end<0) return html;
  let article=html.slice(start,end);
  article=article.replace(/\n?<!-- SLOT:TOC:START -->[\s\S]*?<!-- SLOT:TOC:END -->/gi,'');
  article=article.replace(/<nav\b[^>]*class=["'][^"']*\btoc\b[^"']*["'][^>]*>[\s\S]*?<\/nav>\s*/gi,'');
  const tailMarkers=['<!-- HOOK:ARTICLE_BEFORE_RELATED:START -->','<!-- SLOT:RELATED:START -->','<!-- SLOT:RELATED -->','<!-- SLOT:AUTHOR:START -->','<!-- SLOT:POST_NAV:START -->','<!-- SLOT:CTA:START -->','<!-- SLOT:CTA -->','<div class="contact-cta">','<p class="back-home"','<div class="faq-ai">'];
  let bodyEnd=article.length;
  for(const marker of tailMarkers){
    const p=article.indexOf(marker);
    if(p>=0 && p<bodyEnd) bodyEnd=p;
  }
  const body=article.slice(0,bodyEnd);
  const headings=[...body.matchAll(/<h([23])\b([^>]*)>([\s\S]*?)<\/h\1>/gi)];
  if(!featureOn('articleToc') || headings.length<2 || !headings.some(h=>h[1]==='2')) return html.slice(0,start)+article+html.slice(end);
  const taken=new Set([...article.matchAll(/\bid=["']([^"']+)["']/gi)].map(x=>x[1]));
  let index=0;
  const items=[];
  const withIds=body.replace(/<h([23])\b([^>]*)>([\s\S]*?)<\/h\1>/gi,(whole,level,attrs,inner)=>{
    const label=textOnly(inner);
    if(!label) return whole;
    const current=attrs.match(/\bid=["']([^"']+)["']/i);
    let id=current?current[1]:'';
    if(!id){
      const base=label.normalize('NFKD').toLowerCase().replace(/[\u0300-\u036f]/g,'')
        .replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,65)||'section';
      id=base;
      let n=2;
      while(taken.has(id)) id=base+'-'+(n++);
      taken.add(id);
    }
    items.push({level,id,label});
    index++;
    return current?whole:'<h'+level+attrs+' id="'+escapeTocText(id)+'">'+inner+'</h'+level+'>';
  });
  if(items.length<2) return html.slice(0,start)+article+html.slice(end);
  article=withIds+article.slice(bodyEnd);
  const links=items.map(h=>'<li class="toc-level-'+h.level+'"><a href="#'+escapeTocText(h.id)+'">'+escapeTocText(h.label)+'</a></li>').join('\n');
  const toc='<!-- SLOT:TOC:START -->\n<nav class="article-toc" aria-label="Table of contents"><details class="toc-details"><summary>On this page</summary><ol>'+links+'</ol></details></nav>\n<!-- SLOT:TOC:END -->';
  // The first editorial H2 is the intended placement, immediately after its heading.
  const first=article.match(/<h2\b[^>]*>[\s\S]*?<\/h2>/i);
  if(!first) return html.slice(0,start)+article+html.slice(end);
  const pos=first.index+first[0].length;
  article=article.slice(0,pos)+'\n'+toc+article.slice(pos);
  return html.slice(0,start)+article+html.slice(end);
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
  html=syncCanonical(html,pagePath);
  html=syncSocialMeta(html,pagePath);
  html=lazyContentImages(html);
  if(pagePath!=='faq/index.html' && !system.schema.excludePaths.includes(pagePath)) html=articleToc(html);

  const schema=schemaFor(html,pagePath);
  if(schema){
    if(/<!-- SLOT:SCHEMA:START -->[\s\S]*?<!-- SLOT:SCHEMA:END -->/.test(html)) html=html.replace(/<!-- SLOT:SCHEMA:START -->[\s\S]*?<!-- SLOT:SCHEMA:END -->/,schema);
    else if(html.includes('<!-- SLOT:SCHEMA -->')) html=html.replace('<!-- SLOT:SCHEMA -->',schema);
    else if(/<script type="application\/ld\+json">[\s\S]*?<\/script>/.test(html)) html=html.replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/,schema);
  }

  const related=pagePath==='faq/index.html' || system.schema.excludePaths.includes(pagePath)?'':relatedBlock(pagePath);
  if(related){
    if(/<!-- SLOT:RELATED:START -->[\s\S]*?<!-- SLOT:RELATED:END -->/.test(html)) html=html.replace(/<!-- SLOT:RELATED:START -->[\s\S]*?<!-- SLOT:RELATED:END -->/,related);
    else if(html.includes('<!-- SLOT:RELATED -->')) html=html.replace('<!-- SLOT:RELATED -->',related);
    else {
      const legacy=/<h2>Related hubs<\/h2>\s*<div class="card-grid">[\s\S]*?<\/div>\s*(?=<div class="contact-cta"|<p class="back-home"|<\/article>)/i;
      if(legacy.test(html)) html=html.replace(legacy,related+'\n');
      else {
        // New factory articles have no related slot yet: insert before CTA or article end.
        const aStart=html.indexOf('<article class="article">');
        const aEnd=aStart>=0?outerArticleEnd(html,aStart):-1;
        if(aEnd>=0){
          let before=aEnd;
          for(const anchor of ['<!-- SLOT:CTA:START -->','<!-- SLOT:CTA -->','<div class="contact-cta">','<p class="back-home"']){
            const i=html.indexOf(anchor,aStart);
            if(i>=0&&i<before) before=i;
          }
          html=html.slice(0,before)+'\n'+related+'\n'+html.slice(before);
        }
      }
    }
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
  // Normalize legacy factory pages with their generated related block outside <main>.
  // Move generated markup only: original article paragraphs/headings stay untouched.
  if(related){
    const aStart=html.indexOf('<article class="article">');
    const end=aStart<0?-1:outerArticleEnd(html,aStart);
    const relMatch=html.match(/<!-- SLOT:RELATED:START -->[\s\S]*?<!-- SLOT:RELATED:END -->/);
    const relPos=relMatch?html.indexOf(relMatch[0]):-1;
    if(end>=0 && relPos>end){
      const hookMatch=html.match(/<!-- HOOK:ARTICLE_BEFORE_RELATED:START -->[\s\S]*?<!-- HOOK:ARTICLE_BEFORE_RELATED:END -->/);
      const hookPos=hookMatch?html.indexOf(hookMatch[0]):-1;
      const moveHook=hookPos>end&&hookPos<relPos?hookMatch[0]:'';
      html=html.replace(relMatch[0],'');
      if(moveHook) html=html.replace(moveHook,'');
      const newEnd=outerArticleEnd(html,aStart);
      html=html.slice(0,newEnd)+'\n'+(moveHook?moveHook+'\n':'')+relMatch[0]+'\n'+html.slice(newEnd);
    }
  }
  html=syncArticleDiscovery(html,pagePath);
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
