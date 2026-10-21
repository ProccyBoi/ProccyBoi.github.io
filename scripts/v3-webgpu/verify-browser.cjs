#!/usr/bin/env node
/* Independent browser checks for the isolated v3 experiment.
 * Only Playwright is required. Run against a repository-root static server.
 * V3_BASE_URL, V3_QA_OUT, CHROMIUM_EXECUTABLE, V3_BROWSER_ARGS (JSON array).
 * --webkit: fallback/content checks; --require-webgpu: fail unless real WebGPU
 * submits, draw calls, drawable acquisition, and native queue completion occur.
 * GPU observers add overhead: these runs are correctness evidence, NOT a benchmark.
 * ALL external requests are blocked except an entirely mocked booking endpoint.
 */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '../..');
const base = (process.env.V3_BASE_URL || 'http://127.0.0.1:8080').replace(/\/$/, '');
const origin = new URL(base).origin;
const output = path.resolve(process.env.V3_QA_OUT || path.join(root, '.codex-temp/v3-independent-qa'));
const engine = process.argv.includes('--webkit') ? 'webkit' : 'chromium';
const requireWebGPU = process.argv.includes('--require-webgpu');
const timeout = Number(process.env.V3_QA_TIMEOUT || 120000);
const endpoint = fs.readFileSync(path.join(root, 'v2/book/index.html'), 'utf8').match(/data-booking-endpoint="([^"]+)"/)[1];
const report = { engine, base, requireWebGPU, started: new Date().toISOString(), tests: [], errors: [], browserErrors: [], failedLocalResponses: [], blockedExternalRequests: [], limits: [
  'Instrumented correctness tests are not performance measurements.',
  'Software adapters establish backend correctness, not hardware speed or compatibility.',
  'Booking responses and submissions are mocked; no real booking is created.',
] };
fs.mkdirSync(output, { recursive: true });
const save = () => fs.writeFileSync(path.join(output, `${engine}-report.json`), JSON.stringify(report, null, 2) + '\n');
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');

