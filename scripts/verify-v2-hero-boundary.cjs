#!/usr/bin/env node
/* Real-browser hero visibility regression with its own repository server.
 * Native scroll/layout/IntersectionObserver, genuine CAD, and genuine syncs.
 * Only hero-context clientWaitSync results can be held to check the existing
 * cancellation/drain gate; no controller, queue, geometry or draw is replaced.
 * Run: node scripts/verify-v2-hero-boundary.cjs
 * Optional: CHROMIUM_EXECUTABLE, HERO_BOUNDARY_ROOT, HERO_BOUNDARY_OUT,
 * V2_BROWSER_TIMEOUT. Software-WebGL results are not device/FPS claims.
 */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const root = path.resolve(process.env.HERO_BOUNDARY_ROOT || path.join(__dirname, '..'));
const output = path.resolve(process.env.HERO_BOUNDARY_OUT || '.codex-temp/hero-boundary');
const timeout = Number(process.env.V2_BROWSER_TIMEOUT || 180000);

function browserProbe() {
  const control = window.__heroBoundary = { hold: false, fences: [], finishes: 0 };
  const native = HTMLCanvasElement.prototype.getContext, seen = new WeakSet(), owned = new Map();
  HTMLCanvasElement.prototype.getContext = function (type, ...args) {
    const gl = native.call(this, type, ...args);
    if (!gl || !this.matches('[data-assembly-canvas]') || seen.has(gl) || typeof gl.fenceSync !== 'function') return gl;
    seen.add(gl);
    const create = gl.fenceSync.bind(gl), poll = gl.clientWaitSync.bind(gl), remove = gl.deleteSync.bind(gl), finish = gl.finish.bind(gl);
    gl.fenceSync = (...args) => {
      const sync = create(...args);
      if (sync) {
        const record = { id: control.fences.length + 1, phase: document.querySelector('[data-assembly]').dataset.assemblyGPUPhase,
          heldPolls: 0, maxTimeout: 0, outstandingAtCreate: control.fences.filter(item => !item.deleted).length + 1 };
        owned.set(sync, record); control.fences.push(record);
      }
      return sync;
    };
    gl.clientWaitSync = (sync, flags, wait) => {
      const status = poll(sync, flags, wait), record = owned.get(sync);
      if (record) { record.maxTimeout = Math.max(record.maxTimeout, wait); record.nativeStatus = status; }
      if (control.hold && record && status !== gl.WAIT_FAILED) { record.heldPolls++; return gl.TIMEOUT_EXPIRED; }
      return status;
    };
    gl.deleteSync = sync => { const record = owned.get(sync); if (record) record.deleted = (record.deleted || 0) + 1; return remove(sync); };
    gl.finish = (...args) => { control.finishes++; return finish(...args); };
    return gl;
  };
  control.snapshot = () => {
    const hero = document.querySelector('[data-assembly]'), stage = hero.querySelector('.v2-assembly-sticky'), canvas = hero.querySelector('canvas');
    const rect = node => { const {top, right, bottom, left, width, height} = node.getBoundingClientRect(); return {top, right, bottom, left, width, height}; };
    const bounds = rect(stage), header = rect(document.querySelector('.v2-header'));
    const readableHeight = Math.max(0, Math.min(innerHeight, bounds.bottom) - Math.max(0, header.bottom, bounds.top));
    const readableWidth = Math.max(0, Math.min(innerWidth, bounds.right) - Math.max(0, bounds.left));
    return {at: performance.now(), scrollY, root: rect(hero), stage: bounds, header, readableHeight, readableArea: readableWidth * readableHeight,
      dataset: {...hero.dataset}, submitted: Number(hero.dataset.assemblySubmittedFrames || 0), completed: Number(hero.dataset.assemblyCompletedFrames || 0),
      canvas: {width: canvas.width, height: canvas.height, bounds: rect(canvas)}, pending: control.fences.filter(item => !item.deleted).length,
      fences: control.fences.map(item => ({...item})), finishes: control.finishes};
  };
}

