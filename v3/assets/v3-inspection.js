/* V3-only, intent-loaded inspection of the existing Kiku source image.
 * WebGPU samples the original image pixels; Canvas2D preserves the same view.
 * There is no animation loop: each user change requests at most one frame. */
(() => {
  'use strict';
  if (!/^\/v3(?:\/|$)/.test(location.pathname) || window.V3Inspection) return;
  const card = document.querySelector('.v2-project-card.is-featured[href="/v3/projects/kiku/"]');
  const source = card?.querySelector('.v2-project-image img');
  if (!source || typeof HTMLDialogElement === 'undefined' || !HTMLDialogElement.prototype.showModal) return;

  const requested = new URLSearchParams(location.search).get('renderer') || 'auto';
  const forceCanvas = requested === 'webgl';
  const state = { backend: 'idle', readiness: 'idle', renderedFrames: 0, open: false, zoom: 2.5, x: .48, y: .49, lastBackend: null, adapterClass: 'unknown', fallbackReason: null };
  let renderer = null, frame = 0, epoch = 0, startupTimer = 0, observer = null, returnFocus = null, oldOverflow = '', oldPadding = '';
  let imageReady = false, touchStart = null, backgroundPointerDown = false;
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

  // The action is a sibling of the unchanged project anchor, never inside it.
  const feature = document.createElement('div');
  feature.className = 'v3-inspection-feature';
  card.before(feature);
  feature.append(card);
  const launch = document.createElement('button');
  launch.type = 'button';
  launch.className = 'v3-inspection-launch';
  launch.dataset.inspectionOpen = '';
  launch.setAttribute('aria-haspopup', 'dialog');
  launch.setAttribute('aria-controls', 'v3-inspection-dialog');
  launch.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden="true"><circle cx="10" cy="10" r="6"/><path d="m14.5 14.5 5 5M7 10h6m-3-3v6"/></svg><span>Inspect details</span>';
  feature.append(launch);

  const dialog = document.createElement('dialog');
  dialog.id = 'v3-inspection-dialog';
  dialog.className = 'v3-inspection';
  dialog.dataset.inspection = '';
  dialog.setAttribute('aria-labelledby', 'v3-inspection-title');
  dialog.innerHTML = `
    <header class="v3-inspection-header">
      <h2 id="v3-inspection-title">Kiku</h2>
      <button type="button" class="v3-inspection-close" data-inspection-close aria-label="Close image inspection" autofocus><svg viewBox="0 0 24 24" width="20" height="20" fill="none" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg></button>
    </header>
    <div class="v3-inspection-stage" data-inspection-stage tabindex="0" role="img" aria-describedby="v3-inspection-help">
      <img class="v3-inspection-original" data-inspection-original decoding="async" alt="">
    </div>
    <footer class="v3-inspection-footer">
      <div class="v3-inspection-controls">
        <label for="v3-inspection-zoom">Magnification</label>
        <input id="v3-inspection-zoom" data-inspection-zoom type="range" min="1.5" max="4" step=".25" value="2.5" disabled>
        <output for="v3-inspection-zoom" data-inspection-zoom-value>2.5×</output>
        <a class="v3-inspection-project" href="${card.getAttribute('href')}">Open project <span aria-hidden="true">↗</span></a>
      </div>
      <p id="v3-inspection-help">Move or tap to inspect. Arrow keys move the lens; + and − change magnification.</p>
      <p class="v3-inspection-status" data-inspection-status role="status" aria-live="polite"></p>
    </footer>`;
  document.body.append(dialog);
  const stage = dialog.querySelector('[data-inspection-stage]');
  const original = dialog.querySelector('[data-inspection-original]');
  const zoom = dialog.querySelector('[data-inspection-zoom]');
  const zoomValue = dialog.querySelector('[data-inspection-zoom-value]');
  const status = dialog.querySelector('[data-inspection-status]');
  stage.setAttribute('aria-label', `${source.alt || 'Kiku audio player'}. Moveable magnifying lens.`);
  let canvas = null;

  const sync = () => {
    dialog.dataset.backend = state.backend;
    dialog.dataset.ready = String(state.readiness === 'ready');
    dialog.dataset.readiness = state.readiness;
    dialog.dataset.frames = String(state.renderedFrames);
    dialog.dataset.zoom = String(state.zoom);
    dialog.dataset.lensX = state.x.toFixed(4);
    dialog.dataset.lensY = state.y.toFixed(4);
  };
  // Read-only diagnostics are intentionally separate from renderer resources.
  const diagnostics = {};
  for (const key of Object.keys(state)) Object.defineProperty(diagnostics, key, { enumerable: true, get: () => state[key] });
  window.V3Inspection = Object.freeze(diagnostics);
  sync();

  const newCanvas = () => {
    canvas?.remove();
    canvas = document.createElement('canvas');
    canvas.className = 'v3-inspection-canvas';
    canvas.dataset.inspectionCanvas = '';
    canvas.setAttribute('aria-hidden', 'true');
    canvas.hidden = true;
    stage.append(canvas);
    return canvas;
  };

  function geometry() {
    const bounds = stage.getBoundingClientRect();
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.max(1, Math.round(bounds.width * ratio));
    const height = Math.max(1, Math.round(bounds.height * ratio));
    const scale = Math.min(width / original.naturalWidth, height / original.naturalHeight);
    const iw = original.naturalWidth * scale, ih = original.naturalHeight * scale;
    const left = (width - iw) / 2, top = (height - ih) / 2;
    return { width, height, left, top, iw, ih, cx: left + state.x * iw, cy: top + state.y * ih,
      radius: Math.min(118 * ratio, Math.min(iw, ih) * .23), ratio };
  }

  function canvasRenderer(target) {
    target.addEventListener('contextlost', event => {
      event.preventDefault();
      if (target === canvas && dialog.open) useCanvas(epoch);
    });
    const context = target.getContext('2d', { alpha: false });
    if (!context) throw new Error('Canvas2D is unavailable');
    return {
      kind: 'canvas2d',
      draw(g) {
        if (target.width !== g.width || target.height !== g.height) { target.width = g.width; target.height = g.height; }
        context.fillStyle = '#1c1d19';
        context.fillRect(0, 0, g.width, g.height);
        context.imageSmoothingEnabled = true;
        context.imageSmoothingQuality = 'high';
        context.drawImage(original, g.left, g.top, g.iw, g.ih);
        context.save();
        context.beginPath(); context.arc(g.cx, g.cy, g.radius, 0, Math.PI * 2); context.clip();
        context.fillStyle = '#1c1d19'; context.fillRect(0, 0, g.width, g.height);
        context.drawImage(original, g.cx + (g.left - g.cx) * state.zoom, g.cy + (g.top - g.cy) * state.zoom, g.iw * state.zoom, g.ih * state.zoom);
        context.restore();
        context.beginPath(); context.arc(g.cx, g.cy, g.radius, 0, Math.PI * 2);
        context.lineWidth = 3 * g.ratio; context.strokeStyle = 'rgba(20,20,18,.7)'; context.stroke();
        context.beginPath(); context.arc(g.cx, g.cy, g.radius, 0, Math.PI * 2);
        context.lineWidth = g.ratio; context.strokeStyle = '#ecebe3'; context.stroke();
      },
      destroy() { target.width = 1; target.height = 1; }
    };
  }

  const shader = `
    struct View { size: vec2f, origin: vec2f, imageSize: vec2f, center: vec2f, radius: f32, zoom: f32, pixelRatio: f32, padding: f32 }
    @group(0) @binding(0) var sourceImage: texture_2d<f32>;
    @group(0) @binding(1) var imageSampler: sampler;
    @group(0) @binding(2) var<uniform> view: View;
    @vertex fn vertex(@builtin(vertex_index) id: u32) -> @builtin(position) vec4f {
      var triangle = array<vec2f, 3>(vec2f(-1., -1.), vec2f(3., -1.), vec2f(-1., 3.));
      return vec4f(triangle[id], 0., 1.);
    }
    fn sampleImage(point: vec2f) -> vec4f {
      let uv = (point - view.origin) / view.imageSize;
      let color = textureSampleLevel(sourceImage, imageSampler, uv, 0.);
      let inside = all(uv >= vec2f(0.)) && all(uv <= vec2f(1.));
      return select(vec4f(28./255., 29./255., 25./255., 1.), color, inside);
    }
    @fragment fn fragment(@builtin(position) position: vec4f) -> @location(0) vec4f {
      let point = position.xy;
      let distance = length(point - view.center);
      let edge = max(1., view.pixelRatio * .65);
      let lens = 1. - smoothstep(view.radius - edge, view.radius + edge, distance);
      var color = mix(sampleImage(point), sampleImage(view.center + (point - view.center) / view.zoom), lens);
      let border = abs(distance - view.radius);
      let shadow = (1. - smoothstep(view.pixelRatio, 2. * view.pixelRatio, border)) * .7;
      color = mix(color, vec4f(20./255., 20./255., 18./255., 1.), shadow);
      let rim = 1. - smoothstep(.35 * view.pixelRatio, .85 * view.pixelRatio, border);
      return mix(color, vec4f(236./255., 235./255., 227./255., 1.), rim);
    }`;

  async function gpuRenderer(target, generation) {
    let device, context, texture, uniform, disposed = false, loss = false;
    // Keep the adapter strongly reachable from the ordinary renderer object,
    // not only its native GPUDevice wrapper, until explicit disposal.
    const gpuLifetime = { adapter: null };
    const destroy = () => {
      disposed = true;
      texture?.destroy(); uniform?.destroy(); context?.unconfigure(); device?.destroy();
      gpuLifetime.adapter = null;
      target.width = 1; target.height = 1;
    };
    try {
      const adapter = gpuLifetime.adapter = await navigator.gpu.requestAdapter({ powerPreference: 'low-power' });
      if (!adapter) throw new Error('No WebGPU adapter');
      const info = adapter.info || (adapter.requestAdapterInfo ? await adapter.requestAdapterInfo() : {});
      const software = adapter.isFallbackAdapter || info.isFallbackAdapter || /swiftshader|llvmpipe|software|lavapipe/i.test([info.vendor, info.architecture, info.device, info.description].join(' '));
      state.adapterClass = software ? 'software' : info.vendor || info.device || info.description ? 'hardware-reported' : 'unknown';
      if (requested !== 'webgpu' && software) throw new Error('Software WebGPU adapter; preferring Canvas2D');
      if (generation !== epoch || !dialog.open) throw new Error('Inspection closed');
      device = await adapter.requestDevice();
      device.lost.then(() => {
        loss = true;
        if (!disposed && generation === epoch && dialog.open) useCanvas(generation);
      });
      device.addEventListener('uncapturederror', () => { if (!disposed && generation === epoch && dialog.open) useCanvas(generation); });
      if (generation !== epoch || !dialog.open) throw new Error('Inspection closed');
      context = target.getContext('webgpu');
      if (!context) throw new Error('WebGPU context is unavailable');
      const format = navigator.gpu.getPreferredCanvasFormat();
      context.configure({ device, format, alphaMode: 'opaque' });
      device.pushErrorScope('validation');
      texture = device.createTexture({ size: [original.naturalWidth, original.naturalHeight], format: 'rgba8unorm',
        usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT });
      device.queue.copyExternalImageToTexture({ source: original }, { texture }, [original.naturalWidth, original.naturalHeight]);
      uniform = device.createBuffer({ size: 48, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
      const module = device.createShaderModule({ label: 'V3 original-image inspection', code: shader });
      const pipeline = await device.createRenderPipelineAsync({ layout: 'auto', vertex: { module, entryPoint: 'vertex' },
        fragment: { module, entryPoint: 'fragment', targets: [{ format }] }, primitive: { topology: 'triangle-list' } });
      const bindGroup = device.createBindGroup({ layout: pipeline.getBindGroupLayout(0), entries: [
        { binding: 0, resource: texture.createView() },
        { binding: 1, resource: device.createSampler({ magFilter: 'linear', minFilter: 'linear' }) },
        { binding: 2, resource: { buffer: uniform } }
      ] });
      const error = await device.popErrorScope();
      if (error || loss || generation !== epoch || !dialog.open) throw new Error(error?.message || 'Inspection closed or device lost');
      return {
        gpuLifetime,
        kind: 'webgpu',
        draw(g) {
          if (loss) throw new Error('WebGPU device lost');
          if (target.width !== g.width || target.height !== g.height) { target.width = g.width; target.height = g.height; }
          device.queue.writeBuffer(uniform, 0, new Float32Array([g.width, g.height, g.left, g.top, g.iw, g.ih, g.cx, g.cy, g.radius, state.zoom, g.ratio, 0]));
          const commands = device.createCommandEncoder();
          const pass = commands.beginRenderPass({ colorAttachments: [{ view: context.getCurrentTexture().createView(),
            clearValue: { r: 28 / 255, g: 29 / 255, b: 25 / 255, a: 1 }, loadOp: 'clear', storeOp: 'store' }] });
          pass.setPipeline(pipeline); pass.setBindGroup(0, bindGroup); pass.draw(3); pass.end();
          device.queue.submit([commands.finish()]);
          return device.queue.onSubmittedWorkDone();
        },
        destroy
      };
    } catch (error) { state.fallbackReason = String(error?.message || error); destroy(); throw error; }
  }

  function requestFrame() {
    if (frame || !dialog.open || document.hidden || !renderer || !imageReady) return;
    frame = requestAnimationFrame(async () => {
      frame = 0;
      if (!dialog.open || document.hidden || !renderer) return;
      const activeRenderer = renderer, activeCanvas = canvas, generation = epoch;
      try {
        await activeRenderer.draw(geometry());
        if (generation !== epoch || !dialog.open || document.hidden || renderer !== activeRenderer) return;
        activeCanvas.hidden = false;
        state.renderedFrames++;
        state.readiness = 'ready';
        sync();
      } catch (_) {
        if (generation !== epoch || renderer !== activeRenderer || !dialog.open) return;
        if (renderer.kind === 'webgpu') useCanvas(epoch);
        else fail();
      }
    });
  }

  function fail() {
    renderer?.destroy(); renderer = null;
    canvas?.remove(); canvas = null;
    zoom.disabled = true;
    state.backend = 'image'; state.readiness = 'error';
    status.textContent = 'The original image is available. Magnification could not start.';
    sync();
  }

  function useCanvas(generation) {
    if (generation !== epoch || !dialog.open || !imageReady) return;
    // A canvas cannot change context types. Replace it when recovering WebGPU.
    renderer?.destroy(); renderer = null;
    try {
      renderer = canvasRenderer(newCanvas());
      state.backend = state.lastBackend = 'canvas2d';
      zoom.disabled = false;
      status.textContent = 'Image inspection ready.';
      sync(); requestFrame();
    } catch (_) { fail(); }
  }

  async function start(generation) {
    imageReady = false;
    state.backend = 'pending'; state.readiness = 'loading'; sync();
    status.textContent = 'Loading original image.';
    original.src = source.currentSrc || source.src;
    try {
      await original.decode();
      if (generation !== epoch || !dialog.open) return;
      imageReady = original.naturalWidth > 0;
      if (!imageReady) throw new Error('No image pixels');
    } catch (_) {
      if (generation === epoch && dialog.open) { fail(); status.textContent = 'The image could not load. You can still open the project.'; }
      return;
    }
    if (forceCanvas || !navigator.gpu) { useCanvas(generation); return; }
    // If adapter/driver setup stalls, keep this explicit user action usable.
    const watchdog = startupTimer = setTimeout(() => { if (!renderer) useCanvas(generation); }, 5000);
    try {
      const ready = await gpuRenderer(newCanvas(), generation);
      if (generation !== epoch || !dialog.open || renderer) { ready.destroy(); return; }
      renderer = ready;
      state.backend = state.lastBackend = ready.kind;
      zoom.disabled = false;
      status.textContent = 'Image inspection ready.';
      sync(); requestFrame();
    } catch (_) { if (!renderer) useCanvas(generation); }
    finally { clearTimeout(watchdog); if (startupTimer === watchdog) startupTimer = 0; }
  }

  function open() {
    if (dialog.open) return;
    returnFocus = document.activeElement;
    oldOverflow = document.body.style.overflow;
    oldPadding = document.body.style.paddingRight;
    const scrollbar = Math.max(0, innerWidth - document.documentElement.clientWidth);
    if (scrollbar) document.body.style.paddingRight = `${parseFloat(getComputedStyle(document.body).paddingRight) + scrollbar}px`;
    document.body.style.overflow = 'hidden';
    dialog.showModal();
    state.open = true; state.x = .48; state.y = .49; state.zoom = 2.5;
    zoom.value = '2.5'; zoomValue.value = '2.5×'; zoom.disabled = true;
    sync();
    observer = new ResizeObserver(requestFrame); observer.observe(stage);
    start(++epoch);
  }

  function cleanUp() {
    if (!state.open) return;
    ++epoch;
    cancelAnimationFrame(frame); frame = 0;
    clearTimeout(startupTimer); startupTimer = 0;
    observer?.disconnect(); observer = null;
    renderer?.destroy(); renderer = null;
    canvas?.remove(); canvas = null;
    touchStart = null; imageReady = false;
    zoom.disabled = true;
    state.open = false; state.backend = 'idle'; state.readiness = 'idle'; sync();
    document.body.style.overflow = oldOverflow;
    document.body.style.paddingRight = oldPadding;
    if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
  }

  function close() {
    if (dialog.open) dialog.close();
    cleanUp();
  }

  function setZoom(value) {
    state.zoom = Math.round(clamp(value, 1.5, 4) * 4) / 4;
    zoom.value = String(state.zoom); zoomValue.value = `${state.zoom}×`;
    sync(); requestFrame();
  }
  function point(event) {
    if (!imageReady) return;
    const bounds = stage.getBoundingClientRect(), g = geometry();
    state.x = clamp(((event.clientX - bounds.left) * g.ratio - g.left) / g.iw, 0, 1);
    state.y = clamp(((event.clientY - bounds.top) * g.ratio - g.top) / g.ih, 0, 1);
    sync(); requestFrame();
  }

  launch.addEventListener('click', open);
  dialog.querySelector('[data-inspection-close]').addEventListener('click', close);
  dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
  dialog.addEventListener('close', () => { if (!dialog.open) cleanUp(); });
  dialog.addEventListener('pointerdown', event => { backgroundPointerDown = event.target === dialog; });
  dialog.addEventListener('click', event => { if (backgroundPointerDown && event.target === dialog) close(); backgroundPointerDown = false; });
  zoom.addEventListener('input', () => setZoom(Number(zoom.value)));
  stage.addEventListener('pointerdown', event => {
    if (event.pointerType === 'touch') touchStart = { x: event.clientX, y: event.clientY, cancelled: false };
    else { stage.focus({ preventScroll: true }); point(event); }
  });
  stage.addEventListener('pointermove', event => {
    if (event.pointerType !== 'touch') { point(event); return; }
    if (!touchStart || touchStart.cancelled) return;
    const dx = event.clientX - touchStart.x, dy = event.clientY - touchStart.y;
    // Vertical gestures belong to native scrolling, not to the lens.
    if (Math.abs(dy) > 8 && Math.abs(dy) > Math.abs(dx)) { touchStart.cancelled = true; return; }
    if (Math.abs(dx) > 8) point(event);
  });
  stage.addEventListener('pointerup', event => {
    if (event.pointerType === 'touch' && touchStart && !touchStart.cancelled) point(event);
    touchStart = null;
  });
  stage.addEventListener('pointercancel', () => { touchStart = null; });
  stage.addEventListener('keydown', event => {
    if (!imageReady || event.altKey || event.ctrlKey || event.metaKey) return;
    const step = event.shiftKey ? .08 : .025;
    if (event.key === 'ArrowLeft') state.x = clamp(state.x - step, 0, 1);
    else if (event.key === 'ArrowRight') state.x = clamp(state.x + step, 0, 1);
    else if (event.key === 'ArrowUp') state.y = clamp(state.y - step, 0, 1);
    else if (event.key === 'ArrowDown') state.y = clamp(state.y + step, 0, 1);
    else if (event.key === '+' || event.key === '=') setZoom(state.zoom + .25);
    else if (event.key === '-' || event.key === '_') setZoom(state.zoom - .25);
    else if (event.key === 'Home') { state.x = .48; state.y = .49; setZoom(2.5); }
    else return;
    event.preventDefault(); sync(); requestFrame();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { cancelAnimationFrame(frame); frame = 0; }
    else requestFrame();
  });
  addEventListener('pagehide', close);
})();