function nativeGraphicsObserver(mode) {
  const stats = window.__v3QaGraphics = {
    observerErrors: [], adapterRequests: 0, adapters: [], devices: 0, adapterUnavailable: 0,
    webgpuConfigured: 0, aircraftWebgpuConfigured: 0, inspectionWebgpuConfigured: 0,
    destroyCalls: [], deviceLosses: [], textures: 0, aircraftTextures: 0, inspectionTextures: 0,
    renderPasses: 0, drawCalls: 0, submits: 0, completedSubmits: 0, destroyedQueueCompletions: 0, queueErrors: [], validationErrors: [],
    webglContexts: 0, aircraftWebglContexts: 0, webglDraws: 0, aircraftWebglDraws: 0,
  };
  const queueOwners = new WeakMap(), destroyedDevices = new WeakSet(), canvasDevices = new WeakMap();
  let retiredAircraftCanvas = null;
  // Keep native objects out of JSON evidence; only the test can request loss.
  Object.defineProperty(window, '__v3QaControl', { value: Object.freeze({
    destroyAircraftDevice() {
      const canvas = document.querySelector('[data-aircraft-canvas]');
      const device = canvasDevices.get(canvas);
      if (!device) return false;
      retiredAircraftCanvas = canvas;
      device.destroy();
      return true;
    },
    aircraftCanvasReplaced() {
      return Boolean(retiredAircraftCanvas && document.querySelector('[data-aircraft-canvas]') !== retiredAircraftCanvas);
    },
    destroyInspectionDevice() {
      const device = canvasDevices.get(document.querySelector('[data-inspection-canvas]'));
      if (!device) return false;
      device.destroy();
      return true;
    },
  }) });
  const wrap = (proto, name, observer) => {
    if (!proto || typeof proto[name] !== 'function') return;
    try {
      const original = proto[name];
      proto[name] = function (...args) {
        const result = Reflect.apply(original, this, args);
        try { observer(this, args, result); } catch (error) { stats.observerErrors.push(name + ': ' + error.message); }
        return result;
      };
    } catch (error) { stats.observerErrors.push(name + ': ' + error.message); }
  };
  if (mode === 'no-gpu') {
    try { Object.defineProperty(navigator, 'gpu', { value: undefined, configurable: true }); }
    catch (error) { stats.observerErrors.push('disable gpu: ' + error.message); }
  } else if (mode === 'no-adapter' && navigator.gpu) {
    navigator.gpu.requestAdapter = async () => { stats.adapterRequests++; stats.adapterUnavailable++; return null; };
  }
  if (navigator.gpu && mode !== 'no-adapter') wrap(Object.getPrototypeOf(navigator.gpu), 'requestAdapter', (_, args, result) => {
    stats.adapterRequests++;
    result.then(adapter => {
      if (!adapter) { stats.adapterUnavailable++; return; }
      const info = adapter.info;
      stats.adapters.push(info ? { vendor: info.vendor, architecture: info.architecture, device: info.device, description: info.description, isFallbackAdapter: info.isFallbackAdapter } : {});
    }, error => stats.queueErrors.push(String(error)));
  });
  wrap(window.GPUAdapter?.prototype, 'requestDevice', (_, args, result) => result.then(device => {
    stats.devices++;
    device.lost.then(info => stats.deviceLosses.push({ reason: info.reason, message: info.message }));
    queueOwners.set(device.queue, device);
    device.addEventListener('uncapturederror', event => stats.validationErrors.push(event.error?.message || String(event.error)));
  }, error => stats.queueErrors.push(String(error))));
  wrap(window.GPUDevice?.prototype, 'destroy', device => { destroyedDevices.add(device); stats.destroyCalls.push(new Error('GPUDevice.destroy caller').stack); });
  wrap(window.GPUCanvasContext?.prototype, 'configure', (context, args) => {
    canvasDevices.set(context.canvas, args[0].device);
    stats.webgpuConfigured++;
    if (context.canvas.hasAttribute('data-aircraft-canvas')) stats.aircraftWebgpuConfigured++;
    if (context.canvas.hasAttribute('data-inspection-canvas')) stats.inspectionWebgpuConfigured++;
  });
  wrap(window.GPUCanvasContext?.prototype, 'getCurrentTexture', context => {
    stats.textures++;
    if (context.canvas.hasAttribute('data-aircraft-canvas')) stats.aircraftTextures++;
    if (context.canvas.hasAttribute('data-inspection-canvas')) stats.inspectionTextures++;
  });
  wrap(window.GPUCommandEncoder?.prototype, 'beginRenderPass', () => stats.renderPasses++);
  for (const method of ['draw', 'drawIndexed', 'drawIndirect', 'drawIndexedIndirect']) {
    wrap(window.GPURenderPassEncoder?.prototype, method, () => stats.drawCalls++);
    wrap(window.GPURenderBundleEncoder?.prototype, method, () => stats.drawCalls++);
  }
  wrap(window.GPUQueue?.prototype, 'submit', queue => {
    stats.submits++;
    queue.onSubmittedWorkDone().then(() => stats.completedSubmits++, error => {
      // Closing a dialog intentionally destroys its device. Do not turn that
      // expected cancellation into an alleged shader/device failure.
      if (destroyedDevices.has(queueOwners.get(queue))) stats.destroyedQueueCompletions++;
      else stats.queueErrors.push(String(error));
    });
  });
  wrap(HTMLCanvasElement.prototype, 'getContext', (canvas, args, result) => {
    if (result && /^(webgl2?|experimental-webgl)$/.test(args[0])) {
      stats.webglContexts++;
      if (canvas.hasAttribute('data-aircraft-canvas')) stats.aircraftWebglContexts++;
    }
  });
  for (const proto of [window.WebGLRenderingContext?.prototype, window.WebGL2RenderingContext?.prototype]) {
    for (const method of ['drawArrays', 'drawElements', 'drawArraysInstanced', 'drawElementsInstanced']) wrap(proto, method, context => {
      stats.webglDraws++;
      if (context.canvas?.hasAttribute('data-aircraft-canvas')) stats.aircraftWebglDraws++;
    });
  }
  if (mode === 'no-graphics') {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...args) {
      return /^(webgl2?|experimental-webgl|webgpu)$/.test(type) ? null : Reflect.apply(original, this, [type, ...args]);
    };
    Object.defineProperty(navigator, 'gpu', { value: undefined, configurable: true });
  }
}

async function prepare(context, mode = 'normal') {
  const mock = { submissions: [], requests: [] };
  await context.addInitScript(nativeGraphicsObserver, mode);
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin === origin) {
      if (request.method() === 'GET' || request.method() === 'HEAD') return route.continue();
      return route.abort();
    }
    if (url.origin + url.pathname === endpoint) {
      if (request.method() === 'POST') {
        mock.submissions.push(Object.fromEntries(new URLSearchParams(request.postData())));
        return route.fulfill({ contentType: 'text/html', body: '<!doctype html><script>parent.postMessage({source:"andrew-booking",ok:true},"*");<\/script>' });
      }
      mock.requests.push(url.href);
      const callback = url.searchParams.get('callback');
      assert.match(callback, /^andrewBookingAvailability\d+$/);
      const duration = Number(url.searchParams.get('duration'));
      const firstDay = new Date(`${url.searchParams.get('start')}T00:00:00Z`);
      const payload = { ok: true, token: `mock-token-${duration}`, days: Array.from({ length: 5 }, (_, index) => {
        const start = new Date(firstDay); start.setUTCDate(start.getUTCDate() + index);
        return { anchor: start.toISOString(), slots: [{ start: start.toISOString(), end: new Date(start.getTime() + duration * 60000).toISOString() }] };
      }) };
      return route.fulfill({ contentType: 'text/javascript', body: `${callback}(${JSON.stringify(payload)});` });
    }
    report.blockedExternalRequests.push({ url: url.href, method: request.method() });
    return route.abort();
  });
  context.on('page', page => {
    page.on('pageerror', error => report.browserErrors.push({ url: page.url(), message: error.message, stack: error.stack }));
    page.on('response', response => { if (response.url().startsWith(origin + '/') && response.status() >= 400) report.failedLocalResponses.push({ status: response.status(), url: response.url() }); });
  });
  return mock;
}

async function capture(page, name) {
  await page.screenshot({ path: path.join(output, `${engine}-${name}.png`), animations: 'disabled', timeout: 30000 });
}

