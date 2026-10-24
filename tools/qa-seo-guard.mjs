#!/usr/bin/env node
// SEO regression guard: business data consistency (NAP, prices, deposits),
// navigation quality, company/legal pages and editorial self-talk.
// Read-only. Fails CI when one of the rules below breaks.
import fs from 'node:fs';
import path from 'node:path';

const ROOT=process.cwd();
const read=(p)=>fs.readFileSync(path.join(ROOT,p),'utf8');
const system=JSON.parse(read('data/site-system.json'));
const b=system.business;
const errors=[];
const SKIP=new Set(['.git','node_modules','site','assets','data','tools','reports','_factory','factory']);
function walk(dir,out=[]){
  for(const e of fs.readdirSync(path.join(ROOT,dir),{withFileTypes:true})){
    if(SKIP.has(e.name)) continue;
    const rel=dir?dir+'/'+e.name:e.name;
    if(e.isDirectory()) walk(rel,out);
    else if(e.name.endsWith('.html')) out.push(rel);
  }
  return out;
}
const pages=new Map(walk('').map(p=>[p,read(p)]));
const indexable=[...pages.keys()].filter(p=>p!=='404.html');
const text=(h)=>h.replace(/<script[\s\S]*?<\/script>/gi,' ').replace(/<[^>]+>/g,' ').replace(/&nbsp;/g,' ').replace(/\s+/g,' ').trim();
// Editorial body: <main> without generated slots.
function editorial(html){
  const m=(html.match(/<main\b[\s\S]*?<\/main>/i)||[''])[0];
  return m.replace(/<!-- (SLOT|HOOK):([A-Z_]+):START -->[\s\S]*?<!-- \1:\2:END -->/g,' ');
}

const NAMED={amp:'&',quot:'"',apos:"'",lt:'<',gt:'>',nbsp:' ',rsquo:'’',lsquo:'‘',rdquo:'”',ldquo:'“',mdash:'—',ndash:'–',hellip:'…',middot:'·'};
const decode=(v)=>v.replace(/&#x([0-9a-f]+);/gi,(_,h)=>String.fromCodePoint(parseInt(h,16))).replace(/&#(\d+);/g,(_,n)=>String.fromCodePoint(Number(n))).replace(/&([a-z]+);/gi,(m,n)=>NAMED[n.toLowerCase()]??m);

// 1. NAP and map link come from data/site-system.json everywhere.
const mapsUrl=b.mapsUrl;
for(const p of indexable){
  const c=pages.get(p);
  if(c.includes('share.google/')) errors.push(p+': legacy Google share link found; use business.mapsUrl');
  if(!c.includes(b.address)) errors.push(p+': footer NAP address does not match business.address');
}
const homeSchema=(pages.get('index.html').match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)||[])[1]||'{}';
const lb=(JSON.parse(homeSchema)['@graph']||[]).find(n=>n['@type']==='LocalBusiness')||{};
if(lb.telephone!==b.phoneTel) errors.push('index.html: LocalBusiness telephone does not match config');
if(lb.hasMap!==mapsUrl) errors.push('index.html: LocalBusiness hasMap does not match config');
if(!lb.address||lb.address.streetAddress!==b.streetAddress||lb.address.addressLocality!==b.locality) errors.push('index.html: LocalBusiness address does not match config');
// Structured rental offers mirror the price table (same source, ranges kept as ranges).
const svc=(JSON.parse(homeSchema)['@graph']||[]).find(n=>n['@type']==='Service')||{};
const offers=((svc.hasOfferCatalog||{}).itemListElement)||[];
for(const p of Object.values(system.prices)){
  const o=offers.find(x=>x.itemOffered&&x.itemOffered.name===p.name+' rental');
  if(!o){errors.push('index.html: schema offer missing for '+p.name);continue;}
  for(const [k,code] of [['day','DAY'],['week','WEE'],['month','MON']]){
    const spec=(o.priceSpecification||[]).find(x=>x.unitCode===code);
    const want=p[k];
    const got=spec?(spec.price!=null?spec.price:[spec.minPrice,spec.maxPrice]):null;
    if(JSON.stringify(got)!==JSON.stringify(want==null?null:want)) errors.push('index.html: schema '+k+' price for '+p.name+' is '+JSON.stringify(got)+', config says '+JSON.stringify(want));
  }
}
// Brand queries need the brand on the homepage title and as the WebSite name.
const ws=(JSON.parse(homeSchema)['@graph']||[]).find(n=>n['@type']==='WebSite')||{};
if(ws.name!==system.brand.siteName) errors.push('index.html: WebSite name does not match brand.siteName');
const homeTitle=(pages.get('index.html').match(/<title>([^<]*)<\/title>/)||[])[1]||'';
if(!/Nguyen Tu/.test(homeTitle)) errors.push('index.html: homepage title lacks the brand name');
for(const p of ['index.html','about/index.html','contact/index.html']){
  if(!(pages.get(p)||'').includes('<!-- SLOT:NAP:START -->')) errors.push(p+': generated NAP block missing');
}

