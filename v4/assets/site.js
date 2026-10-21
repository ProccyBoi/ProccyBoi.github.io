/* Small, progressively enhanced UI. No graphics runtime, scroll hijacking or animation loop. */
(() => {
  'use strict';
  const $ = (s, r=document) => r.querySelector(s);
  const $$ = (s, r=document) => [...r.querySelectorAll(s)];
  const status = $('[data-status]');
  const tell = text => { if(status) status.textContent=text; };
  const menu = $('#navigation-dialog'), toggle=$('.menu-toggle');
  if(menu && toggle && typeof menu.showModal==='function') {
    toggle.hidden=false;
    const close=()=>menu.open&&menu.close();
    toggle.addEventListener('click',()=>{ if(menu.open) close(); else { menu.showModal();toggle.setAttribute('aria-expanded','true'); } });
    $('.menu-close',menu).addEventListener('click',close);
    menu.addEventListener('click',event=>{if(event.target.closest('a'))close();});
    menu.addEventListener('close',()=>toggle.setAttribute('aria-expanded','false'));
    const wide=matchMedia('(min-width:851px)');
    wide.addEventListener('change',e=>{if(e.matches)close();});
  }
  const form=$('.filters');
  if(form) {
    form.hidden=false;
    const cards=$$('[data-project]'), count=$('[data-count]'), empty=$('.no-results');
    const search=form.elements.q, category=form.elements.category;
    const apply=(write=true)=>{
      const query=search.value.trim().toLocaleLowerCase(), group=category.value;
      const tokens=query.split(/\s+/).filter(Boolean);
      let shown=0;
      cards.forEach(card=>{const ok=(!group||card.dataset.category===group)&&tokens.every(token=>card.dataset.search.includes(token));card.hidden=!ok;if(ok)shown++;});
      count.textContent=`${shown} ${shown===1?'project':'projects'}${query||group?' found':''}`;empty.hidden=shown>0;
      if(write){const url=new URL(location.href);query?url.searchParams.set('q',search.value.trim()):url.searchParams.delete('q');group?url.searchParams.set('category',group):url.searchParams.delete('category');history.replaceState(null,'',url);}
    };
    const restore=()=>{const p=new URLSearchParams(location.search);search.value=p.get('q')||'';category.value=p.get('category')||'';apply(false);};
    form.addEventListener('input',()=>apply());form.addEventListener('change',()=>apply());form.addEventListener('submit',e=>{e.preventDefault();apply();});
    form.addEventListener('reset',()=>{search.value='';category.value='';queueMicrotask(()=>apply());});
    addEventListener('popstate',restore);restore();
  }
  // Pointer movement updates only a composited transform, at most once per frame.
  // No animation continues after input, while offscreen, or in a background tab.
  const hero=$('.hero'), media=$('[data-hero-media]');
  if(hero && media) {
    const reduced=matchMedia('(prefers-reduced-motion: reduce)'), fine=matchMedia('(hover:hover) and (pointer:fine)');
    let visible=true, frame=0, x=0,y=0;
    const allowed=()=>!reduced.matches&&fine.matches&&!navigator.connection?.saveData&&!document.hidden&&visible;
    const reset=()=>{cancelAnimationFrame(frame);frame=0;media.style.removeProperty('--mx');media.style.removeProperty('--my');};
    const draw=()=>{frame=0;if(!allowed())return reset();media.style.setProperty('--mx',`${x.toFixed(2)}px`);media.style.setProperty('--my',`${y.toFixed(2)}px`);};
    hero.addEventListener('pointermove',event=>{if(!allowed())return;const r=hero.getBoundingClientRect();x=(event.clientX-r.left-r.width/2)/r.width*12;y=(event.clientY-r.top-r.height/2)/r.height*8;if(!frame)frame=requestAnimationFrame(draw);},{passive:true});
    hero.addEventListener('pointerleave',reset);
    reduced.addEventListener('change',reset);fine.addEventListener('change',reset);document.addEventListener('visibilitychange',reset);navigator.connection?.addEventListener?.('change',reset);
    if('IntersectionObserver' in window)new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;if(!visible)reset();}).observe(hero);
  }
  // Native-dialog image inspection: links still open their actual image without JS.
  const photos=$$('[data-gallery]');
  if(photos.length && typeof HTMLDialogElement!=='undefined' && 'showModal' in HTMLDialogElement.prototype) {
    const dialog=document.createElement('dialog');dialog.className='photo-dialog';dialog.setAttribute('aria-label','Project image viewer');
    dialog.innerHTML='<div class="photo-top"><span data-photo-counter></span><button type="button" data-photo-close aria-label="Close image viewer">Close ×</button></div><div class="photo-stage"><img alt=""></div><div class="photo-controls"><p class="photo-caption" aria-live="polite"></p><nav aria-label="Image navigation"><button type="button" data-photo-prev aria-label="Previous image">←</button><button type="button" data-photo-next aria-label="Next image">→</button></nav></div>';
    document.body.append(dialog);let index=0,trigger=null;
    const show=value=>{index=(value+photos.length)%photos.length;const source=$('img',photos[index]), img=$('.photo-stage img',dialog);img.src=photos[index].href;img.alt=source.alt;$('.photo-caption',dialog).textContent=source.alt;$('[data-photo-counter]',dialog).textContent=`${String(index+1).padStart(2,'0')} / ${String(photos.length).padStart(2,'0')}`;};
    photos.forEach((a,i)=>a.addEventListener('click',event=>{if(event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;event.preventDefault();trigger=a;show(i);dialog.showModal();}));
    $('[data-photo-close]',dialog).addEventListener('click',()=>dialog.close());
    $('[data-photo-prev]',dialog).addEventListener('click',()=>show(index-1));$('[data-photo-next]',dialog).addEventListener('click',()=>show(index+1));
    if(photos.length===1)$('.photo-controls nav',dialog).hidden=true;
    dialog.addEventListener('keydown',e=>{if(e.key==='ArrowRight'){e.preventDefault();show(index+1);}if(e.key==='ArrowLeft'){e.preventDefault();show(index-1);}});
    dialog.addEventListener('close',()=>{trigger?.focus({preventScroll:true});$('.photo-stage img',dialog).removeAttribute('src');});
  }
  const copy=$('[data-copy-email]');
  if(copy && navigator.clipboard?.writeText){copy.hidden=false;copy.addEventListener('click',async()=>{try{await navigator.clipboard.writeText('andrew.noah.chung@gmail.com');tell('Email address copied.');copy.firstChild.textContent='Email copied ';}catch{tell('Could not copy automatically. The email address is shown above.');}});}
})();