async function checkOverflow(page) {
  const sizes = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth }));
  assert.ok(sizes.document <= sizes.viewport + 1, `Horizontal overflow: ${JSON.stringify(sizes)}`);
}

async function checkRouteLeaks(page) {
  const leaks = await page.locator('a[href]').evaluateAll(anchors => anchors.map(anchor => anchor.href).filter(href => {
    const url = new URL(href); return url.origin === location.origin && /^\/v2(?:\/|$)/.test(url.pathname);
  }));
  assert.deepEqual(leaks, [], 'Runtime links remain inside v3');
}

async function test(name, callback) {
  const started = Date.now();
  try { const details = await callback(); report.tests.push({ name, passed: true, durationMs: Date.now() - started, ...details }); }
  catch (error) { report.tests.push({ name, passed: false, durationMs: Date.now() - started, error: String(error.stack || error) }); report.errors.push(name + ': ' + error.message); }
  const latest = report.tests.at(-1);
  console.log(`${latest.passed ? 'PASS' : 'FAIL'} ${name}${latest.error ? ': ' + latest.error.split('\n')[0] : ''}`);
  save();
}

async function aircraft(browser, label, mode, query, mobile = false) {
  const viewport = mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 };
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1, hasTouch: mobile });
  await prepare(context, mode);
  if (mobile) await context.addInitScript(() => {
    // Install before application listeners, including browsers without the
    // Network Information API. This tests the preference contract explicitly.
    const connection = navigator.connection || new EventTarget();
    if (!navigator.connection) Object.defineProperty(navigator, 'connection', { value: connection, configurable: true });
    let saveData = false;
    Object.defineProperty(connection, 'saveData', { configurable: true, get: () => saveData });
    window.__v3QaSetSaveData = value => { saveData = value; connection.dispatchEvent(new Event('change')); };
  });
  const page = await context.newPage();
  page.setDefaultTimeout(timeout);
  try {
    const directAnchor = mobile ? '#skylabs-telemetry' : '#skylabs-aircraft';
    await page.goto(`${base}/v3/?${query}${directAnchor}`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => {
      const element = document.querySelector('[data-aircraft-hero]');
      return element?.classList.contains('is-ready') || element?.dataset.webgpuReady === 'true';
    }, null, { timeout });
    await page.waitForFunction(() => window.__v3QaGraphics.aircraftWebglDraws > 0 || window.__v3QaGraphics.completedSubmits > 0, null, { timeout });
    await page.waitForTimeout(1200);
    const state = await page.evaluate(() => ({ dataset: { ...document.querySelector('[data-aircraft-hero]').dataset }, graphics: window.__v3QaGraphics, diagnostics: window.V3WebGPU?.snapshot?.() || window.V3WebGPU?.diagnostics || null }));
    const actualGPU = state.graphics.aircraftWebgpuConfigured > 0;
    if (mode === 'normal' && query.includes('renderer=webgpu') && requireWebGPU) {
      assert.equal(state.dataset.webgpuBackend, 'webgpu', 'Forced WebGPU run must identify its actual backend');
      assert.ok(actualGPU && state.graphics.aircraftTextures > 0 && state.graphics.drawCalls > 0 && state.graphics.submits > 0 && state.graphics.completedSubmits > 0, 'Actual aircraft texture, draw, queue submit and native completion evidence is required');
      assert.equal(state.graphics.aircraftWebglDraws, 0, 'The WebGPU aircraft must not secretly render through legacy WebGL');
    }
    if (mode !== 'normal' || query.includes('renderer=webgl')) {
      assert.ok(state.graphics.aircraftWebglDraws > 0, 'Fallback must perform real WebGL aircraft draws');
      assert.equal(state.graphics.aircraftWebgpuConfigured, 0, 'Fallback must not configure a WebGPU aircraft canvas');
    }
    if (actualGPU) {
      assert.equal(await page.evaluate(() => typeof window.gc), 'function', 'GC retention regression requires exposed test-only gc');
      await page.evaluate(() => { window.gc(); window.gc(); });
      await page.waitForTimeout(200);
      assert.equal(await page.evaluate(() => window.V3WebGPU.backend), 'webgpu', 'Adapter survives GC while its renderer is live');
    }
    assert.deepEqual(state.graphics.validationErrors, [], 'No WebGPU validation errors');
    assert.deepEqual(state.graphics.queueErrors, [], 'GPU queue/device failures');
    assert.deepEqual(state.graphics.observerErrors, [], 'Native evidence observer must be active');
    await capture(page, `${label}-aircraft`);
    const canvas = page.locator('[data-aircraft-canvas]');
    const visible = await canvas.screenshot({ timeout: 30000 });
    fs.writeFileSync(path.join(output, `${engine}-${label}-canvas.png`), visible);
    const previousOpacity = await canvas.evaluate(node => { const value = node.style.opacity; node.style.opacity = '0'; return value; });
    let hidden;
    try { hidden = await canvas.screenshot({ timeout: 30000 }); }
    finally { await canvas.evaluate((node, opacity) => { node.style.opacity = opacity; }, previousOpacity); }
    assert.notEqual(sha(visible), sha(hidden), 'The visible aircraft canvas contributes real rendered pixels');
    for (const destination of ['1', '0', '1']) {
      await page.locator(`[data-aircraft-go="${destination}"]`).click();
      await page.waitForFunction(value => {
        const root = document.querySelector('[data-aircraft-hero]');
        const progress = Number(root.dataset.aircraftRenderedProgress);
        const settled = root.dataset.aircraftGPUPending !== 'true' && (root.dataset.webgpuBackend !== 'webgpu' || root.dataset.aircraftPresentedRevision === root.dataset.aircraftPoseRevision);
        return settled && root.classList.contains('is-ready') && root.dataset.aircraftChapter === value && (value === '1' ? progress > .99 : progress < .02);
      }, destination, { timeout });
      await checkRouteLeaks(page);
    }
    await capture(page, `${label}-telemetry`);
    await page.goBack();
    await page.waitForTimeout(300);
    await checkRouteLeaks(page);
    await checkOverflow(page);
    const preferenceChecks = [];
    if (mobile) {
      const waitStatic = () => page.waitForFunction(() => {
        const node = document.querySelector('[data-aircraft-hero]');
        return !node.classList.contains('is-ready') && node.dataset.aircraftState === 'static';
      }, null, { timeout });
      const waitReady = () => page.waitForFunction(() => document.querySelector('[data-aircraft-hero]').classList.contains('is-ready'), null, { timeout });
      await page.emulateMedia({ reducedMotion: 'reduce' }); await waitStatic();
      await capture(page, `${label}-reduced-motion`);
      await page.emulateMedia({ reducedMotion: 'no-preference' }); await waitReady();
      preferenceChecks.push('reduced motion on/off restores static/actual rendering');
      await page.setViewportSize({ width: viewport.width, height: 480 }); await waitStatic();
      await page.setViewportSize(viewport); await waitReady();
      preferenceChecks.push('short viewport on/off restores static/actual rendering');
      await page.evaluate(() => window.__v3QaSetSaveData(true));
      await waitStatic();
      await page.evaluate(() => window.__v3QaSetSaveData(false)); await waitReady();
      preferenceChecks.push('Save Data on/off restores static/actual rendering (simulated Network Information API)');
      await capture(page, `${label}-preferences-restored`);
    }
    let offscreenPacing = null;
    if (actualGPU) {
      await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
      await page.waitForFunction(() => {
        const root = document.querySelector('[data-aircraft-hero]');
        return root.getBoundingClientRect().top > innerHeight * 2 && root.dataset.aircraftPreparationEligible === 'false' && root.dataset.aircraftGPUPending === 'false';
      }, null, { timeout });
      const sample = () => page.evaluate(() => {
        const data = document.querySelector('[data-aircraft-hero]').dataset;
        return { submitted: data.aircraftSubmittedFrames, completed: data.aircraftCompletedFrames, live: data.aircraftFrames, warm: data.aircraftWarmFrames };
      });
      const before = await sample();
      await page.waitForTimeout(600);
      const after = await sample();
      assert.deepEqual(after, before, 'Far-offscreen aircraft must stop submissions after outstanding work settles');
      offscreenPacing = { before, after, observationMs: 600 };
    }
    return { ...state, viewport, directAnchor, preferenceChecks, offscreenPacing, actualWebGPU: actualGPU, renderedCanvasSHA256: sha(visible), canvasHiddenSHA256: sha(hidden) };
  } catch (error) {
    const failure = await page.evaluate(() => ({ url: location.href, dataset: { ...document.querySelector('[data-aircraft-hero]')?.dataset }, graphics: window.__v3QaGraphics, diagnostics: window.V3WebGPU?.snapshot?.(), errors: window.__v3QaGraphics?.validationErrors })).catch(() => null);
    fs.writeFileSync(path.join(output, `${engine}-${label}-failure.json`), JSON.stringify({ error: String(error.stack || error), failure }, null, 2));
    await capture(page, `${label}-failure`).catch(() => {});
    throw error;
  } finally { await context.close(); }
}