// 2. Prices and deposits: generated tables on their owner pages, prose ranges match config.
for(const p of ['index.html','hanoi-motorbike-rental-cost/index.html','about/index.html']){
  if(!(pages.get(p)||'').includes('<!-- SLOT:RATES:START -->')) errors.push(p+': generated price/deposit table missing');
}
const depositPage=system.depositPolicy.guideHref.replace(/^\//,'')+'index.html';
if(!(pages.get(depositPage)||'').includes('<!-- SLOT:DEPOSITS:START -->')) errors.push(depositPage+': generated deposit table missing');
const amounts=Object.values(system.prices).flatMap(p=>p.deposit==null?[]:[].concat(p.deposit));
for(const [k,p] of Object.entries(system.prices)){
  if(!('deposit' in p)) errors.push('site-system.json: prices.'+k+' has no deposit field (use null + depositNote when unpublished)');
  else if(p.deposit==null&&!p.depositNote) errors.push('site-system.json: prices.'+k+' deposit is null without depositNote');
}
const fmt=(n)=>String(n).replace(/\B(?=(\d{3})+(?!\d))/g,',');
const minDep=fmt(Math.min(...amounts)),maxDep=fmt(Math.max(...amounts));
if(!system.depositPolicy.summary.includes(minDep+' to '+maxDep)) errors.push('depositPolicy.summary does not state the configured range '+minDep+' to '+maxDep);
const NO_DEPOSIT=/\b(?:no[- ]deposit (?:required|needed|rental)|deposit[- ]free|rent(?:al)? (?:a (?:motorbike|bike|scooter) )?without (?:a |any )?deposit)\b/i;
for(const p of indexable){
  const body=text(editorial(pages.get(p)));
  if(NO_DEPOSIT.test(body)) errors.push(p+': advertises renting without a deposit: "'+body.match(NO_DEPOSIT)[0]+'"');
  for(const m of body.matchAll(/deposit is (\d{1,3}(?:,\d{3})+) to (\d{1,3}(?:,\d{3})+) VND/gi)){
    if(m[1]!==minDep||m[2]!==maxDep) errors.push(p+': deposit range "'+m[0]+'" does not match config '+minDep+' to '+maxDep);
  }
}

// 3. Navigation: one label per destination (the same link may be cross-listed);
// About/Contact are real pages.
const header=read('site/partials/header.html');
for(const [cls,label] of [['dd-link','desktop menu'],['dr-link','mobile menu']]){
  const seen=new Map();
  for(const m of header.matchAll(new RegExp('<a class="'+cls+'" href="([^"]+)">([^<]+)</a>','g'))){
    if(seen.has(m[1])&&seen.get(m[1])!==m[2]) errors.push('header '+label+': "'+m[2]+'" and "'+seen.get(m[1])+'" both link to '+m[1]);
    else seen.set(m[1],m[2]);
  }
}
// The homepage owns "Hanoi Motorbike Rental"; the rental hub is the "... Guide".
// Shared links must not hand the head term to the hub, and articles link home with it.
const HEAD_TO_HUB=/<a\b[^>]*href="\/hanoi-motorbike-rental\/"[^>]*>\s*Hanoi Motorbike Rental\s*<\/a>/i;
if(HEAD_TO_HUB.test(header)||HEAD_TO_HUB.test(read('site/partials/footer.html'))) errors.push('shared nav/footer: rental hub linked with the homepage head term "Hanoi Motorbike Rental"');
if(/\btitle":\s*"Hanoi Motorbike Rental"/.test(JSON.stringify(system.cards['/hanoi-motorbike-rental/']||{}))) errors.push('site-system.json: rental hub card uses the homepage head term as its title');
for(const p of indexable){
  const crumbs=(pages.get(p).match(/<nav class="crumbs"[\s\S]*?<\/nav>/)||[''])[0];
  if(HEAD_TO_HUB.test(crumbs)) errors.push(p+': breadcrumb links the rental hub with the homepage head term');
}
if(!/<a href="\/">Hanoi motorbike rental<\/a>/.test(read('site/partials/author-box.html'))) errors.push('author-box: missing the head-term link to the homepage');
// Every exact-match anchor for a researched keyword points at that keyword's owner URL.
if(fs.existsSync(path.join(ROOT,'reports/seo-intel.json'))){
  const owners=new Map();
  for(const c of JSON.parse(read('reports/seo-intel.json')).clusters||[]){
    const own=(c.owner&&c.owner.url||'').replace(system.domain,'');
    if(own) for(const ph of [c.lead,...(c.phrases||[]).map(x=>x.phrase)]) owners.set(String(ph).toLowerCase(),own);
  }
  for(const p of indexable){
    for(const m of pages.get(p).matchAll(/<a\b[^>]*href="([^"#?]*)[^"]*"[^>]*>([\s\S]*?)<\/a>/g)){
      const t=decode(m[2].replace(/<[^>]+>/g,' ')).replace(/\s+/g,' ').trim().toLowerCase();
      const own=owners.get(t);
      if(own&&(m[1].replace(system.domain,'')||'/')!==own) errors.push(p+': anchor "'+t+'" links '+m[1]+' but the keyword owner is '+own);
    }
  }
}
for(const href of ['/about/','/contact/']){
  const file=href.slice(1)+'index.html';
  if(!pages.has(file)) errors.push(file+': company page missing');
  if(!header.includes('href="'+href+'"')) errors.push('header: no link to '+href);
  if(!read('site/partials/footer.html').includes('href="'+href+'"')) errors.push('footer: no link to '+href);
}
if(!/"@type":"AboutPage"/.test(pages.get('about/index.html')||'')) errors.push('about/index.html: AboutPage schema missing');
if(!/"@type":"ContactPage"/.test(pages.get('contact/index.html')||'')) errors.push('contact/index.html: ContactPage schema missing');

// 4. Legal pages are complete documents with a visible date.
for(const p of ['privacy-policy.html','terms-of-use.html']){
  const body=text(editorial(pages.get(p)||''));
  const words=body.split(' ').length;
  if(words<400) errors.push(p+': only '+words+' words; legal pages must cover actual practice in full');
  if(!/Last updated: \d{1,2} [A-Z][a-z]+ \d{4}/.test(body)) errors.push(p+': "Last updated" date missing');
}

// 5. No editorial self-talk about "inventing" data (reads as machine-written).
const SELF_TALK=/\binvent(?:s|ed|ing)?\b/i;
for(const p of indexable){
  for(const m of editorial(pages.get(p)).matchAll(/<(p|li|h[1-6]|td|summary)\b[^>]*>([\s\S]*?)<\/\1>/gi)){
    const t=text(m[2]);
    if(SELF_TALK.test(t)&&!/ever invented/i.test(t)) errors.push(p+': self-talk "'+t.slice(0,90)+'"');
  }
}

// 6. Meta descriptions fit the snippet (Google truncates around 155-160 characters).
for(const p of indexable){
  const d=decode((pages.get(p).match(/<meta name="description" content="([^"]*)"/)||[])[1]||'');
  if(d.length>160) errors.push(p+': meta description '+d.length+' chars (max 160)');
}

// 7. Internal tooling stays out of the crawl.
const robots=read('robots.txt');
for(const dir of ['/data/','/tools/','/reports/']) if(!robots.includes('Disallow: '+dir)) errors.push('robots.txt: missing Disallow: '+dir);

if(errors.length){
  console.error('SEO guard FAIL: '+errors.length+' problem(s)');
  for(const e of errors.slice(0,80)) console.error(' - '+e);
  process.exit(1);
}
console.log('SEO guard PASS: '+indexable.length+' pages; NAP, prices/deposits ('+minDep+'-'+maxDep+' VND), navigation, company/legal pages and editorial checks clean.');
