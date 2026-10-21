/* v3-only progressive WebGPU entry. The r128 renderer remains an explicit,
 * locally isolated fallback; this module never assigns or modifies THREE. */
(() => {
  'use strict';
  const root = document.querySelector('[data-aircraft-hero]');
  if (!root || window.V3WebGPU) return;
  const requested = new URLSearchParams(location.search).get('renderer') || 'auto';
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const short = matchMedia('(max-height:600px)');
  const allowed = () => !reduced.matches && !short.matches && !navigator.connection?.saveData;
  const diagnostics = window.V3WebGPU = {
    version: 'v3-webgpu-20261019', requested, state: 'deferred', backend: 'none',
    ready: false, initialized: false, submittedFrames: 0, completedFrames: 0,
    frames: 0, rendererRevision: null, adapter: null, adapterClass: 'unknown',
    fallbackReason: null, completionEvidence: null,
    snapshot() { return {...this, snapshot:undefined}; }
  };
  Object.assign(root.dataset, {webgpuState:'deferred', webgpuBackend:'none', webgpuReady:'false', webgpuRequested:requested});
  let started = false, fallbackStarted = false, controller, observer, device;
  const reason = error => String(error?.message || error || 'WebGPU unavailable').slice(0,800);
  const publish = () => {
    root.dataset.webgpuState = diagnostics.state;
    root.dataset.webgpuBackend = diagnostics.backend;
    root.dataset.webgpuReady = String(diagnostics.ready);
    root.dataset.webgpuFallbackReason = diagnostics.fallbackReason || '';
    root.dataset.webgpuAdapterClass = diagnostics.adapterClass;
  };
  async function fallback(error) {
    if (fallbackStarted) return;
    fallbackStarted = true; observer?.disconnect(); observer = null;
    diagnostics.ready = false; diagnostics.state = 'fallback-loading';
    diagnostics.backend = 'legacy-pending'; diagnostics.fallbackReason = reason(error);
    root.classList.remove('is-ready');
    try {controller?.dispose();} catch (_) { /* Context may already be lost. */ }
    try {device?.destroy();} catch (_) { /* Externally supplied device belongs to this loader. */ }
    controller = null; device = null;
    // A canvas cannot change its acquired context type. Restore a clean canvas
    // before the unmodified legacy renderer asks for WebGL.
    const canvas = root.querySelector('canvas');
    const replacement = canvas.cloneNode(false); replacement.style.visibility = '';
    canvas.replaceWith(replacement);
    publish();
    const legacyState = new MutationObserver(() => {
      diagnostics.ready = root.classList.contains('is-ready');
      diagnostics.backend = diagnostics.ready ? 'webgl' : ['static','unavailable'].includes(root.dataset.aircraftState) ? 'static' : 'legacy-pending';
      diagnostics.state = diagnostics.ready ? 'legacy-ready' : root.dataset.aircraftState || 'fallback-loading';
      diagnostics.frames = Number(root.dataset.aircraftFrames || 0);
      diagnostics.rendererRevision = diagnostics.ready ? '128' : null;
      diagnostics.completionEvidence = diagnostics.ready ? root.dataset.aircraftLiveCompletionEvidence || 'legacy-render' : null;
      publish();
    });
    legacyState.observe(root, {attributes:true, attributeFilter:['class','data-aircraft-state','data-aircraft-frames']});
    const script = document.createElement('script');
    script.src = '/v3/assets/webgpu/legacy-aircraft-hero.js?v=webgpu-20261019';
    script.onerror = () => {diagnostics.state='static'; diagnostics.backend='static'; diagnostics.fallbackReason += '; legacy script unavailable'; publish();};
    document.head.append(script);
  }
  async function start() {
    if (started || fallbackStarted || !allowed()) return;
    started = true; observer?.disconnect(); observer = null;
    diagnostics.state = 'requesting-adapter'; publish();
    try {
      const adapter = await navigator.gpu.requestAdapter({powerPreference:'high-performance'});
      if (!adapter) throw new Error('No WebGPU adapter');
      const info = adapter.info || (adapter.requestAdapterInfo ? await adapter.requestAdapterInfo() : {});
      diagnostics.adapter = {vendor:info.vendor || '', architecture:info.architecture || '', device:info.device || '', description:info.description || '', isFallbackAdapter:Boolean(adapter.isFallbackAdapter || info.isFallbackAdapter)};
      const description = Object.values(diagnostics.adapter).join(' ');
      diagnostics.adapterClass = diagnostics.adapter.isFallbackAdapter || /swiftshader|llvmpipe|software|lavapipe/i.test(description) ? 'software' : info.vendor || info.device || info.description ? 'hardware-reported' : 'unknown';
      diagnostics.state = 'loading-module'; publish();
      // Feature detection happens before the modern renderer/module payload.
      const module = await import('./webgpu/aircraft-controller.js?v=20261019');
      if (!allowed()) {started = false; diagnostics.ready = false; diagnostics.backend = 'static'; diagnostics.state = 'static-preferences'; publish(); return;}
      const features = [...adapter.features].filter(value => ['core-features-and-limits','float32-filterable','float32-blendable','texture-compression-bc','texture-compression-etc2','texture-compression-astc'].includes(value));
      device = await adapter.requestDevice({label:'v3 isolated aircraft',requiredFeatures:features});
      if (!allowed()) {
        device.destroy(); device = null; started = false;
        diagnostics.ready = false; diagnostics.backend = 'static'; diagnostics.state = 'static-preferences'; publish(); return;
      }
      diagnostics.state = 'initializing'; publish();
      controller = module.mount({adapter, device, diagnostic:diagnostics, onFailure:fallback});
    } catch (error) { fallback(error); }
  }
  const near = () => {const bounds=root.getBoundingClientRect(); return bounds.top < innerHeight + 720 && bounds.bottom > -720;};
  function schedule() {
    if (!allowed()) {diagnostics.ready=false; diagnostics.state='static-preferences'; diagnostics.backend='static'; publish(); return;}
    if (requested === 'webgl') {fallback('Forced legacy WebGL comparison'); return;}
    if (!isSecureContext || !navigator.gpu) {fallback(!isSecureContext ? 'WebGPU requires a secure context' : 'WebGPU API unavailable'); return;}
    if (near() || /^#skylabs-(aircraft|telemetry)$/.test(location.hash)) start();
    else if (!observer && 'IntersectionObserver' in window) {
      observer = new IntersectionObserver(entries => {if(entries.some(entry=>entry.isIntersecting))start();}, {rootMargin:'720px 0px'});
      observer.observe(root);
    }
  }
  reduced.addEventListener('change', schedule); short.addEventListener('change', schedule);
  navigator.connection?.addEventListener?.('change', schedule);
  addEventListener('hashchange', schedule);
  if (!('IntersectionObserver' in window)) addEventListener('scroll',schedule,{passive:true});
  schedule();
})();