async function matchedPoses(browser, backend) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  await prepare(context, 'normal');
  const page = await context.newPage(); page.setDefaultTimeout(timeout);
  try {
    await page.goto(`${base}/v3/?capture&renderer=${backend}#skylabs-aircraft`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(backend => window.__v3Aircraft?.flight?.telemetryReady && window.V3WebGPU?.ready && window.V3WebGPU.backend === backend, backend, { timeout });
    assert.equal(await page.evaluate(() => window.V3WebGPU.backend), backend);
    const poses = [];
    for (const [name, value] of [['assembled', 0], ['peel', .4], ['telemetry', 1]]) {
      const previous = await page.evaluate(value => {
        const root = document.querySelector('[data-aircraft-hero]'), frames = Number(root.dataset.aircraftFrames || 0);
        window.__v3Aircraft.seekProgress(value); return frames;
      }, value);
      await page.waitForFunction(({ previous, value }) => {
        const root = document.querySelector('[data-aircraft-hero]');
        return root.classList.contains('is-ready') && Number(root.dataset.aircraftFrames) > previous && Math.abs(Number(root.dataset.aircraftRenderedProgress) - value) < .000001;
      }, { previous, value }, { timeout });
      const evidence = await page.evaluate(() => {
        const { camera } = window.__v3Aircraft;
        return { dataset: { ...document.querySelector('[data-aircraft-hero]').dataset }, camera: { position: camera.position.toArray(), near: camera.near, far: camera.far, fov: camera.fov }, graphics: window.__v3QaGraphics };
      });
      assert.deepEqual(evidence.graphics.validationErrors, []); assert.deepEqual(evidence.graphics.queueErrors, []);
      if (backend === 'webgpu') assert.ok(evidence.graphics.completedSubmits > 0 && evidence.graphics.aircraftWebglDraws === 0);
      await capture(page, `matched-${backend}-${name}`);
      poses.push({ name, value, ...evidence });
      if (backend === 'webgpu' && name === 'assembled') {
        // Diagnostic only: distinguish mesh overlap from shadow acne without
        // changing the candidate's normal material/lighting configuration.
        const previous = await page.evaluate(() => {
          const frames = Number(document.querySelector('[data-aircraft-hero]').dataset.aircraftFrames);
          window.__v3QaShadowReceivers = [];
          window.__v3Aircraft.flight.group.traverse(node => { if (node.isMesh && node.receiveShadow) { window.__v3QaShadowReceivers.push(node); node.receiveShadow = false; } });
          window.__v3Aircraft.seekProgress(0); return frames;
        });
        await page.waitForFunction(previous => Number(document.querySelector('[data-aircraft-hero]').dataset.aircraftFrames) > previous, previous, { timeout });
        await capture(page, 'diagnostic-webgpu-assembled-no-self-shadow');
        await page.evaluate(() => { window.__v3QaShadowReceivers.forEach(node => { node.receiveShadow = true; }); delete window.__v3QaShadowReceivers; });
      }
    }
    return { backend, poses, limits: 'Identical viewport and source-geometry poses; lighting and material pipelines are intentionally not pixel-identical.' };
  } finally { await context.close(); }
}

