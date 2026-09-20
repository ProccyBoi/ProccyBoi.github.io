/* Finite, interruptible choreography. No scroll interception or hidden-content
 * prerequisite: unsupported browsers and reduced motion get the full document. */
(() => {
  'use strict';
  const preference = matchMedia('(prefers-reduced-motion: reduce)');
  const finePointer = matchMedia('(hover: hover) and (pointer: fine)');
  const running = new Map();
  const seen = new WeakSet();
  let entrancePlayed = false;
  const ease = 'cubic-bezier(.16,1,.3,1)';
  const animate = (element, frames, options = {}) => {
    if (!element || preference.matches || !element.animate) return;
    running.get(element)?.cancel();
    const animation = element.animate(frames, {duration:850, easing:ease, fill:'both', ...options});
    running.set(element, animation);
    animation.finished.then(() => {
      if (running.get(element) === animation) { running.delete(element); animation.cancel(); }
    }).catch(() => { /* Replaced animations are intentionally cancelled. */ });
  };
  const fadeUp = (element, delay = 0) => animate(element, [
    {opacity:0, transform:'translate3d(0,28px,0)'},
    {opacity:1, transform:'translate3d(0,0,0)'}
  ], {delay});

  const hero = document.querySelector('.v2-hero');
  const heroObject = document.querySelector('.v2-hero-object');
  const enter = () => {
    if (entrancePlayed || preference.matches) return;
    entrancePlayed = true;
    document.querySelectorAll('.v2-hero-line > span').forEach((line, index) => animate(line, [
      {transform:'translate3d(0,108%,0) rotateZ(2deg)', opacity:.3},
      {transform:'translate3d(0,0,0) rotateZ(0)', opacity:1}
    ], {duration:1100, delay:100 + index*115}));
    fadeUp(document.querySelector('.v2-hero-copy .v2-eyebrow'), 30);
    fadeUp(document.querySelector('.v2-hero-description'), 370);
    fadeUp(document.querySelector('.v2-hero .v2-actions'), 490);
    animate(document.querySelector('[data-cad-poster]'), [
      {transform:'translate3d(15px,56px,0) rotateZ(-9deg) scale(.85)', opacity:0},
      {transform:'translate3d(0,0,0) rotateZ(0deg) scale(1)', opacity:1}
    ], {duration:1400, delay:160});
    fadeUp(document.querySelector('.v2-hero-object figcaption'), 650);
    fadeUp(document.querySelector('.v2-object-controls'), 700);
    // Interior routes use the same cadence without changing their reading order.
    document.querySelectorAll('.v2-case .project-hero-copy, .v2-about .about-hero-copy, .v2-collection-hero > div').forEach(element => fadeUp(element, 60));
    document.querySelectorAll('.v2-case .project-hero-media').forEach(element => animate(element, [
      {opacity:0, transform:'translate3d(35px,32px,0) scale(.96)'},
      {opacity:1, transform:'translate3d(0,0,0) scale(1)'}
    ], {duration:1200, delay:120}));
  };
  enter();

  const revealTargets = [...document.querySelectorAll([
    '.v2-intro > div', '.v2-section-heading', '.v2-feature', '.v2-small-project',
    '.v2-about-preview > div', '.v2-contact .v2-shell',
    '.v2-case .engineering-brief > div', '.v2-case .project-summary',
    '.v2-case .project-gallery figure', '.v2-continue',
    '.v2-collection .catalog-card', '.v2-about .timeline-item'
  ].join(','))];
  let revealObserver;
  if ('IntersectionObserver' in window) {
    revealObserver = new IntersectionObserver(entries => {
      const entering = entries.filter(entry => entry.isIntersecting && !seen.has(entry.target));
      entering.forEach((entry, index) => {
        seen.add(entry.target);
        revealObserver.unobserve(entry.target);
        // Never re-hide a section restored in the middle of the viewport.
        if (entry.boundingClientRect.top > innerHeight*.15) fadeUp(entry.target, Math.min(index,2)*90);
      });
    }, {threshold:.09});
    revealTargets.forEach(element => revealObserver.observe(element));
  }

  let frame = 0, heroVisible = Boolean(hero), heroObserver;
  const updateHero = () => {
    frame = 0;
    if (!hero || !heroObject || preference.matches || !heroVisible || document.hidden) return;
    const rect = hero.getBoundingClientRect();
    const progress = Math.max(0, Math.min(1, -rect.top / Math.max(rect.height,1)));
    const amount = innerWidth > 760 ? 85 : 28;
    heroObject.style.setProperty('--hero-drift', `${(progress*amount).toFixed(2)}px`);
    heroObject.style.setProperty('--hero-turn', `${(progress*7).toFixed(2)}deg`);
    heroObject.style.setProperty('--hero-rule', String(1-progress*.35));
  };
  const requestHero = () => {
    if (hero && heroVisible && !frame && !preference.matches && !document.hidden) frame=requestAnimationFrame(updateHero);
  };
  if (hero && 'IntersectionObserver' in window) {
    heroObserver = new IntersectionObserver(([entry]) => { heroVisible=entry.isIntersecting; requestHero(); });
    heroObserver.observe(hero);
    addEventListener('scroll', requestHero, {passive:true});
    addEventListener('resize', requestHero);
    document.addEventListener('visibilitychange', requestHero);
  }
  document.querySelectorAll('.v2-feature').forEach(card => {
    let pointerFrame = 0, pointer;
    const reset = () => {
      cancelAnimationFrame(pointerFrame); pointerFrame=0;
      card.style.setProperty('--card-x','0px'); card.style.setProperty('--card-y','0px'); card.style.setProperty('--card-scale','1');
    };
    card.addEventListener('pointermove', event => {
      if (preference.matches || !finePointer.matches) return;
      pointer = {x:event.clientX,y:event.clientY};
      if (pointerFrame) return;
      pointerFrame=requestAnimationFrame(() => {
        pointerFrame=0;
        const rect=card.getBoundingClientRect();
        const x=(pointer.x-rect.left)/rect.width, y=(pointer.y-rect.top)/rect.height;
        card.style.setProperty('--card-x',`${(x-.5)*10}px`);
        card.style.setProperty('--card-y',`${(y-.5)*8}px`);
        card.style.setProperty('--card-scale','1.025');
        card.style.setProperty('--card-light-x',`${x*100}%`);
        card.style.setProperty('--card-light-y',`${y*100}%`);
      });
    }, {passive:true});
    card.addEventListener('pointerleave', reset);
    preference.addEventListener('change', reset);
  });
  // Content changes first; animation is only a visual response to that change.
  document.addEventListener('v2:system-change', event => {
    const root=event.target;
    fadeUp(root.querySelector('.v2-system-detail'), 0);
    if (event.detail?.project) root.querySelectorAll('[data-system-step]').forEach((step,index) => animate(step, [
      {opacity:.25,transform:'translate3d(0,15px,0)'}, {opacity:1,transform:'translate3d(0,0,0)'}
    ],{duration:500,delay:index*70}));
  });
  preference.addEventListener('change', () => {
    if (preference.matches) {
      running.forEach(animation=>animation.cancel()); running.clear();
      cancelAnimationFrame(frame); frame=0;
      heroObject?.style.removeProperty('--hero-drift'); heroObject?.style.removeProperty('--hero-turn');
    } else requestHero();
  });
  addEventListener('pagehide',()=>{
    running.forEach(animation=>animation.cancel()); running.clear();
    cancelAnimationFrame(frame); frame=0;
  });
})();