async function main() {
  const {chromium} = require('playwright');
  fs.mkdirSync(output, {recursive: true});
  const server = http.createServer((request, response) => {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    const file = path.resolve(root, '.' + (pathname.endsWith('/') ? pathname + 'index.html' : pathname));
    if (!file.startsWith(root + path.sep)) { response.writeHead(403); response.end(); return; }
    fs.readFile(file, (error, bytes) => {
      if (error) { response.writeHead(404); response.end(); return; }
      response.setHeader('Content-Type', ({'.js':'application/javascript', '.html':'text/html', '.css':'text/css', '.json':'application/json',
        '.svg':'image/svg+xml', '.webp':'image/webp', '.png':'image/png', '.jpg':'image/jpeg', '.woff2':'font/woff2'})[path.extname(file)] || 'application/octet-stream');
      response.end(bytes);
    });
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  let browser, context, page;
  const errors = [], evidence = [];
  try {
    browser = await chromium.launch({headless: true, executablePath: process.env.CHROMIUM_EXECUTABLE || undefined,
      args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader']});
    context = await browser.newContext({viewport: {width: 1440, height: 1000}, deviceScaleFactor: 1, reducedMotion: 'no-preference', serviceWorkers: 'block'});
    await context.addInitScript(browserProbe);
    page = await context.newPage(); page.setDefaultTimeout(timeout); page.on('pageerror', error => errors.push(error.message));
    const snapshot = () => page.evaluate(() => window.__heroBoundary.snapshot());
    const opportunities = async () => {
      await page.evaluate(async () => { for (let index = 0; index < 12; index++) await new Promise(resolve => requestAnimationFrame(resolve)); });
      await page.waitForTimeout(350);
    };
    const settled = () => page.waitForFunction(() => {
      const data = document.querySelector('[data-assembly]').dataset, probe = window.__heroBoundary;
      const stamp = [data.assemblySubmittedFrames, data.assemblyCompletedFrames, data.assemblyGPUPending].join('/');
      if (stamp !== probe.idleStamp) { probe.idleStamp = stamp; probe.idleSince = performance.now(); }
      const last = JSON.parse(data.assemblyLastSubmission || 'null');
      return data.assemblyModelsInstalled === '3' && data.assemblyGPUPending === 'false' && data.assemblyGPUCompletion === 'complete' &&
        last && Math.abs(last.value - last.raw) < 1e-12 && performance.now() - probe.idleSince >= 700;
    });
    const scrollBottom = bottom => page.evaluate(bottom => {
      const hero = document.querySelector('[data-assembly]');
      scrollTo({top: scrollY + hero.getBoundingClientRect().bottom - bottom, behavior: 'instant'});
    }, bottom);
    const held = phase => page.waitForFunction(phase => {
      const data = document.querySelector('[data-assembly]').dataset;
      return data.assemblyGPUPhase === phase && data.assemblyGPUPending === 'true' &&
        window.__heroBoundary.fences.some(item => !item.deleted && item.heldPolls > 0);
    }, phase);
    const sameCounts = (actual, expected, label) => {
      assert.equal(actual.submitted, expected.submitted, label + ': no new submission');
      assert.equal(actual.completed, expected.completed, label + ': no phantom completion');
    };
    await page.goto('http://127.0.0.1:' + server.address().port + '/v2/', {waitUntil: 'domcontentloaded', timeout});
    await settled(); const initial = await snapshot();
    assert.equal(initial.dataset.assemblyGPUCompletionEvidence, 'own-context-fence');
    assert.equal(initial.pending, 0); assert.ok(initial.completed > 0);
    evidence.push({name: 'initial-genuine-completion', state: initial});

    // Read counters before native scrolling, so even one draw caused by the
    // transition itself fails. Do not settle away an erroneous boundary draw.
    for (const bottom of [0, initial.header.bottom / 2, initial.header.bottom]) {
      await scrollBottom(bottom); await opportunities(); const state = await snapshot();
      assert.ok(Math.abs(state.root.bottom - bottom) < .51, 'Requested native section boundary');
      assert.ok(Math.abs(state.stage.bottom - bottom) < .51, 'Sticky stage really follows the section boundary');
      assert.equal(state.readableArea, 0); assert.equal(state.pending, 0);
      sameCounts(state, initial, 'Stage bottom ' + bottom);
      const frames = state.dataset.assemblyFrames;
      await opportunities(); const idle = await snapshot(); sameCounts(idle, state, 'Finite boundary idle');
      assert.equal(idle.dataset.assemblyFrames, frames, 'No hidden pose/frame loop');
      evidence.push({name: bottom === 0 ? 'exact-zero-edge' : 'header-covered-tail', state, idle});
    }

    const visibleBottom = initial.header.bottom + 3;
    await scrollBottom(visibleBottom);
    await page.waitForFunction(before => Number(document.querySelector('[data-assembly]').dataset.assemblyCompletedFrames) > before, initial.completed);
    await settled(); const visible = await snapshot();
    assert.ok(visible.readableHeight >= 2.5 && visible.readableHeight <= 3.5, 'Only three genuine readable pixels suffice');
    assert.ok(visible.submitted > initial.submitted && visible.completed > initial.completed);
    assert.equal(visible.pending, 0); evidence.push({name: 'three-pixel-completed-return', state: visible});

    // Leave while a genuine hero fence is held. On a native return, old GPU
    // commands must drain before any new drawing-buffer change or submission.
    await page.evaluate(() => { window.__heroBoundary.hold = true; const hero = document.querySelector('[data-assembly]');
      scrollTo({top: scrollY + hero.getBoundingClientRect().top + .4 * (hero.offsetHeight - hero.querySelector('.v2-assembly-sticky').clientHeight), behavior: 'instant'});
    });
    await held('frame'); const beforeExit = await snapshot();
    await scrollBottom(0);
    await page.waitForFunction(() => document.querySelector('[data-assembly]').dataset.assemblyGPUCompletion === 'canceled');
    await opportunities(); const canceled = await snapshot(); sameCounts(canceled, beforeExit, 'Pending edge exit');
    assert.equal(canceled.pending, 0); assert.equal(canceled.readableArea, 0);
    await scrollBottom(visibleBottom); await held('drain'); const drain = await snapshot();
    sameCounts(drain, canceled, 'Return drain');
    assert.equal(drain.canvas.width, canceled.canvas.width, 'Return preserves drawing-buffer width until drain');
    assert.equal(drain.canvas.height, canceled.canvas.height, 'Return preserves drawing-buffer height until drain');
    await opportunities(); const heldDrain = await snapshot(); sameCounts(heldDrain, drain, 'No queue bypass while drain remains held');
    assert.equal(heldDrain.pending, 1); assert.equal(heldDrain.dataset.assemblyGPUPhase, 'drain');
    await page.evaluate(() => { window.__heroBoundary.hold = false; });
    await page.waitForFunction(before => Number(document.querySelector('[data-assembly]').dataset.assemblyCompletedFrames) > before, canceled.completed);
    await settled(); const resumed = await snapshot();
    assert.ok(resumed.submitted > canceled.submitted); assert.equal(resumed.pending, 0);
    assert.equal(resumed.finishes, 0, 'No synchronous finish bypass');
    assert.ok(resumed.fences.length > 0 && resumed.fences.every(item => item.deleted === 1 && item.maxTimeout === 0 && item.outstandingAtCreate === 1),
      'One owned actual sync at a time, nonblocking polls, and exactly-once cleanup');
    evidence.push({name: 'canceled-exit-drain-and-completed-return', beforeExit, canceled, drain, heldDrain, resumed});
    assert.deepEqual(errors, []);
    const report = {passed: true, root, evidence, scope: 'Native boundary geometry and genuine software-WebGL completion; no device/FPS performance claim.'};
    fs.writeFileSync(path.join(output, 'hero-boundary.json'), JSON.stringify(report, null, 2) + '\n');
    console.log('PASS native exact-edge/header-tail idle, three-pixel completed return, cancellation and single-flight GPU drain');
  } catch (error) {
    const state = page ? await page.evaluate(() => window.__heroBoundary?.snapshot()).catch(() => null) : null;
    fs.writeFileSync(path.join(output, 'hero-boundary-failure.json'), JSON.stringify({error: error.stack, root, errors, evidence, state}, null, 2) + '\n');
    throw error;
  } finally {
    await context?.close(); await browser?.close(); await new Promise(resolve => server.close(resolve));
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