async function interruptedAircraft(browser) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  await prepare(context);
  let releaseModule;
  const moduleGate = new Promise(resolve => { releaseModule = resolve; });
  let acknowledgeModule, requestTimer;
  const moduleRequested = new Promise(resolve => { acknowledgeModule = resolve; });
  await context.route('**/webgpu/aircraft-controller.js*', async route => {
    acknowledgeModule();
    await moduleGate;
    await route.continue();
  });
  const page = await context.newPage();
  page.setDefaultTimeout(timeout);
  try {
    await page.goto(`${base}/v3/?renderer=webgpu`, { waitUntil: 'domcontentloaded' });
    await page.locator('[data-aircraft-hero]').scrollIntoViewIfNeeded();
    await page.waitForFunction(() => window.V3WebGPU?.state === 'loading-module', null, { timeout });
    await Promise.race([moduleRequested, new Promise((_, reject) => { requestTimer = setTimeout(() => reject(new Error('Controller module was not intercepted')), timeout); })]);
    clearTimeout(requestTimer);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    releaseModule();
    await page.waitForFunction(() => window.V3WebGPU?.state === 'static-preferences');
    // Allow the released module's promise to settle before restoring preferences.
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(200);
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.locator('[data-aircraft-hero]').scrollIntoViewIfNeeded();
    await page.waitForFunction(() => document.querySelector('[data-aircraft-hero]')?.classList.contains('is-ready'), null, { timeout });
    const state = await page.evaluate(() => ({ diagnostics: window.V3WebGPU.snapshot(), graphics: window.__v3QaGraphics }));
    if (requireWebGPU) {
      assert.equal(state.diagnostics.backend, 'webgpu');
      assert.ok(state.graphics.aircraftTextures > 0 && state.graphics.completedSubmits > 0);
    }
    assert.deepEqual(state.graphics.validationErrors, []);
    assert.deepEqual(state.graphics.queueErrors, []);
    await capture(page, 'aircraft-interrupted-startup-restored');
    return state;
  } finally { clearTimeout(requestTimer); releaseModule(); await context.close(); }
}

async function deviceLossRecovery(browser) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  await prepare(context);
  const page = await context.newPage();
  page.setDefaultTimeout(timeout);
  try {
    await page.goto(`${base}/v3/?renderer=webgpu#skylabs-telemetry`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => document.querySelector('[data-aircraft-hero]')?.classList.contains('is-ready'), null, { timeout });
    const initial = await page.evaluate(() => ({ backend: document.querySelector('[data-aircraft-hero]').dataset.webgpuBackend, graphics: window.__v3QaGraphics }));
    if (initial.backend !== 'webgpu') {
      assert.equal(requireWebGPU, false, 'Device-loss test requires an initial real WebGPU aircraft');
      return { skipped: 'No real WebGPU backend available; device-loss recovery was not exercised', initial };
    }
    assert.ok(initial.graphics.aircraftTextures > 0 && initial.graphics.completedSubmits > 0);
    assert.equal(await page.evaluate(() => window.__v3QaControl.destroyAircraftDevice()), true, 'Destroy the actual aircraft device');
    await page.waitForFunction(() => {
      const root = document.querySelector('[data-aircraft-hero]');
      return window.__v3QaControl.aircraftCanvasReplaced() && root.classList.contains('is-ready') && root.dataset.webgpuBackend === 'webgl' && window.__v3QaGraphics.aircraftWebglDraws > 0;
    }, null, { timeout });
    assert.equal(await page.locator('[data-aircraft-canvas]').count(), 1, 'Device recovery leaves exactly one aircraft canvas');
    const graphics = await page.evaluate(() => window.__v3QaGraphics);
    assert.deepEqual(graphics.validationErrors, [], 'Intentional loss must not produce validation errors');
    assert.deepEqual(graphics.queueErrors, [], 'Expected destroyed-device cancellations are accounted for separately');
    assert.deepEqual(graphics.observerErrors, []);
    await checkOverflow(page); await checkRouteLeaks(page);
    await capture(page, 'webgpu-device-loss-recovered-webgl');
    return { initialBackend: initial.backend, recoveredBackend: 'webgl', replacedCanvas: true, graphics };
  } finally { await context.close(); }
}

