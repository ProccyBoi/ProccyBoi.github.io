/* Fetch independent CAD resources while the document becomes interactive. */
(() => {
  'use strict';
  const allowed = () => !matchMedia('(prefers-reduced-motion: reduce)').matches &&
    !matchMedia('(max-height: 620px), (max-width: 900px) and (max-height: 700px)').matches &&
    !navigator.connection?.saveData;
  if (!allowed()) return;
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
  loadScript('/assets/v2-hero-assets.js?v=load-20261012').then(() => {
    if (!allowed()) return;
    // All visible boards prepare together; no model waits for another model's
    // transfer or shader compilation. The poster scene is already interactive.
    ['tramtrace', 'telemetry', 'pi'].forEach(name => window.V2HeroAssets.prefetch(name).catch(() => {}));
  }).catch(error => window.V2TransportPriority?.settle('telemetry', error));
  loadScript('/assets/v2-hero-environment.js?v=load-20261012').then(() => {
    if (!allowed()) return;
    window.V2HeroEnvironment.prefetch().catch(() => {});
  }).catch(error => window.V2TransportPriority?.settle('environment', error));
})();
