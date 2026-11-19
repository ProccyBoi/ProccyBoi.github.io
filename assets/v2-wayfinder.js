/* The phone header is a different arrangement of the same destinations.
   No thumbnails, project shelf, or modal exist until someone asks for Menu. */
(() => {
  'use strict';
  const header = document.querySelector('.v2-header'), primary = header?.querySelector('.v2-nav');
  if (!primary || !window.HTMLDialogElement?.prototype.showModal || !location.pathname.startsWith('/v2/')) return;
  const mobile = matchMedia('(max-width: 640px)');
  const root = document.documentElement;
  const sectionNav = document.querySelector('[data-v2-case-section-nav]');
  const originals = [...primary.querySelectorAll('a')];
  const nativeProject = originals.find(a => new URL(a.href).pathname === '/v2/projects/');
  if (!nativeProject) return;
  const current = location.pathname, listing = '/v2/projects/', marker = 'v2WayfinderOpen';
  // Local 300×180 derivatives of the existing project imagery: telemetry
  // hero, Kiku hero, Metroboard's illuminated board, and the TramTrace hero.
  const shelf = [
    ['skylabs', 'Telemetry', 'skylabs/boards/telemetry/'],
    ['kiku', 'Kiku', 'kiku/'],
    ['metroboard', 'Metroboard', 'metroboard/'],
    ['tramtrace', 'TramTrace', 'tramtrace/']
  ];
  const icons = {
    home:'M3.5 10 12 3.5l8.5 6.5M6 9v10h4v-5h4v5h4V9',
    projects:'M3.5 5.5h17v13h-17zM7 9h3v3h4v3h3M7 15h1',
    menu:'M3.5 7.5h17m-17 8h11',
    close:'m6 6 12 12M18 6 6 18'
  };
  const node = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text) n.textContent = text;
    return n;
  };
  const icon = name => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg','svg');
    svg.setAttribute('viewBox','0 0 24 24'); svg.setAttribute('aria-hidden','true');
    const path = document.createElementNS(svg.namespaceURI,'path');
    path.setAttribute('d',icons[name]); svg.append(path); return svg;
  };
  const link = (label, href, cls) => {
    const n = node('a',cls,label); n.href = href; return n;
  };
  // Restore only the catalogue this visitor actually came from. No persistent
  // search history and no query copied to an unrelated page or host.
  const collectionURL = () => {
    let prior;
    if (current === listing) prior = new URL(location.href);
    else if (current.startsWith(listing) && document.referrer) {
      const ref = new URL(document.referrer);
      if (ref.origin === location.origin && ref.pathname === listing) prior = ref;
    }
    const result = new URL(listing, location.origin);
    if (prior) for (const key of ['q','category']) {
      const value = prior.searchParams.get(key);
      if (value) result.searchParams.set(key,value);
    }
    return result.pathname + result.search + '#collection';
  };
  let rail, home, projects, trigger, sheet, close, panelTitle, pending, historyEntry = false;
  const hasMarker = () => history.state?.[marker] === true;
  const stripMarker = () => { if (hasMarker()) { const state = {...history.state}; delete state[marker]; history.replaceState(state,''); } };
  const makeRail = () => {
    rail = node('nav','v2-waybar'); rail.setAttribute('aria-label','Primary navigation');
    home = link('Home','/v2/'); home.prepend(icon('home'));
    projects = link('Projects',collectionURL()); projects.prepend(icon('projects'));
    for (const type of ['focus','pointerdown','click']) projects.addEventListener(type,() => projects.href = collectionURL());
    trigger = node('button','','Menu'); trigger.type='button'; trigger.dataset.wayMenu='';
    trigger.setAttribute('aria-haspopup','dialog'); trigger.setAttribute('aria-expanded','false');
    trigger.prepend(icon('menu')); trigger.addEventListener('click',open);
    if (current === '/v2/') home.setAttribute('aria-current','page');
    else if (current.startsWith(listing)) projects.setAttribute('aria-current',current === listing ? 'page' : 'location');
    else trigger.dataset.current='';
    rail.append(home,projects,trigger); header.before(rail);
  };
  function makeSheet() {
    sheet = node('dialog','v2-way-sheet'); sheet.id='v2-way-sheet';
    sheet.setAttribute('aria-label','Portfolio menu'); trigger.setAttribute('aria-controls',sheet.id);
    const body=node('div','v2-way-body'), foot=node('div','v2-way-foot');
    const sections=[...(sectionNav?.querySelectorAll('[data-v2-section]') || [])];
    if (sections.length) {
      body.append(node('p','v2-way-eyebrow','On this page'));
      panelTitle=node('h2','v2-way-title',sectionNav.querySelector('.v2-case-nav-title')?.textContent || 'Sections');
      body.append(panelTitle);
      const group=node('nav','v2-way-sections'); group.setAttribute('aria-label','Case study sections');
      for(const original of sections){
        const item=link(original.textContent.trim(),original.href);
        item.dataset.location = new URL(original.href).hash;
        group.append(item);
      }
      body.append(group);
    }
    const shelfHeading=node(sections.length?'h3':'h2',sections.length?'v2-way-eyebrow':'v2-way-title','Selected hardware');
    if(!sections.length){body.append(node('p','v2-way-eyebrow','Andrew Chung'));panelTitle=shelfHeading;}
    body.append(shelfHeading);
    const builds=node('nav','v2-way-projects');builds.setAttribute('aria-label','Selected hardware');
    for (const [key,name,slug] of shelf.filter(([, ,slug]) => current !== listing+slug).slice(0,3)) {
      const a=link('',listing+slug,'v2-way-project'), img=node('img');
      img.alt=''; img.width=300; img.height=180; img.decoding='async';
      img.src='/assets/images/v2/wayfinder/'+key+'.webp';
      a.append(img,node('span','',name));builds.append(a);
    }
    body.append(builds);
    const more=node('nav','v2-way-more');more.setAttribute('aria-label','Portfolio information');
    for (const original of originals.filter(a=>a!==nativeProject)) {
      const url=new URL(original.href);
      const a=link(original.textContent.replace(/↗/g,'').trim(),url.pathname+url.search+url.hash);
      if(url.pathname===current && (url.hash ? url.hash===location.hash : !location.hash))a.setAttribute('aria-current','page');
      more.append(a);
    }
    body.append(more);
    const all=link('All projects',collectionURL(),'v2-way-all');all.append(node('span','','→'));
    all.lastElementChild.setAttribute('aria-hidden','true');
    close=node('button','','Close');close.type='button';close.dataset.wayClose='';close.prepend(icon('close'));
    close.addEventListener('click',()=>dismiss());
    foot.append(all,close);sheet.append(body,foot);document.body.append(sheet);
    panelTitle.tabIndex=-1;
    sheet.addEventListener('cancel',e=>{e.preventDefault();dismiss();});
    sheet.addEventListener('pointerdown',e=>{if(e.target===sheet && outsideSheet(e))sheet.dataset.outside='';});
    sheet.addEventListener('click',e=>{
      if (sheet.hasAttribute('data-outside')){
        delete sheet.dataset.outside;
        if(e.target===sheet && outsideSheet(e)){dismiss();return;}
      }
      const a=e.target.closest('a');
      if(!a || e.button!==0 || e.metaKey || e.ctrlKey || e.altKey || e.shiftKey)return;
      e.preventDefault();
      const url=new URL(a.href);
      const local=url.pathname===current && url.origin===location.origin && url.search===location.search && url.hash;
      dismiss(()=>{
        location.assign(url.href);
        if(local)requestAnimationFrame(()=>{
          const target=document.getElementById(decodeURIComponent(url.hash.slice(1)));
          if(target){
            if(!target.hasAttribute('tabindex'))target.tabIndex=-1;
            target.focus({preventScroll:true});
            target.scrollIntoView({block:'start',behavior:'instant'});
          }
        });
      });
    });
  }
  function outsideSheet(e){
    const b=sheet.getBoundingClientRect();return e.clientY<b.top || e.clientX<b.left || e.clientX>b.right || e.clientY>b.bottom;
  }
  function open(){
    if(!mobile.matches || pending || sheet?.open)return;
    if(!sheet)makeSheet();
    sheet.querySelector('.v2-way-all').href=collectionURL();
    // The wide header's scrollspy observes its own sticky bar. On a phone,
    // use the real reading area instead (including a freshly followed hash).
    const items=[...sheet.querySelectorAll('[data-location]')];
    const markerY=Math.min(180,innerHeight*.24);
    let hash=items[0]?.dataset.location;
    for(const a of items){
      const target=document.getElementById(a.dataset.location.slice(1));
      if(target && target.getBoundingClientRect().top<=markerY)hash=a.dataset.location;
    }
    for(const a of items){
      if(a.dataset.location===hash)a.setAttribute('aria-current','location');else a.removeAttribute('aria-current');
    }
    sheet.showModal(); trigger.setAttribute('aria-expanded','true');
    sheet.querySelector('.v2-way-body').scrollTop=0;
    panelTitle.focus({preventScroll:true});
    if(!hasMarker()) {try{history.pushState({...history.state,[marker]:true},'');historyEntry=true;}catch{/* Native close is still available. */}}
  }
  function shut(){
    if(sheet?.open)sheet.close();
    trigger?.setAttribute('aria-expanded','false');
  }
  function dismiss(next){
    if(!sheet?.open || pending)return;
    shut();
    if(historyEntry && hasMarker()){pending=next || (()=>{});historyEntry=false;history.back();}
    else {historyEntry=false;next?.();}
  }
  addEventListener('popstate',()=>{
    shut();historyEntry=false;stripMarker();
    const next=pending;pending=null;
    // Native session-history restoration runs *after* popstate listeners. Do
    // not start a new fragment navigation until it has restored scroll/focus.
    if(next)setTimeout(next,0);
  });
  // A restored document is never left with a sheet or scroll-lock covering it.
  addEventListener('pageshow',()=>{if(!pending){shut();stripMarker();historyEntry=false;}});
  // Browsers may blur a focused control as CSS crosses the breakpoint. Keep
  // its identity only while that navigation, rather than the page, owns focus.
  let owned=null;
  document.addEventListener('focusin',e=>{
    if(e.target!==document.body && e.target!==root)
      owned=header.contains(e.target)||rail?.contains(e.target)||sheet?.contains(e.target)?e.target:null;
  });
  document.addEventListener('pointerdown',e=>{
    if(!header.contains(e.target)&&!rail?.contains(e.target)&&!sheet?.contains(e.target))owned=null;
  },{passive:true});
  addEventListener('blur',()=>{owned=null;});
  function sync(){
    const last=owned;
    if(mobile.matches){
      if(!getComputedStyle(root).getPropertyValue('--wayfinder-css').trim())return;
      if(!rail)makeRail();
      root.setAttribute('data-v2-way','');
      if(last && header.contains(last)){
        const target=last===header.querySelector('.v2-brand')?home:last===nativeProject?projects:trigger;
        target.focus({preventScroll:true});
      }
    } else {
      if(sheet?.open)dismiss();
      root.removeAttribute('data-v2-way');
      if(last && (rail?.contains(last)||sheet?.contains(last))){
        const match=last.href && originals.find(a=>a.pathname===last.pathname && a.hash===last.hash);
        const target=last===home ? header.querySelector('.v2-brand') : match || nativeProject;
        target.focus({preventScroll:true});
      }
    }
  }
  mobile.addEventListener('change',sync);sync();
})();