async function content(browser) {
  const context = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 390, height: 844 }, timezoneId: 'Australia/Sydney' });
  const mock = await prepare(context);
  const page = await context.newPage();
  try {
    await page.goto(`${base}/v3/`, { waitUntil: 'networkidle' });
    await checkOverflow(page); await checkRouteLeaks(page); await capture(page, 'mobile-home-reduced-motion');
    const menu = page.locator('[data-v2-menu]');
    await menu.click(); assert.equal(await menu.getAttribute('aria-expanded'), 'true');
    await page.keyboard.press('Escape'); assert.equal(await menu.getAttribute('aria-expanded'), 'false');
    assert.equal(await menu.evaluate(node => node === document.activeElement), true);
    await menu.click(); await page.locator('[data-v2-nav] a[href="/v3/projects/"]').click();
    await page.waitForURL('**/v3/projects/');
    const cards = page.locator('[data-v2-project][href^="/v3/projects/"]');
    assert.equal(await cards.count(), 16);
    const search = page.locator('[data-v2-search]');
    await search.fill('Framework'); assert.equal(await page.locator('[data-v2-project][href^="/v3/projects/"]:visible').count(), 4);
    await page.reload({ waitUntil: 'networkidle' }); assert.equal(await search.inputValue(), 'Framework');
    await search.fill('NoSuchProject987654'); assert.equal(await page.locator('[data-v2-project]:visible').count(), 0);
    await search.press('Escape'); assert.equal(await page.locator('[data-v2-project]:visible').count(), 16);
    await capture(page, 'mobile-projects');
    await page.setViewportSize({ width: 320, height: 740 }); await checkOverflow(page);
    await page.goto(`${base}/v3/book/`, { waitUntil: 'networkidle' });
    await page.locator('[data-slot]').first().waitFor();
    for (const duration of [15, 30, 45, 60]) {
      await page.locator(`input[name="duration-choice"][value="${duration}"]`).check();
      await page.waitForFunction(value => document.querySelector('[data-booking-card-title]').textContent.includes(`${value}-minute`) && !document.querySelector('[data-booking-days]').hidden, duration);
      await page.locator('[data-slot]').first().click();
      assert.equal(await page.locator('[data-form-duration]').inputValue(), String(duration));
    }
    await page.locator('#booking-name').fill('V3 Mock QA');
    await page.locator('#booking-email').fill('v3-qa@example.invalid');
    await page.locator('#booking-topic').fill('Intercepted test; never a live booking.');
    await capture(page, 'mobile-booking');
    await page.locator('[data-booking-submit]').click();
    await page.locator('[data-booking-success]').waitFor({ state: 'visible' });
    assert.equal(mock.submissions.length, 1);
    assert.equal(mock.submissions[0].duration, '60');
    await page.locator('[data-book-another]').click();
    await page.locator('[data-slot]').first().waitFor({ state: 'visible' });
    await checkOverflow(page); await checkRouteLeaks(page);
    return { projects: 16, searchResults: 4, bookingMockSubmissions: mock.submissions.length, liveBookingSubmissions: 0 };
  } finally { await context.close(); }
}

async function staticFallback(browser, js, mode) {
  const context = await browser.newContext({ javaScriptEnabled: js, viewport: { width: 390, height: 844 } });
  await prepare(context, mode);
  const page = await context.newPage();
  try {
    await page.goto(`${base}/v3/`, { waitUntil: 'networkidle' });
    await page.locator('h1').waitFor();
    await checkRouteLeaks(page); await checkOverflow(page);
    const poster = page.locator('[data-assembly-posters] img').first();
    assert.ok(await poster.evaluate(node => node.complete && node.naturalWidth > 0));
    await page.locator('[data-aircraft-hero]').scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);
    const aircraftPoster = page.locator('[data-aircraft-poster]');
    assert.ok(await aircraftPoster.evaluate(node => node.complete && node.naturalWidth > 0));
    assert.ok(await aircraftPoster.isVisible());
    await capture(page, js ? 'graphics-unavailable' : 'no-javascript');
    await page.goto(`${base}/v3/projects/`, { waitUntil: 'networkidle' });
    assert.equal(await page.locator('[data-v2-project]:visible').count(), 16);
    return { javaScript: js, mode, projectCards: 16 };
  } finally { await context.close(); }
}

