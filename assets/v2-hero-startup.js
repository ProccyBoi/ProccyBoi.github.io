/* Fetch independent CAD resources while the document becomes interactive. */
(() => {
  'use strict';
  if (matchMedia('(prefers-reduced-motion: reduce)').matches || navigator.connection?.saveData) return;
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
  // Queue the renderer before geometry and silk share the connection, without
  // awaiting it or delaying the independent poster scene.
  loadScript('/assets/vendor/three.min.js').catch(() => {});
  loadScript('/assets/v2-hero-motion.js?v=mechanics-20261003').catch(() => {});
  loadScript('/assets/v2-hero-assets.js?v=startup-20261007').then(() => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches || navigator.connection?.saveData) return;
    ['tramtrace', 'telemetry', 'pi'].forEach(name => window.V2HeroAssets.prefetch(name).catch(() => {}));
  }).catch(() => {});
  loadScript('/assets/v2-hero-environment.js?v=startup-20261007').then(() => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches || navigator.connection?.saveData) return;
    window.V2HeroEnvironment.prefetch().catch(() => {});
  }).catch(() => {});
})();
