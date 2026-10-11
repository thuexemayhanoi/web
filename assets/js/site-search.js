/* Lightweight on-demand search over the published article catalog. */
(function(){
  "use strict";
  var trigger=document.querySelector(".site-search-trigger");
  var overlay=document.getElementById("site-search-panel");
  if(!trigger||!overlay)return;
  var close=overlay.querySelector(".site-search-close");
  var input=document.getElementById("site-search-input");
  var results=document.getElementById("site-search-results");
  var status=document.getElementById("site-search-status");
  var index=null,loading=null,delay=0;
  var norm=function(s){return String(s||"").toLowerCase().normalize("NFD")
    .replace(/[\u0300-\u036f]/g,"").replace(/đ/g,"d").replace(/\s+/g," ").trim();};
  function setStatus(s){status.textContent=s;}
  function loadIndex(){
    if(index)return Promise.resolve(index);
    if(loading)return loading;
    loading=fetch("/assets/search/article-index.json",{credentials:"same-origin"})
      .then(function(r){if(!r.ok)throw Error("Search index unavailable");return r.json();})
      .then(function(data){if(!data||!Array.isArray(data.e))throw Error("Invalid search index");index=data.e;return index;})
      .catch(function(e){loading=null;throw e;});
    return loading;
  }
  function score(entry,query,words){
    var title=norm(entry.t),keyword=norm(entry.k),headings=norm(entry.h),description=norm(entry.d);
    var bag=title+" "+keyword+" "+headings+" "+description;
    if(!words.every(function(w){return bag.indexOf(w)!==-1;}))return 0;
    var n=1;
    if(title.indexOf(query)!==-1)n+=35;
    if(keyword.indexOf(query)!==-1)n+=25;
    if(headings.indexOf(query)!==-1)n+=10;
    words.forEach(function(w){
      if(title.indexOf(w)!==-1)n+=9;
      if(keyword.indexOf(w)!==-1)n+=7;
      if(headings.indexOf(w)!==-1)n+=3;
    });
    return n;
  }
  function show(query){
    results.replaceChildren();
    var q=norm(query);
    if(q.length<2){setStatus("Type at least 2 characters to find an article.");return;}
    if(!index){setStatus("Loading article catalog…");return;}
    var words=q.split(" ").filter(Boolean);
    var hits=index.map(function(entry){return {entry:entry,score:score(entry,q,words)};})
      .filter(function(x){return x.score>0;})
      .sort(function(a,b){return b.score-a.score || a.entry.t.localeCompare(b.entry.t);});
    setStatus(hits.length?hits.length+" matching articles. Showing up to 12.":"No matching articles. Try a different keyword.");
    hits.slice(0,12).forEach(function(hit){
      var a=document.createElement("a");
      a.className="site-search-result";
      a.href=hit.entry.u;
      var title=document.createElement("strong");title.textContent=hit.entry.t;
      var desc=document.createElement("span");desc.textContent=hit.entry.d||hit.entry.k||"Read this guide";
      a.append(title,desc);results.appendChild(a);
    });
  }
  function open(){
    overlay.hidden=false;
    trigger.setAttribute("aria-expanded","true");
    input.focus();
    setStatus("Loading article catalog…");
    loadIndex().then(function(){if(!overlay.hidden)show(input.value);})
      .catch(function(){if(!overlay.hidden)setStatus("Search is temporarily unavailable. Please try again.");});
  }
  function dismiss(){
    overlay.hidden=true;
    trigger.setAttribute("aria-expanded","false");
    clearTimeout(delay);
    trigger.focus();
  }
  trigger.addEventListener("click",function(){overlay.hidden?open():dismiss();});
  close.addEventListener("click",dismiss);
  overlay.addEventListener("click",function(e){if(e.target===overlay)dismiss();});
  document.addEventListener("keydown",function(e){
    if(overlay.hidden)return;
    if(e.key==="Escape"){e.preventDefault();dismiss();return;}
    if(e.key==="Tab"){
      var all=Array.prototype.slice.call(overlay.querySelectorAll("button,input,a[href]"));
      if(!all.length)return;
      var first=all[0],last=all[all.length-1];
      if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}
      else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}
    }
  });
  input.addEventListener("input",function(){
    clearTimeout(delay);
    delay=setTimeout(function(){show(input.value);},130);
  });
})();