async function interruptedInspection(browser) {
  const context = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 390, height: 844 } });
  await prepare(context);
  await context.addInitScript(() => {
    const decode = HTMLImageElement.prototype.decode;
    let hold = true, pending = [];
    Object.defineProperty(window, '__v3QaReleaseInspectionImage', { value() {
      hold = false;
      for (const release of pending.splice(0)) release();
    } });
    HTMLImageElement.prototype.decode = function (...args) {
      const decoded = Reflect.apply(decode, this, args);
      return this.hasAttribute('data-inspection-original') && hold
        ? decoded.then(() => hold ? new Promise(resolve => pending.push(resolve)) : undefined) : decoded;
    };
  });
  const page = await context.newPage();
  page.setDefaultTimeout(timeout);
  try {
    await page.goto(`${base}/v3/?renderer=webgl`, { waitUntil: 'networkidle' });
    const trigger = page.locator('[data-inspection-open]');
    await trigger.click();
    assert.equal(await page.evaluate(() => window.V3Inspection.readiness), 'loading');
    await page.locator('[data-inspection-close]').click();
    await page.evaluate(() => window.__v3QaReleaseInspectionImage());
    await page.waitForTimeout(100);
    assert.equal(await page.evaluate(() => window.V3Inspection.open), false, 'Late image decode cannot reopen a dismissed dialog');
    assert.equal(await page.evaluate(() => window.V3Inspection.backend), 'idle');
    assert.equal(await page.locator('[data-inspection-canvas]').count(), 0, 'No canvas allocated after interrupted image startup');
    assert.equal(await page.evaluate(() => document.body.style.overflow), '');
    assert.equal(await trigger.evaluate(node => node === document.activeElement), true);
    await trigger.click();
    await page.locator('[data-inspection][data-ready="true"]').waitFor({ timeout });
    assert.equal(await page.evaluate(() => window.V3Inspection.backend), 'canvas2d', 'Reopen succeeds after interrupted startup');
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !window.V3Inspection.open);
    return { interruptedBeforeImageDecode: true, staleStartupIgnored: true, reopenBackend: 'canvas2d' };
  } finally { await context.close(); }
}

async function inspection(browser, forceCanvas, mobile = false) {
  const context = await browser.newContext({ reducedMotion: 'reduce', viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 }, deviceScaleFactor: 1, hasTouch: mobile });
  await prepare(context);
  const page = await context.newPage();
  try {
    await page.goto(`${base}/v3/?renderer=${forceCanvas ? 'webgl' : 'webgpu'}`, { waitUntil: 'networkidle' });
    const trigger = page.locator('[data-inspection-open]');
    await trigger.waitFor();
    const idle = await page.evaluate(() => ({ state: { ...window.V3Inspection }, graphics: window.__v3QaGraphics }));
    assert.equal(idle.state.backend, 'idle');
    assert.equal(idle.state.renderedFrames, 0);
    assert.equal(idle.graphics.inspectionWebgpuConfigured, 0, 'No idle lens GPU setup');
    await trigger.click();
    await page.locator('[data-inspection][data-ready="true"]').waitFor({ timeout });
    const stage = page.locator('[data-inspection-stage]');
    await stage.focus();
    const initial = await page.evaluate(() => ({ ...window.V3Inspection }));
    if (forceCanvas) assert.equal(initial.backend, 'canvas2d', 'Forced safe lens fallback is Canvas2D');
    else if (requireWebGPU) {
      assert.equal(initial.backend, 'webgpu');
      await page.waitForFunction(() => window.__v3QaGraphics.inspectionTextures > 0 && window.__v3QaGraphics.completedSubmits > 0);
    }
    if (initial.backend === 'webgpu') {
      assert.equal(await page.evaluate(() => typeof window.gc), 'function');
      await page.evaluate(() => { window.gc(); window.gc(); });
      await page.waitForTimeout(200);
      assert.equal(await page.evaluate(() => window.V3Inspection.backend), 'webgpu', 'Lens adapter survives GC while open');
    }
    await page.keyboard.press('ArrowRight');
    assert.ok(await page.evaluate(x => window.V3Inspection.x > x, initial.x));
    await page.keyboard.press('+');
    assert.equal(await page.evaluate(() => window.V3Inspection.zoom), initial.zoom + .25);
    await page.keyboard.press('Home');
    assert.deepEqual(await page.evaluate(() => ({ x: window.V3Inspection.x, y: window.V3Inspection.y, zoom: window.V3Inspection.zoom })), { x: .48, y: .49, zoom: 2.5 });
    if (mobile) {
      const box = await stage.boundingBox();
      await page.touchscreen.tap(box.x + box.width * .7, box.y + box.height * .55);
      assert.notEqual(await page.evaluate(() => window.V3Inspection.x), .48);
    }
    await page.waitForTimeout(200);
    const canvas = page.locator('[data-inspection-canvas]');
    const displayed = await canvas.screenshot();
    fs.writeFileSync(path.join(output, `${engine}-inspection-${forceCanvas ? 'canvas2d' : 'webgpu'}-${mobile ? 'mobile' : 'desktop'}.png`), displayed);
    await capture(page, `inspection-${forceCanvas ? 'canvas2d' : 'webgpu'}-${mobile ? 'mobile' : 'desktop'}-dialog`);
    const frames = await page.evaluate(() => window.V3Inspection.renderedFrames);
    await page.waitForTimeout(300);
    assert.equal(await page.evaluate(() => window.V3Inspection.renderedFrames), frames, 'An idle lens has no continuous animation loop');
    let recoveredAfterLoss = false;
    if (!forceCanvas && initial.backend === 'webgpu') {
      assert.equal(await page.evaluate(() => window.__v3QaControl.destroyInspectionDevice()), true, 'Destroy the actual inspection device');
      await page.waitForFunction(previousFrames => window.V3Inspection.backend === 'canvas2d' && window.V3Inspection.readiness === 'ready' && window.V3Inspection.renderedFrames > previousFrames, frames, { timeout });
      await capture(page, 'inspection-device-loss-recovered-canvas2d');
      recoveredAfterLoss = true;
    }
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !window.V3Inspection.open);
    assert.equal(await trigger.evaluate(node => node === document.activeElement), true, 'Escape returns focus to trigger');
    assert.equal(await page.locator('[data-inspection-canvas]').count(), 0, 'Close releases the lens canvas');
    assert.equal(await page.evaluate(() => document.body.style.overflow), '', 'Close restores page scrolling');
    for (let reopen = 0; reopen < 2; reopen++) {
      await trigger.click();
      await page.locator('[data-inspection][data-ready="true"]').waitFor({ timeout });
      await page.locator('[data-inspection-close]').click();
      await page.waitForFunction(() => !window.V3Inspection.open);
    }
    const graphics = await page.evaluate(() => window.__v3QaGraphics);
    assert.deepEqual(graphics.validationErrors, []);
    assert.deepEqual(graphics.queueErrors, []);
    await checkOverflow(page); await checkRouteLeaks(page);
    return { forceCanvas, mobile, initial, recoveredAfterLoss, graphics, screenshotSHA256: sha(displayed) };
  } catch (error) {
    const failure = await page.evaluate(() => ({ inspection: window.V3Inspection, graphics: window.__v3QaGraphics })).catch(() => null);
    fs.writeFileSync(path.join(output, `${engine}-inspection-failure.json`), JSON.stringify({ error: String(error.stack || error), failure }, null, 2));
    throw error;
  } finally { await context.close(); }
}

