/* Prepare the hero only when it is near the visitor's reading position. */
(() => {
  'use strict';
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const compact = matchMedia('(max-height: 620px), (max-width: 900px) and (max-height: 700px)');
  const allowed = () => !reduced.matches && !compact.matches && !navigator.connection?.saveData;
  const models = Object.freeze(['tramtrace', 'dash', 'pi']);
  // Generated with the loader's exact source pack fingerprints.
  const packRevisions = Object.freeze({"tramtrace":"5466a5040ff8","dash":"40b4955b9a1f","pi":"19949162fef2","telemetry":"b63e3029ff92"});
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
  const responses = window.V2HeroResponses ||= new Map();
  const fetchEarly = (url, gate) => {
    if (responses.has(url)) return;
    // Fetch exact eventual URLs during the helper round trip. The helper takes
    // this same Response, so there is one request and one decompression pass.
    const response = gate ? gate.then(() => fetch(url)) : fetch(url);
    response.catch(() => {}); responses.set(url, response);
  };
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
    loadScript('/assets/v2-hero-assets.js?v=speed-20261029').then(() => {
      if (eligible()) models.forEach(name => window.V2HeroAssets.prefetch(name).catch(() => {}));
    }).catch(() => {});
    loadScript('/assets/v2-hero-environment.js?v=speed-20261029').then(() => {
      if (eligible()) window.V2HeroEnvironment.prefetch().catch(() => {});
    }).catch(error => window.V2TransportPriority?.settle('environment', error));
    const gate = window.V2TransportPriority?.wait('hero');
    const extension = window.DecompressionStream ? '.idx.bin.gz' : '.bin';
    fetchEarly('/assets/models/hero/tramtrace' + extension + '?h=' + packRevisions.tramtrace, gate);
    fetchEarly('/assets/models/hero/dash' + extension + '?v=device-20261028&h=' + packRevisions.dash, gate);
    fetchEarly('/assets/models/hero/pi' + extension + '?v=mechanics-20261003&h=' + packRevisions.pi, gate);
    fetchEarly('/assets/models/hero/environment.bin' + (window.DecompressionStream ? '.gz' : '') + '?v=product-20261007');
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
