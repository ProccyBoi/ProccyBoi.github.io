/* Prepare the hero only when it is near the visitor's reading position. */
(() => {
  'use strict';
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const compact = matchMedia('(max-height: 620px), (max-width: 900px) and (max-height: 700px)');
  const allowed = () => !reduced.matches && !compact.matches && !navigator.connection?.saveData;
  const models = Object.freeze(['tramtrace', 'dash', 'pi']);
  const waiters = new Set();
  let started = false;
  // Fragment scrolling happens after deferred scripts. Do not mistake the
  // initial pre-scroll position for interest in the hero on a direct link.
  const initialHash = location.hash;
  const destination = initialHash && document.getElementById(initialHash.slice(1));
  let navigationPending = Boolean(destination && !document.querySelector('[data-assembly]')?.contains(destination));
  let restoringNavigation = false;
  const eligible = () => {
    const hero = document.querySelector('[data-assembly]');
    if (!hero || navigationPending || document.hidden || !allowed()) return false;
    const bounds = hero.getBoundingClientRect();
    // Overview anchors leave a thin tail of the hero beneath the fixed header.
    // Returning upward must reveal useful hero space before waking its CAD.
    return bounds.top < innerHeight + 320 && bounds.bottom > Math.min(240, innerHeight * .25);
  };
  window.V2HeroStartup = Object.freeze({ models, eligible, hasStarted: () => started,
    whenEligible: () => eligible() ? Promise.resolve() : new Promise(resolve => waiters.add(resolve)) });
  const pending = window.V2HeroScripts ||= new Map();
  const loadScript = source => {
    if (!pending.has(source)) {
      const request = new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = source; script.async = true;
        script.onload = resolve; script.onerror = reject;
        document.head.append(script);
      }).catch(error => { pending.delete(source); throw error; });
      pending.set(source, request);
    }
    return pending.get(source);
  };
  const prepare = () => {
    if (!eligible()) return;
    waiters.forEach(resolve => resolve()); waiters.clear();
    if (started) return;
    started = true;
    loadScript('/assets/vendor/three.min.js').catch(() => {});
    loadScript('/assets/v2-hero-motion.js?v=dash-20261028').catch(() => {});
    loadScript('/assets/v2-hero-assets.js?v=dash-20261028').then(() => {
      if (eligible()) models.forEach(name => window.V2HeroAssets.prefetch(name).catch(() => {}));
    }).catch(() => {});
    loadScript('/assets/v2-hero-environment.js?v=load-20261012').then(() => {
      if (eligible()) window.V2HeroEnvironment.prefetch().catch(() => {});
    }).catch(error => window.V2TransportPriority?.settle('environment', error));
  };
  const afterNavigation = () => {
    if (restoringNavigation) return;
    if (navigationPending && location.hash === initialHash) {
      // Native fragment scrolling can still be in flight at load/pageshow.
      // Resolve against the completed document before allowing hero layout
      // expansion to move a destination that the visitor has not reached yet.
      restoringNavigation = true;
      document.getElementById(initialHash.slice(1))?.scrollIntoView({ behavior: 'instant', block: 'start' });
      requestAnimationFrame(() => { restoringNavigation = false; navigationPending = false; prepare(); });
      return;
    }
    navigationPending = false; prepare();
  };
  if (document.readyState === 'complete') requestAnimationFrame(afterNavigation);
  else addEventListener('load', afterNavigation, { once: true });
  addEventListener('scroll', prepare, { passive: true });
  addEventListener('resize', prepare, { passive: true });
  addEventListener('pageshow', afterNavigation);
  addEventListener('hashchange', () => requestAnimationFrame(afterNavigation));
  document.addEventListener('visibilitychange', prepare);
  reduced.addEventListener?.('change', prepare);
  compact.addEventListener?.('change', prepare);
  navigator.connection?.addEventListener?.('change', prepare);
  if ('IntersectionObserver' in window) {
    const hero = document.querySelector('[data-assembly]');
    if (hero) new IntersectionObserver(prepare, { rootMargin: '320px 0px' }).observe(hero);
  }
  prepare();
})();
