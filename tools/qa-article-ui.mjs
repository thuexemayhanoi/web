#!/usr/bin/env node
// Validate generated article TOC/related pagination without modifying content.
import fs from 'node:fs';
import path from 'node:path';
const root=process.cwd();
const system=JSON.parse(fs.readFileSync(path.join(root,'data/site-system.json'),'utf8'));
const errors=[];
let articles=0, tocPages=0, relatedPages=0, paged=0;
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

function walk(dir){
  for(const item of fs.readdirSync(dir,{withFileTypes:true})){
    if(['.git','node_modules','site'].includes(item.name)) continue;
    const full=path.join(dir,item.name);
    if(item.isDirectory()) walk(full);
    else if(item.isFile()&&item.name==='index.html'){
      const rel=path.relative(root,full).split(path.sep).join('/');
      const html=fs.readFileSync(full,'utf8');
      const a=html.indexOf('<article class="article">');
      if(a<0 || rel==='faq/index.html' || system.schema.excludePaths.includes(rel)) continue;
      const e=outerArticleEnd(html,a);
      if(e<0){errors.push(rel+': article not closed');continue;}
      const article=html.slice(a,e);
      articles++;
      const toc=(article.match(/<!-- SLOT:TOC:START -->[\s\S]*?<!-- SLOT:TOC:END -->/g)||[]);
      const body=article.split('<!-- HOOK:ARTICLE_BEFORE_RELATED:START -->')[0].split('<!-- SLOT:RELATED:START -->')[0].split('<div class="faq-ai">')[0].split('<div class="contact-cta">')[0];
      const headingCount=(body.match(/<h[23]\b/gi)||[]).length;
      const hasH2=/<h2\b/i.test(body);
      const shouldToc=system.features.articleToc!==false&&headingCount>=2&&hasH2;
      if(toc.length!==(shouldToc?1:0)) errors.push(rel+': TOC count '+toc.length+' expected '+(shouldToc?1:0));
      if(/<nav\b[^>]*class="toc"/i.test(article)) errors.push(rel+': legacy static TOC remains');
      if(toc.length){
        tocPages++;
        if(!/<details class="toc-details">[\s\S]*?<summary>On this page<\/summary>/.test(toc[0]))
          errors.push(rel+': TOC is not collapsible');
        const firstH2=article.search(/<h2\b/i);
        if(firstH2<0||article.indexOf('<!-- SLOT:TOC:START -->')<firstH2)
          errors.push(rel+': TOC not placed after first H2');
        for(const x of toc[0].matchAll(/href="#([^"]+)"/g)){
          const id=x[1].replace(/&quot;/g,'"').replace(/&amp;/g,'&');
          if(!article.includes('id="'+id+'"'))errors.push(rel+': missing TOC target '+id);
        }
      }
      const relBlock=article.match(/<!-- SLOT:RELATED:START -->([\s\S]*?)<!-- SLOT:RELATED:END -->/);
      if(!relBlock) errors.push(rel+': related recommendations missing');
      if(relBlock){
        relatedPages++;
        const cards=[...relBlock[1].matchAll(/<a class="card"([^>]*)>/g)];
        if(!cards.length||cards.length>9) errors.push(rel+': invalid related card count '+cards.length);
        cards.forEach((card,i)=>{
          const hidden=/\bhidden\b/.test(card[1]);
          if(hidden!==(i>=3)) errors.push(rel+': wrong initial related visibility at '+i);
        });
        const controls=relBlock[1].includes('class="related-controls"');
        if(controls!==(cards.length>3)) errors.push(rel+': related pager missing/unnecessary');
        if(controls) paged++;
      }
    }
  }
}
walk(root);
if(errors.length){
  console.error('Article UI QA FAIL ('+errors.length+' errors)');
  errors.slice(0,30).forEach(e=>console.error('- '+e));
  if(errors.length>30) console.error('...and '+(errors.length-30)+' more');
  process.exit(1);
}
console.log('Article UI QA PASS: '+articles+' article pages; '+tocPages+' TOCs; '+relatedPages+' related sections; '+paged+' paginated.');