(async () => {
  const playwright = require('playwright');
  const launchConfig = engine === 'chromium' ? require('./browser-config.cjs').chromiumConfig({ exposeGC: true }) : { headless: true };
  const browser = await playwright[engine].launch(launchConfig);
  try {
    report.browserVersion = browser.version();
    report.launchConfig = launchConfig;
    if (engine === 'chromium') await test('real WebGPU renderer', () => aircraft(browser, 'webgpu', 'normal', 'renderer=webgpu'));
    if (engine === 'chromium') await test('mobile WebGPU renderer and changed preferences', () => aircraft(browser, 'webgpu-mobile', 'normal', 'renderer=webgpu', true));
    if (engine === 'chromium') await test('completed WebGPU assembled, peel and telemetry captures', () => matchedPoses(browser, 'webgpu'));
    if (engine === 'chromium') await test('matched WebGL assembled, peel and telemetry captures', () => matchedPoses(browser, 'webgl'));
    await test('forced WebGL renderer', () => aircraft(browser, 'forced-webgl', 'normal', 'renderer=webgl'));
    if (engine === 'webkit') await test('mobile WebGL renderer and changed preferences', () => aircraft(browser, 'webgl-mobile', 'normal', 'renderer=webgl', true));
    await test('missing WebGPU fallback', () => aircraft(browser, 'missing-webgpu', 'no-gpu', 'renderer=webgpu'));
    if (engine === 'chromium') await test('adapter unavailable fallback', () => aircraft(browser, 'no-adapter', 'no-adapter', 'renderer=webgpu'));
    if (engine === 'chromium') await test('aircraft startup resumes after interrupted preferences away from section', () => interruptedAircraft(browser));
    if (engine === 'chromium') await test('actual aircraft device loss recovers to a fresh WebGL canvas', () => deviceLossRecovery(browser));
    await test('mobile routes, navigation, search and mocked booking', () => content(browser));
    if (engine === 'chromium') await test('WebGPU inspection lens and repeated dismissal', () => inspection(browser, false));
    await test('Canvas2D inspection lens and mobile keyboard/touch', () => inspection(browser, true, true));
    await test('inspection close during image loading and reopen', () => interruptedInspection(browser));
    await test('no JavaScript static content', () => staticFallback(browser, false, 'normal'));
    await test('no graphics static content', () => staticFallback(browser, true, 'no-graphics'));
  } finally { await browser.close(); }
  report.passed = report.errors.length === 0 && report.browserErrors.length === 0 && report.failedLocalResponses.length === 0;
  report.finished = new Date().toISOString(); save();
  console.log(JSON.stringify(report, null, 2));
  if (!report.passed) process.exitCode = 1;
})().catch(error => { report.errors.push(String(error.stack || error)); report.passed = false; save(); console.error(error); process.exitCode = 1; });
