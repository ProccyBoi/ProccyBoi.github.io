/* Portfolio acceptance for /v3, beyond the focused aircraft geometry suites.
 * Serve the repository on :8080, then: node scripts/verify-v3-portfolio.cjs
 * --static-only runs the source inventory/discoverability contract without a browser.
 * V3_BASE_URL accepts the origin or its /v3/ URL; V3_SCREENSHOTS selects the
 * artifact folder; CHROMIUM_EXECUTABLE is optional (Playwright browser by default).
 * This suite never submits a booking, contacts anyone, or changes site data. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const origin = new URL(process.env.V3_BASE_URL || 'http://localhost:8080/v3/').origin;
const output = path.resolve(process.env.V3_SCREENSHOTS || path.join(root, '.codex-temp/v3-portfolio'));
const staticOnly = process.argv.includes('--static-only');
const evidence = { started: new Date().toISOString(), origin, mode: staticOnly ? 'static-only' : 'full', tests: [], browser: null };
const projectSlugs = ['coaster', 'dash', 'framework-dual-usb', 'framework-expansion-card', 'framework-logic-analyser', 'framework-raspberry-pi', 'lora-receiver', 'lora-talkie', 'metroboard', 'rf-test-board', 'runswift', 'skylabs', 'switch-mode-power-supplies', 'tamagotchi-sd-card', 'tramtrace'];
const toolSlugs = ['scopelab', 'lithography-animation', 'mosfet-operating-regions'];
const primary = 'a[data-v2-project][href^="/v3/projects/"]';
const hero = '[data-aircraft-hero]';
const workbench = '#copper-data[data-board-inspector]';
const chainCounts = { l1: 45, l2: 8, l3: 30, l4: 32, status: 1 };
const hardware = '[data-hardware-portfolio]';
const hardwareProjects = [
  { key: 'tramtrace', slug: 'tramtrace', title: 'TramTrace' },
  { key: 'telemetry', slug: 'skylabs', title: 'Skylabs' },
  { key: 'pi', slug: 'framework-raspberry-pi', title: 'Raspberry Pi' }
];
// The hardware stage shares Three and lossless hero packs with the aircraft.
// Only aircraft-specific downloads are prohibited by its static preference.
const cadRequest = /\/assets\/(?:models\/aircraft\/|v3-aircraft-(?:scene|atmosphere)\.js)/;
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const sourcePages = listPages('v2').filter(file => file !== 'index.html' && !file.startsWith('render/'));
const screenshotPaths = [];
let browser;
function listPages(folder) {
  return fs.readdirSync(path.join(root, folder), { recursive: true }).filter(file => file.endsWith('index.html')).sort();
}
function attrs(tag) {
  return Object.fromEntries([...tag.matchAll(/([^\s=<>/]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)].slice(1).map(match => [match[1], match[2] ?? match[3] ?? match[4] ?? '']));
}
function tags(html, name) { return [...html.matchAll(new RegExp('<' + name + '(?=\\s|>)[^>]*>', 'gi'))].map(match => attrs(match[0])); }
function links(file) {
  const html = read(file), baseHref = tags(html, 'base')[0]?.href;
  const base = new URL(baseHref || '/' + file.replace(/index\.html$/, ''), origin);
  return tags(html, 'a').filter(tag => tag.href).map(tag => ({ ...tag, url: new URL(tag.href.replace(/&amp;/g, '&'), base) }));
}
function localFile(url) {
  const pathname = decodeURIComponent(url.pathname);
  return path.join(root, pathname.endsWith('/') ? pathname + 'index.html' : pathname);
}
async function test(name, action) {
  const started = Date.now(), entry = { name, status: 'running' };
  evidence.tests.push(entry);
  try { Object.assign(entry, await action() || {}, { status: 'passed' }); console.log('PASS ' + name); }
  catch (error) {
    entry.status = 'failed'; entry.error = error.stack || String(error); console.error('FAIL ' + name + '\n' + entry.error);
  }
  entry.durationMs = Date.now() - started;
}
async function prepareFullPageImages(page) {
  const original = await page.evaluate(() => ({ x: scrollX, y: scrollY })), checked = [];
  try {
    for (const image of await page.locator('img[alt]').all()) {
      const meaningful = await image.evaluate(node => {
        const deferred = (node.hasAttribute('data-v3-src') || node.hasAttribute('data-gallery-src')) && !node.getAttribute('src');
        // With scripting disabled the paired noscript image is the actual
        // photograph. Do not wait for a deliberately unenhanced src-less node.
        if (deferred && node.parentElement?.querySelector('noscript img')) return false;
        if (!node.alt.trim() || (!node.getClientRects().length && !deferred)) return false;
        // Offscreen photographs still qualify. Hidden alternate posters, modal
        // images and inactive states do not. Do not change loading attributes.
        for (let item = node; item; item = item.parentElement) {
          const style = getComputedStyle(item);
          if (item.hidden || (style.display === 'none' && !(item === node && deferred)) || style.visibility === 'hidden' || Number(style.opacity) === 0) return false;
        }
        return true;
      });
      if (!meaningful) continue;
      await image.evaluate(node => {
        const deferred = (node.hasAttribute('data-v3-src') || node.hasAttribute('data-gallery-src')) && !node.getAttribute('src');
        const target = deferred ? node.closest('[data-gallery-photo], .v2-gallery-more-photo') || node.parentElement : node;
        target.scrollIntoView({ block: 'center', behavior: 'instant' });
      });
      const details = await image.evaluate(async node => {
        // Scrolling triggers both native lazy loading and data-v3-src/data-gallery-src IO. Wait
        // for that real load event before decoding, including src-less images.
        await new Promise((resolve, reject) => {
          if (node.complete && node.naturalWidth > 0) return resolve();
          const cleanup = () => { clearTimeout(timer); node.removeEventListener('load', success); node.removeEventListener('error', failure); };
          const success = () => { cleanup(); resolve(); };
          const failure = () => { cleanup(); reject(new Error('Meaningful photograph failed: ' + node.alt + ' (' + (node.currentSrc || node.dataset.v3Src || node.dataset.gallerySrc || node.src) + ')')); };
          const timer = setTimeout(failure, 20000);
          node.addEventListener('load', success, { once: true }); node.addEventListener('error', failure, { once: true });
        });
        await node.decode();
        if (!node.naturalWidth || !node.naturalHeight) throw new Error('Photograph decoded without dimensions: ' + node.alt);
        return { alt: node.alt, source: node.currentSrc || node.src, width: node.naturalWidth, height: node.naturalHeight };
      });
      checked.push(details);
    }
  } finally {
    await page.evaluate(position => scrollTo({ left: position.x, top: position.y, behavior: 'instant' }), original);
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  }
  return checked;
}
async function screenshot(page, name, fullPage = false) {
  const file = name.replace(/[^a-z0-9_-]/gi, '-').toLowerCase() + '.png';
  if (fullPage) {
    const photographs = await prepareFullPageImages(page);
    (evidence.fullPagePhotographs ||= []).push({ screenshot: file, photographs });
  }
  await page.screenshot({ path: path.join(output, file), fullPage, animations: 'disabled', timeout: 30000 });
  screenshotPaths.push(file);
  return file;
}
async function newRun(options = {}) {
  const context = await browser.newContext({ viewport: options.viewport || { width: 1440, height: 900 }, reducedMotion: options.motion || 'reduce', javaScriptEnabled: options.js !== false, hasTouch: !!options.touch, isMobile: !!options.touch });
  if (options.saveData) await context.addInitScript(() => Object.defineProperty(navigator, 'connection', { configurable: true, value: { saveData: true } }));
  if (options.noWebGL) await context.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (kind, ...args) { return /webgl/i.test(kind) ? null : original.call(this, kind, ...args); };
  });
  if (options.block) await context.route(options.block, route => route.abort());
  const page = await context.newPage(), errors = [], badResponses = [], requests = [], shaders = [];
  page.setDefaultTimeout(20000);
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => requests.push(request.url()));
  page.on('response', response => { if (response.url().startsWith(origin + '/') && response.status() >= 400) badResponses.push({ status: response.status(), url: response.url() }); });
  page.on('console', message => { if (/Shader Error|VALIDATE_STATUS|Error compiling shader|THREE.WebGLProgram/.test(message.text())) shaders.push(message.text()); });
  return { context, page, errors, badResponses, requests, shaders };
}
async function browserTest(name, options, action) {
  return test(name, async () => {
    const run = await newRun(options);
    try {
      const details = await action(run);
      assert.deepEqual(run.errors, [], 'Unhandled browser exceptions');
      assert.deepEqual(run.badResponses, [], 'Failed local HTTP resources');
      assert.deepEqual(run.shaders, [], 'Shader compilation errors');
      return details;
    } catch (error) {
      try {
        // A modal makes the background inert and may lock its scroll. Capture
        // that visible failure directly; do not wait for unreachable lazy photos.
        const modalOpen = await run.page.locator('dialog[open]').count() > 0;
        await screenshot(run.page, 'failure-' + name, !modalOpen);
      } catch {}
      const file = 'failure-' + name.replace(/[^a-z0-9_-]/gi, '-').toLowerCase() + '.json';
      fs.writeFileSync(path.join(output, file), JSON.stringify({ url: run.page.url(), errors: run.errors, badResponses: run.badResponses, shaders: run.shaders, requests: run.requests, inputDiagnostics: await run.page.evaluate(() => window.__v3InputDiagnostics || null).catch(() => null), layoutDiagnostics: await run.page.evaluate(() => window.__v3LayoutDiagnostics || null).catch(() => null) }, null, 2));
      throw error;
    } finally { await run.context.close(); }
  });
}
async function visit(page, route = '/v3/') {
  const response = await page.goto(origin + route, { waitUntil: 'domcontentloaded' });
  assert.equal(response.status(), 200, route + ' responds successfully');
  await page.waitForLoadState('load');
  await page.evaluate(() => document.fonts.ready);
}
async function performanceData(page) {
  return page.evaluate(() => {
    const navigation = performance.getEntriesByType('navigation')[0], resources = performance.getEntriesByType('resource');
    const milliseconds = value => Number.isFinite(value) ? Math.round(value * 100) / 100 : null;
    return {
      url: location.href,
      domContentLoadedMs: navigation ? milliseconds(navigation.domContentLoadedEventEnd - navigation.startTime) : null,
      loadMs: navigation?.loadEventEnd ? milliseconds(navigation.loadEventEnd - navigation.startTime) : null,
      elapsedSinceNavigationMs: milliseconds(performance.now()),
      documentTransferBytes: navigation?.transferSize ?? null,
      resourceCount: resources.length,
      resourceTransferBytes: resources.reduce((sum, entry) => sum + (entry.transferSize || 0), 0),
      resourceDecodedBytes: resources.reduce((sum, entry) => sum + (entry.decodedBodySize || 0), 0),
      resourcesWithReportedTransferBytes: resources.filter(entry => entry.transferSize > 0).length
    };
  });
}
async function noOverflow(page, label) {
  const dimensions = await page.evaluate(label => {
    const result = { scroll: document.documentElement.scrollWidth, viewport: innerWidth, scrollX, scrollY };
    if (result.scroll <= result.viewport + 1) return result;
    const describe = node => ({ tag: node.tagName.toLowerCase(), id: node.id || undefined,
      className: typeof node.className === 'string' ? node.className : node.className?.baseVal,
      data: Object.fromEntries(Object.entries(node.dataset || {}).filter(([key]) => /hardware|aircraft|copper/.test(key))) });
    const bounds = rect => Object.fromEntries(['x', 'y', 'width', 'height', 'left', 'right'].map(key => [key, Math.round(rect[key] * 100) / 100]));
    result.outOfBounds = [...document.body.querySelectorAll('*')].flatMap(node => {
      const rect = node.getBoundingClientRect(), style = getComputedStyle(node);
      if (!rect.width || !rect.height || style.display === 'none' || !(rect.left < -1 || rect.right > innerWidth + 1)) return [];
      const ancestors = [];
      for (let ancestor = node.parentElement; ancestor && ancestors.length < 5; ancestor = ancestor.parentElement) {
        const css = getComputedStyle(ancestor);
        ancestors.push({ ...describe(ancestor), ...bounds(ancestor.getBoundingClientRect()), overflowX: css.overflowX, overflowY: css.overflowY, position: css.position, transform: css.transform });
      }
      return [{ ...describe(node), ...bounds(rect), overflowX: style.overflowX, overflowY: style.overflowY, position: style.position,
        display: style.display, visibility: style.visibility, transform: style.transform, minWidth: style.minWidth, maxWidth: style.maxWidth,
        scrollWidth: node.scrollWidth, clientWidth: node.clientWidth, ancestors }];
    }).sort((a, b) => Math.max(b.right - innerWidth, -b.left) - Math.max(a.right - innerWidth, -a.left)).slice(0, 80);
    (window.__v3LayoutDiagnostics ||= []).push({ label, url: location.href, ...result });
    return result;
  }, label);
  assert.ok(dimensions.scroll <= dimensions.viewport + 1, label + ': horizontal overflow ' + JSON.stringify(dimensions));
}
async function loaded(image) {
  await image.scrollIntoViewIfNeeded();
  await image.evaluate(node => node.decode());
  assert.equal(await image.evaluate(node => node.complete && node.naturalWidth > 0 && !!node.alt.trim()), true, 'Meaningful photograph is decoded');
}
async function staticAircraft(page) {
  assert.equal(await page.locator(hero + '.is-story').count(), 0, 'Fallback removes the long pinned scroll track');
  for (const id of ['aircraft', 'telemetry']) {
    const chapter = page.locator('#' + id);
    assert.equal(await chapter.isVisible(), true, id + ' copy remains visible');
    assert.equal(await chapter.evaluate(node => node.inert || node.getAttribute('aria-hidden') === 'true'), false);
  }
  await loaded(page.locator('[data-aircraft-poster]'));
  assert.equal(await page.locator('#telemetry a[href="/v3/projects/skylabs/boards/telemetry/"]').count(), 1);
  assert.equal(await page.locator('a[href="/v3/projects/"]').count() > 0, true);
  await noOverflow(page, 'Aircraft fallback');
}
async function approachAircraft(page) {
  await page.locator(hero).evaluate(node => scrollTo({ top: scrollY + node.getBoundingClientRect().top, behavior: 'instant' }));
}
async function selectedAircraftCopy(page, chapter) {
  const copy = page.locator('[data-aircraft-copy] article[data-aircraft-chapter="' + chapter + '"]');
  await page.waitForFunction(index => {
    const node = document.querySelector('[data-aircraft-copy] article[data-aircraft-chapter="' + index + '"]');
    return node && node.getAnimations({ subtree: true }).every(animation => !['running', 'pending'].includes(animation.playState));
  }, chapter);
  assert.equal(await copy.isVisible(), true, 'Selected aircraft copy is visible');
  assert.equal(await copy.getAttribute('aria-hidden'), 'false');
  assert.equal(await copy.evaluate(node => node.inert), false);
  const bounds = await copy.boundingBox(), viewport = page.viewportSize();
  const headerBottom = await page.locator('.site-header, .v2-header').first().evaluate(node => Math.max(0, node.getBoundingClientRect().bottom));
  const navigationTop = await page.locator('[data-aircraft-nav]').evaluate(node => node.getBoundingClientRect().top);
  assert.ok(bounds.x >= -1 && bounds.x + bounds.width <= viewport.width + 1, 'Selected copy fits viewport width');
  assert.ok(bounds.y >= headerBottom - 1 && bounds.y + bounds.height <= Math.min(viewport.height, navigationTop) + 1, 'Selected copy fits between the header and aircraft navigation');
}
async function waitAircraftDestination(page, chapter, previousFrames) {
  await page.waitForFunction(({ chapter, previousFrames }) => {
    const state = document.querySelector('[data-aircraft-hero]').dataset;
    return state.aircraftState === 'ready' && state.aircraftChapter === String(chapter) && Number(state.aircraftFrames) > previousFrames &&
      (chapter === 0 ? state.aircraftPhase === 'stopped' && Number(state.aircraftProgress) < .01 : state.aircraftPhase === 'telemetry' && Number(state.aircraftProgress) === 1);
  }, { chapter, previousFrames }, { timeout: 30000 });
  await selectedAircraftCopy(page, chapter);
  await noOverflow(page, 'Rendered aircraft destination ' + chapter);
}
async function searchCount(page, count) {
  await page.waitForFunction(({ selector, count }) => [...document.querySelectorAll(selector)].filter(node => !node.hidden && !node.closest('[hidden]')).length === count, { selector: primary, count });
  assert.equal(await page.locator(primary + ':visible').count(), count);
}
function tramTraceSourceData() {
  const context = { window: {} }; vm.createContext(context);
  for (const file of ['assets/tramtrace-board-data.js', 'assets/tramtrace-component-data.js']) vm.runInContext(read(file), context, { filename: file });
  return JSON.parse(JSON.stringify(context.window.tramTraceBoardData));
}
async function openWorkbench(page) {
  await visit(page, '/v3/projects/tramtrace/#copper-data');
  const board = page.locator(workbench);
  assert.equal(await board.count(), 1, 'Exactly one in-page copper/data workbench');
  await board.locator('[data-chain-list] button').last().waitFor({ state: 'attached' });
  return board;
}
async function activateKeyboard(page, button) { await button.focus(); await page.keyboard.press('Enter'); }
async function frameReadout(board, key, step) {
  const length = chainCounts[key], bits = step * 24;
  assert.equal(await board.getAttribute('data-chain'), key);
  assert.equal(await board.locator('[data-frame-slider]').inputValue(), String(step));
  assert.equal(await board.locator('[data-frame-slider]').getAttribute('max'), String(length));
  assert.equal((await board.locator('[data-frame-progress]').textContent()).trim(), `${step} / ${length}`);
  assert.equal((await board.locator('[data-frame-bits]').textContent()).replace(/[^0-9]/g, ''), String(bits));
  assert.equal((await board.locator('[data-frame-time]').textContent()).trim(), `${(bits / 800).toFixed(2)} ms`);
}
async function assertStopped(page, board) {
  assert.equal(await board.locator('[data-frame-play]').getAttribute('aria-label'), 'Play data frame');
  const value = await board.locator('[data-frame-slider]').inputValue();
  // Longer than two reduced-motion playback ticks (360 ms) proves that a
  // pause/reset/mode switch cancelled the interval, not just its label.
  await page.waitForTimeout(800);
  assert.equal(await board.locator('[data-frame-slider]').inputValue(), value, 'Stopped playback cannot advance later');
}
async function approachHardware(page) {
  await page.locator(hardware).evaluate(node => scrollTo({ top: Math.max(0, scrollY + node.getBoundingClientRect().top - 80), behavior: 'instant' }));
}
async function hardwareSettled(page, project = 'tramtrace', view = 'overview') {
  await page.waitForFunction(({ project, view }) => {
    const root = document.querySelector('[data-hardware-portfolio]');
    if (root?.dataset.model === 'fallback') throw new Error('Hardware fell back instead of rendering actual WebGL');
    return root?.dataset.model === 'ready' && root.dataset.cameraState === 'settled' && root.dataset.project === project && root.dataset.view === view &&
      root.getAnimations({ subtree: true }).every(animation => !['running', 'pending'].includes(animation.playState));
  }, { project, view }, { timeout: 120000 });
}
async function selectHardware(page, project, view = 'overview') {
  await activateKeyboard(page, page.locator(hardware + ' button[data-project="' + project + '"]'));
  await hardwareSettled(page, project);
  if (view !== 'overview') {
    await activateKeyboard(page, page.locator(hardware + ' button[data-view="' + view + '"]'));
    await hardwareSettled(page, project, view);
  }
}
async function hardwareSnapshot(page) {
  return page.evaluate(() => {
    const { models, camera, renderer, state } = window.__hardwareStudy;
    return { state, camera: [...camera.position.toArray(), ...camera.quaternion.toArray(), ...camera.projectionMatrix.toArray()],
      frames: renderer.info.render.frame, triangles: renderer.info.render.triangles, contextLost: renderer.getContext().isContextLost(),
      models: [...models].map(([key, model]) => {
        const nodes = [];
        model.group.traverse(node => nodes.push({ name: node.name, uuid: node.uuid, position: node.position.toArray(), quaternion: node.quaternion.toArray(), scale: node.scale.toArray(),
          geometry: node.geometry ? { uuid: node.geometry.uuid, vertices: node.geometry.attributes.position?.count, indices: node.geometry.index?.count } : null }));
        return { key, visible: model.group.visible, nodes };
      }) };
  });
}
async function hardwarePixels(page) {
  return page.evaluate(() => {
    const { renderer, scene, camera } = window.__hardwareStudy, T = window.THREE;
    // Read a real WebGL render, rather than accepting a ready dataset alone.
    // This is an explicit diagnostic render, outside the idle-render check.
    const previous = renderer.getRenderTarget(), target = new T.WebGLRenderTarget(96, 96), rgba = new Uint8Array(96 * 96 * 4);
    renderer.setRenderTarget(target); renderer.render(scene, camera); renderer.readRenderTargetPixels(target, 0, 0, 96, 96, rgba);
    renderer.setRenderTarget(previous); target.dispose();
    let opaque = 0, colored = 0;
    for (let i = 0; i < rgba.length; i += 4) {
      if (rgba[i + 3] > 100) opaque++;
      if (rgba[i + 3] > 100 && Math.max(rgba[i], rgba[i + 1], rgba[i + 2]) - Math.min(rgba[i], rgba[i + 1], rgba[i + 2]) > 10) colored++;
    }
    return { opaque, colored };
  });
}
async function assertHardwareSelection(page, project, view = 'overview') {
  const specification = hardwareProjects.find(item => item.key === project), section = page.locator(hardware);
  await hardwareSettled(page, project, view);
  assert.equal(await section.locator('button[data-project][aria-pressed="true"]').count(), 1, 'Exactly one physical project is selected');
  assert.equal(await section.locator('button[data-project="' + project + '"]').getAttribute('aria-pressed'), 'true');
  assert.match(await section.locator('h1').textContent(), new RegExp(specification.title, 'i'));
  const link = section.locator('.project a');
  assert.equal(await link.getAttribute('href'), '/v3/projects/' + specification.slug + '/');
  assert.equal(await link.isVisible(), true, 'The selected real case is reachable');
  assert.ok((await link.textContent()).trim());
  assert.equal(await section.locator('button[data-view]:visible').count(), project === 'tramtrace' ? 3 : 0, 'Only TramTrace offers implemented inspection modes');
  if (project === 'tramtrace') assert.equal(await section.locator('button[data-view="' + view + '"]').getAttribute('aria-pressed'), 'true');
  assert.equal(await section.locator('.scene-status').getAttribute('aria-live'), 'polite');
  assert.ok((await section.locator('.scene-status').textContent()).trim(), 'Current view has a nonempty status');
  const snapshot = await hardwareSnapshot(page);
  assert.equal(snapshot.contextLost, false); assert.ok(snapshot.frames > 0); assert.ok(snapshot.triangles > 0);
  assert.deepEqual(snapshot.models.filter(model => model.visible).map(model => model.key), [project], 'Every inactive model is hidden after camera settlement');
  const pixels = await hardwarePixels(page);
  assert.ok(pixels.opaque > 40 && pixels.colored > 20, 'Actual WebGL contains visible colored hardware: ' + JSON.stringify(pixels));
  await noOverflow(page, 'Physical hardware ' + project + ' ' + view);
  return { project, view, frames: snapshot.frames, triangles: snapshot.triangles, pixels };
}
async function assertHardwareIdle(page, project = 'tramtrace', view = 'overview') {
  await hardwareSettled(page, project, view);
  // Allow one ResizeObserver/preload completion, then observe much longer than
  // a display frame. No test-induced renders occur inside this observation.
  await page.waitForTimeout(350);
  const before = await hardwareSnapshot(page);
  await page.waitForTimeout(900);
  const after = await hardwareSnapshot(page);
  assert.equal(after.frames, before.frames, 'A settled stage performs no ongoing idle render loop');
  assert.deepEqual(after.camera, before.camera, 'No idle camera orbit or drift');
  for (const model of before.models) assert.deepEqual(after.models.find(item => item.key === model.key), model, 'No already-loaded model or part drifts while idle');
  assert.deepEqual(after.models.filter(model => model.visible).map(model => model.key), [project], 'Background preloads stay hidden');
  return { framesBefore: before.frames, framesAfter: after.frames, observedMs: 900 };
}
async function assertUsableControl(page, locator, label) {
  await locator.scrollIntoViewIfNeeded();
  const geometry = await locator.evaluate(node => {
    const b = node.getBoundingClientRect(), hit = document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2);
    return { x: b.x, y: b.y, width: b.width, height: b.height, inViewport: b.left >= 0 && b.right <= innerWidth + 1 && b.top >= 0 && b.bottom <= innerHeight + 1, exposed: !!hit && (hit === node || node.contains(hit)) };
  });
  assert.ok(geometry.width >= 24 && geometry.height >= 24, label + ' meets minimum native touch target size: ' + JSON.stringify(geometry));
  assert.ok(geometry.inViewport && geometry.exposed, label + ' is reachable and not covered by the model/copy: ' + JSON.stringify(geometry));
  await locator.focus();
  assert.equal(await locator.evaluate(node => node === document.activeElement), true, label + ' accepts keyboard focus');
  return geometry;
}
async function supportingPhotoFrames(page) {
  const frames = [];
  for (const image of await page.locator('.v3-more-grid img').all()) {
    await loaded(image);
    const frame = await image.evaluate(node => { const b = node.getBoundingClientRect(); return { source: node.currentSrc, width: b.width, height: b.height, naturalWidth: node.naturalWidth, naturalHeight: node.naturalHeight, objectFit: getComputedStyle(node).objectFit }; });
    assert.ok(frame.width > 0 && frame.height > 0 && Math.abs(frame.width / frame.height - 1.5) < .01, 'Supporting photograph uses its intended 3:2 frame: ' + JSON.stringify(frame));
    frames.push(frame);
  }
  assert.equal(frames.length, 3, 'All three supporting builds are measured');
  return frames;
}
async function pointerDrag(page, locator, dx, dy = 0) {
  await locator.scrollIntoViewIfNeeded();
  const bounds = await locator.boundingBox(), x = bounds.x + bounds.width / 2, y = bounds.y + bounds.height / 2;
  await page.mouse.move(x, y); await page.mouse.down();
  await page.mouse.move(x + dx, y + dy, { steps: 8 }); await page.mouse.up();
}
async function touchDrag(context, page, locator, dx, dy = 0, cancel = false) {
  await locator.scrollIntoViewIfNeeded();
  const bounds = await locator.boundingBox(), x = bounds.x + bounds.width / 2, y = bounds.y + bounds.height / 2;
  await page.evaluate(({ x, y, dx, dy, cancel }) => {
    const log = window.__v3InputDiagnostics;
    if (!log) return;
    const hit = document.elementFromPoint(x, y), ancestry = [];
    for (let node = hit; node; node = node.parentElement) {
      const css = getComputedStyle(node);
      ancestry.push({ tag: node.tagName, className: typeof node.className === 'string' ? node.className : undefined,
        project: node.dataset?.project, touchAction: css.touchAction, pointerEvents: css.pointerEvents, overflowX: css.overflowX, overflowY: css.overflowY });
    }
    (log.inputs ||= []).push({ phase: log.phase, x, y, dx, dy, cancel, scrollX, scrollY, ancestry });
  }, { x, y, dx, dy, cancel });
  const client = await context.newCDPSession(page);
  try {
    await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] });
    for (let step = 1; step <= 8; step++) await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + dx * step / 8, y: y + dy * step / 8, id: 1 }] });
    await client.send('Input.dispatchTouchEvent', { type: cancel ? 'touchCancel' : 'touchEnd', touchPoints: [] });
  } finally { await client.detach(); }
}
async function rangeViaKeyboard(page, range, value) {
  await range.focus(); await page.keyboard.press(value <= 50 ? 'Home' : 'End');
  for (let count = 0; count < (value <= 50 ? value : 100 - value); count++) await page.keyboard.press(value <= 50 ? 'ArrowRight' : 'ArrowLeft');
}
async function staticTests() {
  await test('15 public projects and 23 preserved interiors', () => {
    assert.equal(sourcePages.length, 23);
    assert.deepEqual(listPages('v3'), ['index.html', ...sourcePages].sort());
    const collection = links('v3/projects/index.html').filter(link => 'data-v2-project' in link);
    assert.deepEqual(collection.map(link => link.url.pathname.replace(/^\/v3\/projects\/|\/$/g, '')).sort(), projectSlugs);
    for (const file of sourcePages) assert.ok(fs.statSync(path.join(root, 'v3', file)).size > 0, file);
    for (const slug of toolSlugs) assert.ok(!collection.some(link => link.url.pathname === '/v3/projects/' + slug + '/'), 'Tools must not inflate the project count');
    return { projects: projectSlugs, interiors: sourcePages };
  });
  await test('Core navigation CV contact files booking and preserved tool routes', () => {
    const core = ['v3/index.html', 'v3/projects/index.html', 'v3/about/index.html'];
    const all = core.flatMap(links), paths = new Set(all.filter(link => link.url.origin === origin).map(link => link.url.pathname));
    for (const route of ['/v3/projects/', '/v3/about/', '/shared/', '/book/', '/assets/documents/Andrew_Chung_Public_CV.pdf']) {
      assert.ok(paths.has(route), 'Core v3 routes must expose ' + route);
      assert.ok(fs.existsSync(localFile(new URL(route, origin))), route + ' target exists');
    }
    assert.ok(all.some(link => link.href === 'mailto:andrew.noah.chung@gmail.com'));
    assert.ok(links('v3/projects/skylabs/index.html').some(link => link.url.pathname === '/shared/flight-review/'));
    const originalCollection = links('projects/index.html');
    for (const slug of toolSlugs) {
      assert.ok(fs.existsSync(localFile(new URL('/v3/projects/' + slug + '/', origin))), 'Existing v3 tool route preserved');
      assert.ok(originalCollection.some(link => link.url.pathname === '/projects/' + slug + '/'), 'Original public tool index remains intact');
    }
    for (const file of core) {
      const html = read(file);
      assert.equal(tags(html, 'h1').length, 1, file + ': one h1');
      assert.ok(tags(html, 'nav').some(tag => tag['aria-label'] === 'Primary navigation'), file + ': labelled native primary navigation');
      assert.ok(links(file).some(link => link.url.pathname === '/v3/'), file + ': home link');
    }
    return { routes: [...paths].sort() };
  });
  await test('Physical hardware opening uses the original models and implemented controls', () => {
    const home = read('v3/index.html'), styles = tags(home, 'link').filter(tag => tag.rel === 'stylesheet').map(tag => tag.href.split('?')[0]);
    const scripts = tags(home, 'script').filter(tag => tag.src).map(tag => tag.src.split('?')[0]);
    assert.ok(styles.some(href => /^\/assets\/v3-hardware.*\.css$/.test(href)), 'Physical hardware presentation is loaded');
    assert.equal(styles.some(href => /v3-folio|v2-gallery/.test(href)), false, 'Rejected folio/gallery presentation is absent');
    assert.equal(scripts.some(href => /v3-folio|v2-gallery/.test(href)), false);
    const stageScripts = scripts.filter(src => /^\/assets\/v3-hardware.*\.js$/.test(src));
    assert.ok(stageScripts.includes('/assets/v3-hardware-stage.js'), 'The stage controller is included');
    const stageSource = read('assets/v3-hardware-stage.js');
    for (const dependency of ['v3-hardware-copper.js', 'v3-hardware-pixels.js']) assert.ok(stageSource.includes(dependency), dependency + ' is an explicit dynamic dependency');
    for (const src of stageScripts) assert.ok(fs.existsSync(path.join(root, src)), src);
    const sections = tags(home, 'section').filter(tag => 'data-hardware-portfolio' in tag);
    assert.equal(sections.length, 1);
    assert.deepEqual(tags(home, 'button').filter(tag => 'data-project' in tag).map(tag => tag['data-project']), hardwareProjects.map(item => item.key));
    assert.deepEqual(tags(home, 'button').filter(tag => 'data-view' in tag).map(tag => tag['data-view']), ['overview', 'controller', 'copper']);
    assert.ok(home.indexOf('data-hardware-portfolio') < home.indexOf('data-aircraft-hero'));
    assert.match(home, /Illustrative LED test/i);
    assert.ok(!/<article\b[^>]*data-aircraft-chapter="0"[^>]*>[\s\S]*?<h1/.test(home), 'Aircraft story remains subordinate');
    const nav = home.match(/<nav\b[^>]*aria-label="Primary navigation"[^>]*>([\s\S]*?)<\/nav>/)?.[1];
    assert.ok(nav); assert.equal(/>\s*Tools\b|href="[^"]*#tools"/i.test(nav), false);
    const footer = home.match(/<footer\b[\s\S]*?<\/footer>/)?.[0] || '';
    for (const target of ['/shared/', '/book/', '/assets/documents/Andrew_Chung_Public_CV.pdf']) assert.ok(tags(footer, 'a').some(tag => tag.href === target));
    for (const name of ['tramtrace', 'telemetry', 'pi']) assert.ok(fs.statSync(path.join(root, 'assets/models/hero/' + name + '.idx.bin.gz')).size > 1000);
    return { projects: hardwareProjects, originalLosslessModels: true, obsoleteFolioRemoved: true };
  });
  await test('Native copper control references the real fabrication artwork', () => {
    const home = read('v3/index.html'), slider = tags(home, 'input').find(tag => tag.id === 'copper-range');
    assert.ok(slider); assert.deepEqual([slider.type, slider.min, slider.max, slider.step || '1', slider.value], ['range', '0', '100', '1', '50']);
    assert.ok(slider['aria-label'] || tags(home, 'label').some(tag => tag.for === 'copper-range'), 'Range has a meaningful accessible name');
    const scripts = ['assets/v3-hardware-stage.js', 'assets/v3-hardware-copper.js', 'assets/v3-hardware-pixels.js'].map(read).join('\n');
    const artwork = '/assets/models/manufacturing/tramtrace/front-copper.svg';
    assert.ok(scripts.includes(artwork), 'The overlay uses original fabrication copper rather than an invented drawing');
    assert.ok(fs.statSync(path.join(root, artwork)).size > 1000);
    assert.match(scripts, /native-window-materials/, 'Illustrative pixels color the original LED package windows');
    assert.match(scripts, /tramtrace-kicad-source\.glb/, 'Pixel registration identifies the original CAD source');
    assert.equal(/setInterval\(|Date\.now\(\).*vehicle/.test(scripts), false, 'No fabricated live vehicle loop is introduced');
    return { fabricationArtwork: artwork, slider: 'native range', pixels: 'original WS2812 windows' };
  });
  await test('TramTrace in-page workbench uses production electrical data', () => {
    const html = read('v3/projects/tramtrace/index.html'), data = tramTraceSourceData();
    const wrappers = tags(html, 'section').filter(tag => tag.id === 'copper-data' && 'data-board-inspector' in tag);
    assert.equal(wrappers.length, 1);
    assert.ok(wrappers[0].class.split(/\s+/).includes('inspector-main'));
    assert.equal(tags(html, 'main').some(tag => tag.class?.split(/\s+/).includes('inspector-main')), false, 'Mode-scoped CSS belongs to the workbench, not an ancestor');
    for (const [key, value] of Object.entries({ 'data-mode': 'assembled', 'data-view': 'inspect', 'data-chain': 'l1', 'data-hotspots': 'visible' })) assert.equal(wrappers[0][key], value);
    assert.equal((html.match(/\bdata-pcb-object(?:\s|>)/g) || []).length, 1, 'Keep the separate existing 3D viewer');
    const scripts = tags(html, 'script').filter(tag => tag.src).map(tag => new URL(tag.src, origin + '/').pathname);
    const required = ['/assets/tramtrace-board-data.js', '/assets/tramtrace-component-data.js', '/assets/tramtrace-inspector.js'];
    assert.deepEqual(scripts.filter(src => required.includes(src)), required, 'One ordered copy of each production controller/data source');
    assert.equal(data.pixelCount, 116); assert.equal(data.bitsPerPixel, 24); assert.equal(data.dataRate, 800000);
    assert.deepEqual(Object.keys(data.chains).sort(), Object.keys(chainCounts).sort());
    assert.equal(data.components.length, 10);
    const references = [];
    for (const [key, count] of Object.entries(chainCounts)) {
      const chain = data.chains[key]; assert.equal(chain.leds.length, count); assert.equal(chain.traces.length, count);
      references.push(...chain.leds.map(led => led[0]));
      assert.ok(chain.leds.every(led => led.slice(1).every(Number.isFinite)), 'Finite pixel coordinates');
      assert.ok(chain.traces.every(connection => connection.length && connection.every(segment => segment.length === 5 && segment.every(Number.isFinite))), 'Finite source copper segments');
    }
    assert.equal(references.length, 116); assert.equal(new Set(references).size, 116);
    for (const layer of ['front-copper', 'back-copper']) assert.ok(tags(html, 'img').some(tag => tag.src?.endsWith('tramtrace-' + layer + '.svg')), layer + ' fabrication asset retained');
    return { chains: chainCounts, pixels: 116, components: 10, bitsPerPixel: 24, dataRate: 800000 };
  });
  await test('Approved two-chapter aircraft and gallery hooks remain', () => {
    const home = read('v3/index.html');
    assert.deepEqual(tags(home, 'article').filter(tag => 'data-aircraft-chapter' in tag).map(tag => tag.id), ['aircraft', 'telemetry']);
    assert.equal(/Anatomy of an aircraft|id="inside"|href="#inside"|data-aircraft-detail=|v3-aircraft-details/.test(home), false);
    assert.deepEqual(tags(home, 'a').filter(tag => 'data-aircraft-go' in tag).map(tag => tag.href), ['#aircraft', '#telemetry']);
    const aircraftFooter = home.match(/<div\b[^>]*class="v3-aircraft-foot"[^>]*>([\s\S]*?)<\/div>/)?.[1];
    assert.ok(aircraftFooter, 'Aircraft footer exists');
    const onward = tags(aircraftFooter, 'a').filter(tag => tag.class?.split(/\s+/).includes('v3-story-skip'));
    assert.equal(onward.length, 1); assert.equal(onward[0].href, '#more-work', 'Downward aircraft footer navigation goes onward to More builds');
    assert.match(aircraftFooter, />More builds\s*</);
    assert.equal(tags(home, 'section').filter(tag => tag.id === 'more-work').length, 1);
    assert.ok(home.indexOf('id="more-work"') > home.indexOf('data-aircraft-hero'), 'More builds is below the aircraft');
    const gallery = read('v3/projects/tramtrace/index.html');
    assert.ok(tags(gallery, 'img').filter(tag => 'data-zoomable' in tag).length >= 3);
    assert.equal(tags(gallery, 'dialog').filter(tag => 'data-lightbox' in tag).length, 1);
    return { aircraftDestinations: ['aircraft', 'telemetry'], numberedOverlay: false };
  });
}
async function browserTests() {
  await browserTest('desktop navigation identity and fully loaded first page', {}, async ({ page }) => {
    await visit(page); await hardwareSettled(page);
    const initialHomePerformance = await performanceData(page);
    assert.equal(await page.locator('h1').isVisible(), true);
    assert.match(await page.locator('.site-header').textContent(), /Andrew Chung/);
    assert.match(await page.locator(hardware).textContent(), /electrical engineering/i);
    const firstScreen = await page.locator(hardware).evaluate(section => {
      const bounds = selector => { const r = section.querySelector(selector).getBoundingClientRect(); return { top: r.top, bottom: r.bottom, width: r.width, height: r.height }; };
      return { title: bounds('h1'), copy: bounds('.project p:not(.eyebrow)'), caseLink: bounds('.project a'), viewport: innerHeight };
    });
    for (const key of ['title', 'copy', 'caseLink']) assert.ok(firstScreen[key].top >= 0 && firstScreen[key].bottom <= firstScreen.viewport && firstScreen[key].width > 0, key + ' is readable without first scrolling');
    const skip = page.locator('a[href$="#main"]').first();
    await skip.focus(); await page.keyboard.press('Enter'); assert.equal(new URL(page.url()).hash, '#main');
    await noOverflow(page, 'Desktop home');
    await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
    await screenshot(page, 'desktop-home'); await screenshot(page, 'desktop-home-full', true);
    const inspectedHomePerformance = await performanceData(page);
    assert.equal(await page.evaluate(() => '__hardwareStudy' in window), false, 'Production URL does not expose capture-only hardware internals');
    await page.locator('.site-header nav a[href="/v3/projects/"]').click(); await page.waitForURL('**/v3/projects/'); await searchCount(page, 15);
    await screenshot(page, 'desktop-collection-full', true);
    await visit(page, '/v3/about/'); await screenshot(page, 'desktop-about-full', true);
    return { firstScreen, performance: { initialHome: initialHomePerformance, afterFullPageViewing: inspectedHomePerformance } };
  });
  for (const [device, viewport] of [['desktop', { width: 1440, height: 900 }], ['mobile', { width: 390, height: 844 }]]) {
    await browserTest(device + ' actual WebGL projects camera inspection and stationary geometry', { viewport, touch: device === 'mobile', motion: 'no-preference' }, async ({ page }) => {
      await visit(page, '/v3/?capture=1'); await hardwareSettled(page);
      const observations = [], baselines = new Map();
      for (const item of hardwareProjects) {
        await selectHardware(page, item.key); observations.push(await assertHardwareSelection(page, item.key));
        baselines.set(item.key, (await hardwareSnapshot(page)).models.find(model => model.key === item.key).nodes);
        await approachHardware(page); await screenshot(page, device + '-hardware-' + item.key);
        await assertUsableControl(page, page.locator(hardware + ' button[data-project="' + item.key + '"]'), item.title + ' selector');
      }
      await selectHardware(page, 'tramtrace');
      const overview = await hardwareSnapshot(page);
      for (const view of ['controller', 'copper', 'overview']) {
        await activateKeyboard(page, page.locator(hardware + ' button[data-view="' + view + '"]'));
        await hardwareSettled(page, 'tramtrace', view); observations.push(await assertHardwareSelection(page, 'tramtrace', view));
        const current = await hardwareSnapshot(page);
        assert.deepEqual(current.models.find(model => model.key === 'tramtrace').nodes, baselines.get('tramtrace'), 'Inspection moves the camera, never rearranges original parts');
        if (view === 'controller') {
          assert.notDeepEqual(current.camera, overview.camera, 'Controller is a genuine closer authored camera');
          assert.match(await page.locator(hardware + ' .project').textContent(), /U3|ESP32/);
          const framing = await page.evaluate(() => {
            const { models, camera } = window.__hardwareStudy, object = models.get('tramtrace').group.getObjectByName('U3');
            const point = object.getWorldPosition(new THREE.Vector3()).project(camera);
            return { x: point.x, y: point.y, z: point.z };
          });
          assert.ok(Math.abs(framing.x) < 1 && Math.abs(framing.y) < 1 && framing.z > -1 && framing.z < 1, 'The actual U3 controller is inside the camera frame: ' + JSON.stringify(framing));
        }
        await approachHardware(page); await screenshot(page, device + '-hardware-tramtrace-' + view);
      }
      // Repeat every project after all models are loaded. A stale async result
      // must never reappear, and the original transform/geometry stays intact.
      for (const item of [...hardwareProjects].reverse()) {
        await selectHardware(page, item.key); await assertHardwareSelection(page, item.key);
        assert.deepEqual((await hardwareSnapshot(page)).models.find(model => model.key === item.key).nodes, baselines.get(item.key));
      }
      await selectHardware(page, 'tramtrace');
      const idle = await assertHardwareIdle(page);
      return { viewport, observations, stationaryOriginalGeometry: true, idle };
    });
  }
  await browserTest('physical project and controller deep links reload and native history', {}, async ({ page }) => {
    await visit(page, '/v3/?capture=1&qa=hardware&project=tramtrace&view=controller#work');
    await hardwareSettled(page, 'tramtrace', 'controller'); await assertHardwareSelection(page, 'tramtrace', 'controller');
    await page.reload({ waitUntil: 'load' }); await hardwareSettled(page, 'tramtrace', 'controller');
    await selectHardware(page, 'telemetry'); await selectHardware(page, 'pi');
    await page.goBack(); await hardwareSettled(page, 'telemetry');
    await page.goBack(); await hardwareSettled(page, 'tramtrace', 'controller');
    await page.goForward(); await hardwareSettled(page, 'telemetry');
    await page.goForward(); await hardwareSettled(page, 'pi'); await assertHardwareSelection(page, 'pi');
    const length = await page.evaluate(() => history.length);
    await selectHardware(page, 'pi'); assert.equal(await page.evaluate(() => history.length), length, 'Repeating a selected project creates no duplicate history');
    const url = new URL(page.url()); assert.equal(url.searchParams.get('qa'), 'hardware'); assert.equal(url.searchParams.get('capture'), '1'); assert.equal(url.hash, '#work');
    for (const [query, project, view] of [['project=tramtrace&view=detail', 'tramtrace', 'controller'], ['project=skylabs&view=detail', 'telemetry', 'overview'], ['project=pi&view=copper', 'pi', 'overview']]) {
      await visit(page, '/v3/?capture=1&qa=legacy&' + query + '#work'); await hardwareSettled(page, project, view); await assertHardwareSelection(page, project, view);
      assert.equal(new URL(page.url()).searchParams.get('qa'), 'legacy'); assert.equal(new URL(page.url()).hash, '#work');
    }
    return { controllerDeepLink: true, browserBackForward: true, legacyAliases: true, unimplementedModesNormalizeToOverview: true };
  });
  await browserTest('native 116 pixel test changes only original registered LED windows', { motion: 'no-preference' }, async ({ page }) => {
    await visit(page, '/v3/?capture=1'); await hardwareSettled(page);
    const toggle = page.locator(hardware + ' .pixel-toggle');
    await assertUsableControl(page, toggle, 'Illustrative LED test');
    assert.match(await toggle.textContent(), /Illustrative LED test/i); assert.equal(await toggle.getAttribute('aria-pressed'), 'false');
    const original = await hardwareSnapshot(page);
    await toggle.focus(); await page.keyboard.press('Space');
    assert.equal(await toggle.getAttribute('aria-pressed'), 'true'); assert.equal(await page.locator(hardware).getAttribute('data-pixel-pattern'), 'illustrative');
    const detail = await page.evaluate(() => {
      const model = window.__hardwareStudy.models.get('tramtrace'), api = TramTracePixelPattern.create(THREE, model);
      const refs = Object.values(tramTraceBoardData.chains).flatMap(chain => chain.leds.map(led => led[0]));
      const materialNames = []; model.group.traverse(node => { if (node.isMesh) for (const material of Array.isArray(node.material) ? node.material : [node.material]) if (/Illustrative/.test(material.name)) materialNames.push(material.name); });
      return { count: api.count, mode: api.mode, source: api.source, visible: api.visible, lineCounts: api.lineCounts, errorMm: api.maxRegistrationErrorMm,
        positions: refs.map(ref => ({ ref, position: api.pixelPosition(ref)?.toArray() })), materialNames };
    });
    assert.equal(detail.count, 116); assert.equal(detail.mode, 'native-window-materials'); assert.equal(detail.source.live, false); assert.equal(detail.visible, true);
    assert.deepEqual(detail.lineCounts, chainCounts); assert.ok(detail.errorMm < .001);
    assert.equal(detail.positions.length, 116); assert.equal(new Set(detail.positions.map(item => item.ref)).size, 116);
    assert.ok(detail.positions.every(item => item.position?.length === 3 && item.position.every(Number.isFinite)));
    assert.ok(detail.materialNames.length > 0); assert.match(await page.locator(hardware + ' .scene-status').textContent(), /illustrative|not live/i);
    const litNodes = (await hardwareSnapshot(page)).models.find(model => model.key === 'tramtrace').nodes;
    assert.deepEqual(litNodes.map(({ geometry, ...node }) => node), original.models.find(model => model.key === 'tramtrace').nodes.map(({ geometry, ...node }) => node), 'The test creates no fake LED markers or moving parts');
    await screenshot(page, 'desktop-hardware-native-116-pixels'); await assertHardwareIdle(page);
    await toggle.focus(); await page.keyboard.press('Enter'); assert.equal(await toggle.getAttribute('aria-pressed'), 'false');
    assert.equal(await page.locator(hardware).getAttribute('data-pixel-pattern'), 'off');
    assert.deepEqual((await hardwareSnapshot(page)).models.find(model => model.key === 'tramtrace').nodes, original.models.find(model => model.key === 'tramtrace').nodes, 'Turning test off restores original window geometry');
    return detail;
  });
  await browserTest('registered physical copper native keyboard endpoints and 15 50 85 comparisons', {}, async ({ page }) => {
    await visit(page, '/v3/?capture=1'); await selectHardware(page, 'tramtrace', 'copper');
    const range = page.locator('#copper-range');
    await assertUsableControl(page, range, 'Actual copper reveal'); assert.equal(await range.getAttribute('type'), 'range');
    const artwork = await page.evaluate(() => {
      const model = window.__hardwareStudy.models.get('tramtrace'), mesh = model.group.getObjectByName('Actual front copper');
      if (!mesh) return null;
      const positions = mesh.geometry.attributes.position, uv = mesh.geometry.attributes.uv;
      return { source: mesh.material.map.image.currentSrc || mesh.material.map.image.src, triangles: positions.count / 3, vertexCount: positions.count,
        finite: [...positions.array, ...uv.array].every(Number.isFinite), topFace: [...Array(positions.count)].every((_, index) => positions.getY(index) === 0),
        registered: [...Array(positions.count)].every((_, index) => Math.abs(uv.getX(index) - (positions.getX(index) + .5)) < 1e-6 && Math.abs(uv.getY(index) - (.5 - positions.getZ(index) / (94.55 / 207.81))) < 1e-6) };
    });
    assert.ok(artwork); assert.ok(artwork.source.endsWith('/assets/models/manufacturing/tramtrace/front-copper.svg'));
    assert.ok(artwork.triangles > 2 && artwork.finite && artwork.topFace && artwork.registered, 'Real copper is registered to original laminate top-face triangles');
    const states = [], historyLength = await page.evaluate(() => history.length);
    for (const value of [0, 15, 50, 85, 100]) {
      await rangeViaKeyboard(page, range, value); assert.equal(await range.inputValue(), String(value));
      assert.equal(await page.locator(hardware).getAttribute('data-project'), 'tramtrace'); assert.equal(await page.locator(hardware).getAttribute('data-view'), 'copper');
      const visible = await page.evaluate(() => window.__hardwareStudy.models.get('tramtrace').group.getObjectByName('Actual front copper').visible);
      assert.equal(visible, value > 0, 'Native range controls the actual copper mesh');
      await approachHardware(page); await screenshot(page, 'desktop-hardware-copper-' + value); states.push({ value, visible });
    }
    assert.equal(await page.evaluate(() => history.length), historyLength, 'Range keys do not navigate or create history entries');
    await selectHardware(page, 'telemetry'); assert.equal(await range.isVisible(), false);
    await selectHardware(page, 'pi'); assert.equal(await page.locator(hardware + ' .pixel-toggle').isVisible(), false);
    return { artwork, states };
  });
  await browserTest('rapid and reversed project camera requests settle on the newest selection', { motion: 'no-preference' }, async ({ page, context }) => {
    let release;
    const blocked = new Promise(resolve => { release = resolve; });
    await context.route(/\/assets\/models\/hero\/telemetry(?:\.|\?)/, async route => { await blocked; await route.continue(); });
    try {
      await visit(page, '/v3/?capture=1'); await hardwareSettled(page);
      for (const key of ['telemetry', 'pi', 'tramtrace', 'telemetry', 'tramtrace']) await activateKeyboard(page, page.locator(hardware + ' button[data-project="' + key + '"]'));
      release(); await hardwareSettled(page);
      await page.waitForFunction(() => window.__hardwareStudy.models.has('telemetry') && window.__hardwareStudy.models.has('pi'), null, { timeout: 120000 });
      await assertHardwareSelection(page, 'tramtrace');
      const original = await hardwareSnapshot(page);
      for (const key of ['pi', 'telemetry', 'tramtrace', 'pi', 'tramtrace']) {
        await activateKeyboard(page, page.locator(hardware + ' button[data-project="' + key + '"]'));
        await page.waitForTimeout(80);
      }
      await hardwareSettled(page); await assertHardwareSelection(page, 'tramtrace');
      const final = await hardwareSnapshot(page);
      for (const model of original.models) assert.deepEqual(final.models.find(item => item.key === model.key).nodes, model.nodes);
      await assertHardwareIdle(page);
      return { delayedModelCannotWin: true, reversedCameraCannotWin: true, allInactiveModelsHidden: true };
    } finally { release(); }
  });
  await browserTest('mobile native project taps copper touch and uninterrupted vertical scrolling', { touch: true, motion: 'no-preference', viewport: { width: 390, height: 844 } }, async ({ page, context }) => {
    await visit(page, '/v3/?capture=1'); await hardwareSettled(page);
    for (const key of ['telemetry', 'pi', 'tramtrace']) { await page.locator(hardware + ' button[data-project="' + key + '"]').tap(); await hardwareSettled(page, key); await assertHardwareSelection(page, key); }
    const toggle = page.locator(hardware + ' .pixel-toggle'); await toggle.tap(); assert.equal(await toggle.getAttribute('aria-pressed'), 'true');
    await toggle.tap(); assert.equal(await toggle.getAttribute('aria-pressed'), 'false');
    await page.locator(hardware + ' button[data-view="copper"]').tap(); await hardwareSettled(page, 'tramtrace', 'copper');
    const range = page.locator('#copper-range'); await rangeViaKeyboard(page, range, 50);
    const before = Number(await range.inputValue()); await touchDrag(context, page, range, 75);
    const after = Number(await range.inputValue()); assert.ok(after > before, 'Real touch input advances the native range');
    assert.equal(await page.locator(hardware).getAttribute('data-view'), 'copper'); await screenshot(page, 'mobile-hardware-copper-touch');
    await page.locator(hardware + ' button[data-view="overview"]').tap(); await hardwareSettled(page);
    await approachHardware(page);
    const scrollBefore = await page.evaluate(() => scrollY);
    // The canvas must not capture a vertical reading gesture. Use trusted
    // browser touch events, not dispatchEvent or programmatic scroll.
    await touchDrag(context, page, page.locator(hardware + ' .art canvas'), 0, -180);
    await page.waitForFunction(before => scrollY > before + 40, scrollBefore);
    assert.equal(await page.locator(hardware).getAttribute('data-project'), 'tramtrace');
    await noOverflow(page, 'Native mobile hardware');
    return { nativeProjectTaps: true, nativePixelToggle: true, nativeRange: { before, after }, verticalScroll: true };
  });
  await browserTest('reduced motion uses instant settled cameras with no continuing animation', {}, async ({ page }) => {
    await visit(page, '/v3/?capture=1'); await hardwareSettled(page);
    for (const item of hardwareProjects) {
      await selectHardware(page, item.key); await assertHardwareSelection(page, item.key);
      assert.equal(await page.locator(hardware).evaluate(node => node.getAnimations({ subtree: true }).some(animation => ['running', 'pending'].includes(animation.playState))), false);
      await assertHardwareIdle(page, item.key);
    }
    await selectHardware(page, 'tramtrace', 'controller'); await assertHardwareIdle(page, 'tramtrace', 'controller');
    return { reducedMotion: true, actualWebGL: true, noOngoingAnimation: true };
  });
  for (const options of [
    { name: 'JavaScript disabled', js: false },
    { name: 'WebGL unavailable', noWebGL: true },
    { name: 'Save Data requested', saveData: true },
    { name: 'stage controller unavailable', block: /\/assets\/v3-hardware-stage\.js/ },
    { name: 'original TramTrace model unavailable', block: /\/assets\/models\/hero\/tramtrace(?:\.|\?)/ }
  ]) {
    await browserTest('hardware has a meaningful fallback with ' + options.name, { ...options, viewport: { width: 390, height: 844 } }, async ({ page, requests }) => {
      await visit(page);
      const section = page.locator(hardware);
      if (options.noWebGL || options.name === 'original TramTrace model unavailable') await page.waitForFunction(() => document.querySelector('[data-hardware-portfolio]').dataset.model === 'fallback', null, { timeout: 120000 });
      await loaded(section.locator('.poster:visible').first());
      assert.equal(await section.locator('h1').isVisible(), true);
      assert.equal(await section.locator('.project a[href="/v3/projects/tramtrace/"]').isVisible(), true);
      assert.equal(await page.locator('a[href="/v3/projects/"]:visible').count() > 0, true);
      for (const button of await section.locator('button[data-view]:visible, .pixel-toggle:visible').all()) assert.equal(await button.isDisabled(), true, 'Unavailable 3D controls must not appear operable');
      if (options.saveData) assert.equal(requests.some(url => /\/assets\/models\/(?:hero|aircraft)\//.test(url)), false, 'Save Data avoids all automatic hardware/aircraft model downloads');
      if (options.noWebGL || options.saveData || options.name === 'original TramTrace model unavailable') {
        for (const item of hardwareProjects) {
          await section.locator('button[data-project="' + item.key + '"]').click();
          await page.waitForFunction(key => document.querySelector('[data-hardware-portfolio]').dataset.project === key, item.key);
          await loaded(section.locator('.poster:visible').first());
          assert.equal(await section.locator('.project a').getAttribute('href'), '/v3/projects/' + item.slug + '/');
        }
      }
      await noOverflow(page, options.name + ' hardware fallback');
      await screenshot(page, 'mobile-hardware-fallback-' + options.name, true);
      return { decodedPoster: true, realCaseAccess: true, nonfunctionalControlsHiddenOrDisabled: true };
    });
  }
  await browserTest('expanded hardware photo zoom pan keyboard close and repeat', {}, async ({ page }) => {
    await visit(page, '/v3/?capture=1'); await approachHardware(page); await hardwareSettled(page);
    await selectHardware(page, 'telemetry');
    const opener = page.locator('[data-gallery-expand]'), dialog = page.locator('[data-gallery-inspect]');
    await opener.scrollIntoViewIfNeeded(); await opener.focus();
    const before = { url: page.url(), scrollY: await page.evaluate(() => scrollY) };
    const expectedSource = await page.locator('[data-hardware-photo="telemetry"]').evaluate(article => {
      const candidates = article.dataset.detailSrcset.split(',').map(value => { const [url, size] = value.trim().split(/\s+/); return { url: new URL(url, location.href).href, size: parseInt(size) || 0 }; }).sort((a, b) => b.size - a.size);
      return candidates[0]?.url || new URL(article.dataset.detailSrc, location.href).href;
    });
    await page.keyboard.press('Enter'); await page.locator('[data-gallery-inspect][data-state="ready"]').waitFor();
    await activateKeyboard(page, dialog.locator('[data-inspect-photo-view="detail"]'));
    await page.waitForFunction(source => document.querySelector('[data-gallery-inspect]').dataset.state === 'ready' && document.querySelector('[data-inspect-image]')?.src === source, expectedSource);
    assert.equal(await dialog.isVisible(), true);
    assert.equal(await dialog.locator('[data-inspect-image]').evaluate(image => image.currentSrc || image.src), expectedSource, 'Expand the real selected macro at its largest supplied resolution');
    assert.equal(await dialog.locator('[data-inspect-image]').evaluate(image => image.complete && image.naturalWidth > 0 && image.alt.trim().length > 0), true);
    assert.equal(Number(await dialog.getAttribute('data-zoom')), 1);
    const stage = dialog.locator('[data-inspect-stage]');
    await stage.focus(); await page.keyboard.press('+');
    assert.ok(Number(await dialog.getAttribute('data-zoom')) > 1, 'Keyboard zoom in');
    await page.keyboard.press('Home'); assert.equal(Number(await dialog.getAttribute('data-zoom')), 1);
    for (let i = 0; i < 6 && await dialog.locator('[data-inspect-in]').isEnabled(); i++) await dialog.locator('[data-inspect-in]').click();
    assert.equal(Number(await dialog.getAttribute('data-zoom')), 3, 'Zoom is bounded at 3×');
    await stage.focus(); const panBefore = Number(await dialog.getAttribute('data-pan-x'));
    await page.keyboard.press('ArrowRight'); assert.notEqual(Number(await dialog.getAttribute('data-pan-x')), panBefore);
    const bounds = await stage.boundingBox(), dragBefore = Number(await dialog.getAttribute('data-pan-x'));
    await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2); await page.mouse.down();
    await page.mouse.move(bounds.x + bounds.width / 2 - 85, bounds.y + bounds.height / 2 - 30, { steps: 6 }); await page.mouse.up();
    assert.notEqual(Number(await dialog.getAttribute('data-pan-x')), dragBefore, 'Pointer dragging pans the enlarged photograph');
    await screenshot(page, 'desktop-expanded-hardware-photo');
    const hardwareView = await page.locator(hardware).getAttribute('data-view');
    await dialog.locator('[data-inspect-photo-view="overview"]').click();
    await page.waitForFunction(() => document.querySelector('[data-gallery-inspect]').dataset.state === 'ready' && /skylabs-telemetry-hero/.test(document.querySelector('[data-inspect-image]')?.src || ''));
    assert.equal(Number(await dialog.getAttribute('data-zoom')), 1, 'Changing the photograph resets stale pan/zoom');
    assert.equal(await page.locator(hardware).getAttribute('data-view'), hardwareView, 'Photo selection does not invent a hardware mode');
    await dialog.locator('[data-inspect-photo-view="detail"]').click();
    await page.waitForFunction(source => document.querySelector('[data-gallery-inspect]').dataset.state === 'ready' && document.querySelector('[data-inspect-image]')?.src === source, expectedSource);
    await dialog.locator('[data-inspect-reset]').click(); assert.equal(Number(await dialog.getAttribute('data-zoom')), 1);
    assert.equal(Number(await dialog.getAttribute('data-pan-x')), 0); assert.equal(Number(await dialog.getAttribute('data-pan-y')), 0);
    for (let i = 0; i < 12; i++) { await page.keyboard.press(i > 8 ? 'Shift+Tab' : 'Tab'); assert.equal(await dialog.evaluate(node => node.contains(document.activeElement)), true, 'Expanded photo contains forward and reverse keyboard focus'); }
    await page.keyboard.press('Escape'); await dialog.waitFor({ state: 'hidden' });
    assert.equal(await opener.evaluate(node => node === document.activeElement), true);
    assert.equal(page.url(), before.url); assert.ok(Math.abs(await page.evaluate(() => scrollY) - before.scrollY) <= 2);
    await page.keyboard.press('Enter'); await page.locator('[data-gallery-inspect][data-state="ready"]').waitFor();
    assert.equal(Number(await dialog.getAttribute('data-zoom')), 1, 'Reopening starts fitted rather than carrying stale pan/zoom');
    await dialog.locator('[data-inspect-close]').click(); await dialog.waitFor({ state: 'hidden' });
    await selectHardware(page, 'pi'); await opener.click(); await page.locator('[data-gallery-inspect][data-state="ready"]').waitFor();
    assert.match(await dialog.locator('[data-inspect-image]').getAttribute('src'), /framework-pi-cad/);
    assert.equal(await dialog.locator('[data-inspect-photo-view=detail]').isVisible(), false, 'No fabricated Pi close-up mode');
    assert.match(await dialog.locator('[data-inspect-caption]').textContent(), /CAD assembly/i);
    await page.keyboard.press('Escape'); await dialog.waitFor({ state: 'hidden' });
    return { suppliedLargestPhoto: true, boundedZoom: [1, 3], keyboardAndPointerPan: true, focusAndScrollRestored: true };
  });
  await browserTest('expanded hardware photo mobile pinch pan and dismissal', { touch: true, viewport: { width: 390, height: 844 } }, async ({ page, context }) => {
    await visit(page, '/v3/?capture=1'); await approachHardware(page); await hardwareSettled(page); await selectHardware(page, 'tramtrace', 'controller');
    const opener = page.locator('[data-gallery-expand]'), dialog = page.locator('[data-gallery-inspect]');
    await page.evaluate(() => {
      const log = window.__v3InputDiagnostics = { phase: 'fresh-mobile-open', events: [], checkpoints: [] };
      const targetName = node => node?.closest?.('[data-inspect-close]') ? 'close' : node?.closest?.('[data-inspect-stage]') ? 'stage' : node?.closest?.('[data-gallery-expand]') ? 'expand' : node?.tagName || '';
      for (const type of ['pointerdown', 'pointerup', 'pointercancel', 'gotpointercapture', 'lostpointercapture', 'touchstart', 'touchend', 'touchcancel', 'click']) document.addEventListener(type, event => {
        const item = { phase: log.phase, type, target: targetName(event.target), pointerId: event.pointerId, pointerType: event.pointerType, buttons: event.buttons, isPrimary: event.isPrimary, x: event.clientX, y: event.clientY, trusted: event.isTrusted, touches: event.touches ? event.touches.length : undefined, changedTouches: event.changedTouches ? [...event.changedTouches].map(touch => ({ id: touch.identifier, x: touch.clientX, y: touch.clientY })) : undefined };
        log.events.push(item); queueMicrotask(() => { item.defaultPrevented = event.defaultPrevented; });
      }, { capture: true, passive: true });
    });
    const checkpoint = async phase => page.evaluate(phase => {
      const log = window.__v3InputDiagnostics; log.phase = phase;
      const dialog = document.querySelector('[data-gallery-inspect]'), close = dialog.querySelector('[data-inspect-close]'), box = close.getBoundingClientRect();
      const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
      const viewport = window.visualViewport;
      log.checkpoints.push({ phase, open: dialog.open, state: { ...dialog.dataset }, className: dialog.className, close: { x: box.x, y: box.y, width: box.width, height: box.height }, hit: { tag: hit?.tagName, isClose: !!hit?.closest('[data-inspect-close]') }, viewport: viewport ? { width: viewport.width, height: viewport.height, scale: viewport.scale, offsetLeft: viewport.offsetLeft, offsetTop: viewport.offsetTop } : null, scrollX, scrollY });
    }, phase);
    await opener.tap(); await page.locator('[data-gallery-inspect][data-state="ready"]').waitFor();
    await checkpoint('fresh-mobile-close'); await dialog.locator('[data-inspect-close]').tap(); await dialog.waitFor({ state: 'hidden' });
    assert.equal(await opener.evaluate(node => node === document.activeElement), true, 'A fresh mobile tap closes and restores focus before gestures');
    await opener.tap(); await page.locator('[data-gallery-inspect][data-state="ready"]').waitFor();
    await checkpoint('pinch-and-pan');
    const stage = dialog.locator('[data-inspect-stage]'), box = await stage.boundingBox(), x = box.x + box.width / 2, y = box.y + box.height / 2;
    const client = await context.newCDPSession(page);
    try {
      await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x - 28, y, id: 1 }, { x: x + 28, y, id: 2 }] });
      await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x - 90, y, id: 1 }, { x: x + 90, y, id: 2 }] });
      await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      assert.ok(Number(await dialog.getAttribute('data-zoom')) > 1, 'Two real touch contacts zoom the photograph');
      const panBefore = Number(await dialog.getAttribute('data-pan-x'));
      await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] });
      await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x - 65, y: y - 20, id: 1 }] });
      await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      assert.notEqual(Number(await dialog.getAttribute('data-pan-x')), panBefore, 'One-finger drag pans');
    } finally { await client.detach(); }
    await checkpoint('post-gesture-control-taps');
    await dialog.locator('[data-inspect-reset]').tap(); assert.equal(Number(await dialog.getAttribute('data-zoom')), 1, 'Reset tap works after pinch/pan');
    await dialog.locator('[data-inspect-in]').tap(); assert.equal(Number(await dialog.getAttribute('data-zoom')), 1.5, 'One plus tap advances exactly one zoom step');
    await dialog.locator('[data-inspect-out]').tap(); assert.equal(Number(await dialog.getAttribute('data-zoom')), 1, 'One minus tap reverses exactly one zoom step');
    await checkpoint('repeat-pinch-and-pan');
    const repeated = await context.newCDPSession(page);
    try {
      await repeated.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x - 28, y, id: 1 }, { x: x + 28, y, id: 2 }] });
      await repeated.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x - 90, y, id: 1 }, { x: x + 90, y, id: 2 }] });
      await repeated.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await repeated.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] });
      await repeated.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x - 65, y: y - 20, id: 1 }] });
      await repeated.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      assert.ok(Number(await dialog.getAttribute('data-zoom')) > 1, 'Repeat actual pinch before the unchanged Close tap');
    } finally { await repeated.detach(); }
    await noOverflow(page, 'Expanded photo at 390px'); await screenshot(page, 'mobile-expanded-hardware-photo');
    await checkpoint('post-gesture-close');
    await dialog.locator('[data-inspect-close]').tap(); await checkpoint('post-gesture-tap-dispatched');
    await dialog.waitFor({ state: 'hidden' });
    assert.equal(await opener.evaluate(node => node === document.activeElement), true);
    await assertHardwareSelection(page, 'tramtrace', 'controller');
    return { viewport: { width: 390, height: 844 }, freshMobileClose: true, touchPinch: true, touchPan: true, postGestureControlTaps: true, inputDiagnostics: await page.evaluate(() => window.__v3InputDiagnostics) };
  });
  await browserTest('expanded photo Close ignores touch-down drag cancellation and multitouch', { touch: true, viewport: { width: 390, height: 844 } }, async ({ page, context }) => {
    await visit(page, '/v3/?capture=1'); await approachHardware(page); await hardwareSettled(page);
    const opener = page.locator('[data-gallery-expand]'), dialog = page.locator('[data-gallery-inspect]');
    await opener.tap(); await page.locator('[data-gallery-inspect][data-state="ready"]').waitFor();
    await page.evaluate(() => {
      const log = window.__v3InputDiagnostics = { phase: 'negative-close-gestures', events: [] };
      for (const type of ['pointerdown', 'pointerup', 'pointercancel', 'touchstart', 'touchend', 'touchcancel', 'click']) document.addEventListener(type, event => {
        log.events.push({ phase: log.phase, type, target: event.target?.closest?.('[data-inspect-close]') ? 'close' : event.target?.tagName, pointerId: event.pointerId, pointerType: event.pointerType, trusted: event.isTrusted, touches: event.touches?.length });
      }, { capture: true, passive: true });
    });
    const closeBox = await dialog.locator('[data-inspect-close]').boundingBox(), stageBox = await dialog.locator('[data-inspect-stage]').boundingBox();
    const closePoint = { x: closeBox.x + closeBox.width / 2, y: closeBox.y + closeBox.height / 2, id: 1 };
    const outsidePoint = { x: closePoint.x - 110, y: closePoint.y + 110, id: 1 };
    const secondPoint = { x: stageBox.x + stageBox.width / 2, y: stageBox.y + stageBox.height / 2, id: 2 };
    const client = await context.newCDPSession(page);
    const remainsOpen = async label => {
      await page.waitForTimeout(350);
      assert.equal(await dialog.evaluate(node => node.open), true, label);
    };
    try {
      await page.evaluate(() => { window.__v3InputDiagnostics.phase = 'close-drag-out'; });
      await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [closePoint] });
      assert.equal(await dialog.evaluate(node => node.open), true, 'Touch-down alone cannot activate Close');
      await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [outsidePoint] });
      await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [closePoint] });
      await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await remainsOpen('Dragging away and back to Close still cancels activation');
      await page.evaluate(() => { window.__v3InputDiagnostics.phase = 'close-cancel'; });
      await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [closePoint] });
      await client.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
      await remainsOpen('A cancelled touch never closes the photograph');
      await page.evaluate(() => { window.__v3InputDiagnostics.phase = 'close-multitouch'; });
      await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [closePoint] });
      await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [closePoint, secondPoint] });
      await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await remainsOpen('A second simultaneous contact cancels Close activation');
    } finally { await client.detach(); }
    const trace = await page.evaluate(() => window.__v3InputDiagnostics);
    assert.ok(trace.events.some(event => event.phase === 'close-cancel' && event.type === 'pointercancel' && event.target === 'close' && event.trusted), 'Cancellation was real trusted browser input');
    await dialog.locator('[data-inspect-close]').tap(); await dialog.waitFor({ state: 'hidden' });
    assert.equal(await opener.evaluate(node => node === document.activeElement), true);
    return { activatesOnlyAfterValidTap: true, dragCancelled: true, touchCancelled: true, multitouchCancelled: true, inputDiagnostics: trace };
  });
  await browserTest('expanded photo resource failure retry and selected-source recovery', { viewport: { width: 390, height: 844 } }, async ({ page, context }) => {
    let fail = true;
    await context.route(/\/tramtrace-controller-1920\.webp/, route => fail ? route.abort() : route.continue());
    await visit(page, '/v3/?capture=1'); await approachHardware(page); await hardwareSettled(page); await selectHardware(page, 'tramtrace', 'controller');
    const opener = page.locator('[data-gallery-expand]'), dialog = page.locator('[data-gallery-inspect]');
    await opener.click(); await page.locator('[data-gallery-inspect][data-state="error"]').waitFor();
    assert.equal(await dialog.locator('[data-inspect-retry]').isVisible(), true);
    assert.equal(await dialog.locator('[data-inspect-in]').isDisabled(), true);
    assert.equal(await dialog.locator('[data-inspect-out]').isDisabled(), true);
    fail = false; await dialog.locator('[data-inspect-retry]').click();
    await page.locator('[data-gallery-inspect][data-state="ready"]').waitFor();
    assert.equal(await dialog.locator('[data-inspect-image]').evaluate(image => image.naturalWidth >= 1920), true);
    await page.keyboard.press('Escape'); await dialog.waitFor({ state: 'hidden' });
    await selectHardware(page, 'telemetry'); await opener.click(); await page.locator('[data-gallery-inspect][data-state="ready"]').waitFor();
    assert.match(await dialog.locator('[data-inspect-image]').getAttribute('src'), /skylabs-telemetry-hero/);
    await page.keyboard.press('Escape'); await dialog.waitFor({ state: 'hidden' });
    await assertHardwareSelection(page, 'telemetry');
  });
  await browserTest('collection query categories empty reset and history', {}, async ({ page }) => {
    await visit(page, '/v3/projects/?qa=portfolio&q=Framework&category=hardware');
    const search = page.locator('[data-v2-search]');
    assert.equal(await search.inputValue(), 'Framework'); await searchCount(page, 4);
    await search.fill('NoSuchBoard7654321'); await searchCount(page, 0);
    assert.match(await page.locator('[data-v2-search-status]').textContent(), /No projects match/i);
    await search.press('Escape'); await searchCount(page, 12);
    assert.equal(await search.evaluate(node => node === document.activeElement), true);
    assert.equal(new URL(page.url()).searchParams.has('q'), false);
    await page.locator('[data-v2-category="all"]').click(); await searchCount(page, 15);
    await search.fill('Framework'); await searchCount(page, 4);
    await page.reload({ waitUntil: 'load' }); assert.equal(await search.inputValue(), 'Framework'); await searchCount(page, 4);
    // The controller deliberately replaces its current entry. Duplicate that
    // entry before edits to exercise real browser Back/Forward restoration.
    await page.evaluate(() => history.pushState({}, '', location.href));
    await search.fill('TramTrace'); await searchCount(page, 1);
    await page.goBack(); assert.equal(await search.inputValue(), 'Framework'); await searchCount(page, 4);
    await page.goForward(); assert.equal(await search.inputValue(), 'TramTrace'); await searchCount(page, 1);
    assert.equal(new URL(page.url()).searchParams.get('qa'), 'portfolio');
    await search.press('Escape'); await searchCount(page, 15);
    for (const [category, count] of [['hardware', 12], ['robotics', 1], ['archive', 2], ['all', 15]]) {
      await page.locator('[data-v2-category="' + category + '"]').click(); await searchCount(page, count);
    }
    return { queryReload: true, browserBackForward: true, categoryCounts: { all: 15, hardware: 12, robotics: 1, archive: 2 } };
  });
  await browserTest('native narrow primary navigation is visible and keyboard accessible', { viewport: { width: 320, height: 740 } }, async ({ page }) => {
    for (const route of ['/v3/', '/v3/about/']) {
      await visit(page, route);
      const nav = page.locator('nav[aria-label="Primary navigation"]');
      assert.equal(await nav.isVisible(), true);
      assert.equal(await nav.locator('a:visible').count(), 3, 'Projects, CV and Contact remain directly available');
      for (const link of await nav.locator('a').all()) await assertUsableControl(page, link, 'Primary navigation link');
      await activateKeyboard(page, nav.locator('a[href="/v3/projects/"]'));
      await page.waitForURL('**/v3/projects/'); await searchCount(page, 15);
      await noOverflow(page, '320px native collection navigation');
    }
    return { nativeLinks: ['projects', 'CV', 'contact'], keyboardNavigation: true, viewportWidth: 320 };
  });
  await browserTest('photo gallery keyboard focus Escape and repeat opening', {}, async ({ page }) => {
    await visit(page, '/v3/projects/tramtrace/');
    const photos = page.locator('img[data-zoomable]'), first = photos.first(), dialog = page.locator('[data-lightbox]');
    await loaded(first); await first.focus(); await page.keyboard.press('Enter');
    assert.equal(await dialog.isVisible(), true);
    assert.equal(await page.locator('[data-lightbox-close]').evaluate(node => node === document.activeElement), true);
    const initial = await page.locator('[data-lightbox-image]').getAttribute('alt');
    await page.keyboard.press('ArrowRight');
    assert.notEqual(await page.locator('[data-lightbox-image]').getAttribute('alt'), initial);
    await page.keyboard.press('ArrowLeft');
    assert.equal(await page.locator('[data-lightbox-image]').getAttribute('alt'), initial);
    for (let i = 0; i < 6; i++) {
      await page.keyboard.press('Tab');
      assert.equal(await dialog.evaluate(node => node.contains(document.activeElement)), true, 'Modal keyboard focus stays inside gallery');
    }
    await screenshot(page, 'desktop-gallery');
    await page.keyboard.press('Escape'); await dialog.waitFor({ state: 'hidden' });
    assert.equal(await first.evaluate(node => node === document.activeElement), true);
    await page.keyboard.press('Space'); assert.equal(await dialog.isVisible(), true);
    await page.locator('[data-lightbox-close]').click(); await dialog.waitFor({ state: 'hidden' });
    assert.equal(await first.evaluate(node => node === document.activeElement), true);
    await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' })); await screenshot(page, 'desktop-case-study');
  });
  await browserTest('TramTrace copper components and rotation preserve source behavior', {}, async ({ page }) => {
    const board = await openWorkbench(page), expected = tramTraceSourceData();
    assert.deepEqual(await page.evaluate(() => window.tramTraceBoardData), expected, 'Served electrical order, coordinates, copper segments and components equal production sources');
    assert.equal(await board.locator('[data-component-directory] button').count(), 10);
    assert.equal(await board.locator('[data-pcb-hotspots] button').count(), 10);
    assert.equal(await board.locator('[data-component-directory-count]').textContent(), '10 selectable parts');
    await activateKeyboard(page, board.locator('[data-inspector-mode="copper"]'));
    assert.equal(await board.getAttribute('data-mode'), 'copper');
    assert.equal(await board.locator('[data-legend="copper"]').isVisible(), true);
    for (const selector of ['.pcb-front-copper', '.pcb-back-copper']) {
      const layer = board.locator(selector); await layer.evaluate(image => image.decode());
      assert.equal(await layer.evaluate(image => image.naturalWidth > 0 && Number(getComputedStyle(image).opacity) > 0), true);
    }
    await board.locator('[data-pcb-stage]').scrollIntoViewIfNeeded(); await screenshot(page, 'desktop-tramtrace-copper');
    await activateKeyboard(page, board.locator('[data-inspector-mode="assembled"]'));
    await activateKeyboard(page, board.locator('[data-component-directory-wrap] summary'));
    for (let index = 0; index < expected.components.length; index++) {
      const choice = board.locator('[data-component-directory] [data-component-index="' + index + '"]');
      await activateKeyboard(page, choice);
      assert.equal(await choice.getAttribute('aria-pressed'), 'true');
      assert.equal(await board.locator('[data-component-ref]').textContent(), expected.components[index][0]);
      assert.equal(await board.locator('[data-component-title]').textContent(), expected.components[index][1]);
      assert.equal(await board.locator('[data-pcb-hotspots] [aria-pressed="true"]').getAttribute('data-component-index'), String(index));
    }
    await page.keyboard.press('Enter');
    assert.equal(await board.locator('[data-component-ref]').textContent(), 'BOARD', 'Repeated selection clears');
    await activateKeyboard(page, board.locator('[data-component-directory] [data-component-index="8"]'));
    await board.locator('[data-pcb-stage]').focus(); await page.keyboard.press('Escape');
    assert.equal(await board.locator('[data-component-ref]').textContent(), 'BOARD');
    await activateKeyboard(page, board.locator('[data-hotspot-toggle]'));
    assert.equal(await board.getAttribute('data-hotspots'), 'hidden');
    await page.keyboard.press('Enter'); assert.equal(await board.getAttribute('data-hotspots'), 'visible');
    await activateKeyboard(page, board.locator('[data-inspector-view="rotate"]'));
    await board.locator('[data-pcb-stage]').focus(); await page.keyboard.press('ArrowRight');
    assert.equal(await board.locator('[data-pcb-angle]').textContent(), '015°');
    await page.keyboard.press('ArrowLeft'); assert.equal(await board.locator('[data-pcb-angle]').textContent(), '000°');
    await page.keyboard.press('ArrowLeft'); assert.equal(await board.locator('[data-pcb-angle]').textContent(), '345°');
    await page.keyboard.press('Home'); assert.equal(await board.locator('[data-pcb-angle]').textContent(), '000°');
    await activateKeyboard(page, board.locator('[data-pcb-rotate-next]')); assert.equal(await board.locator('[data-pcb-angle]').textContent(), '015°');
    await activateKeyboard(page, board.locator('[data-pcb-rotate-reset]')); assert.equal(await board.locator('[data-pcb-angle]').textContent(), '000°');
    await activateKeyboard(page, board.locator('[data-inspector-view="inspect"]'));
    assert.equal(await board.getAttribute('data-view'), 'inspect'); await noOverflow(page, 'Copper/component workbench');
    return { sourceParity: true, componentSelections: 10, copperLayers: 2, turntableFrames: 24 };
  });
  await browserTest('TramTrace every electrical chain supports step scrub and correct readouts', {}, async ({ page }) => {
    const board = await openWorkbench(page), expected = tramTraceSourceData();
    await activateKeyboard(page, board.locator('[data-inspector-mode="data"]'));
    assert.equal(await board.locator('[data-frame-console]').isVisible(), true);
    assert.deepEqual(await board.locator('[data-chain-list] button').evaluateAll(buttons => buttons.map(button => button.dataset.chain)), Object.keys(chainCounts));
    const slider = board.locator('[data-frame-slider]');
    for (const [key, count] of Object.entries(chainCounts)) {
      await activateKeyboard(page, board.locator('[data-chain-list] [data-chain="' + key + '"]'));
      assert.equal(await board.locator('[data-chain-list] [aria-pressed="true"]').count(), 1);
      await frameReadout(board, key, 0);
      assert.match(await board.locator('[data-frame-copy]').textContent(), new RegExp(expected.chains[key].leds[0][0]));
      await slider.focus(); await page.keyboard.press('ArrowRight'); await frameReadout(board, key, 1);
      await page.keyboard.press('End'); await frameReadout(board, key, count);
      assert.match(await board.locator('[data-frame-title]').textContent(), /ready to latch/);
      assert.match(await board.locator('[data-frame-copy]').textContent(), new RegExp(expected.chains[key].leds.at(-1)[0]));
      await page.keyboard.press('Home'); await frameReadout(board, key, 0);
      if (count > 1) {
        await slider.scrollIntoViewIfNeeded(); const bounds = await slider.boundingBox();
        await page.mouse.click(bounds.x + bounds.width * 0.53, bounds.y + bounds.height / 2);
        const step = Number(await slider.inputValue()); assert.ok(step > 0 && step < count, 'Pointer scrub chooses an interior step');
        await frameReadout(board, key, step);
      }
      await activateKeyboard(page, board.locator('[data-frame-reset]')); await frameReadout(board, key, 0);
    }
    assert.equal(await board.locator('[data-pcb-canvas]').evaluate(canvas => {
      const context = canvas.getContext('2d');
      return !!context && canvas.width > 1 && canvas.height > 1 && context.getImageData(0, 0, canvas.width, canvas.height).data.some((value, index) => index % 4 === 3 && value > 0);
    }), true, 'Electrical paths and pixel markers actually draw into the 2D canvas');
    await screenshot(page, 'desktop-tramtrace-data');
    return { chainCounts, bitsPerPixel: 24, dataRate: 800000, keyboardRange: true, pointerScrub: true };
  });
  await browserTest('TramTrace playback pause reset repeat and interruption cancel timers', {}, async ({ page }) => {
    const board = await openWorkbench(page), slider = board.locator('[data-frame-slider]'), play = board.locator('[data-frame-play]');
    await activateKeyboard(page, board.locator('[data-inspector-mode="data"]'));
    await activateKeyboard(page, play);
    await page.waitForFunction(() => Number(document.querySelector('#copper-data [data-frame-slider]').value) > 0);
    await activateKeyboard(page, play); await assertStopped(page, board);
    await activateKeyboard(page, board.locator('[data-frame-reset]')); await frameReadout(board, 'l1', 0); await assertStopped(page, board);
    // Rapid repeated activation may not leave a second interval running.
    await play.focus(); for (let press = 0; press < 4; press++) await page.keyboard.press('Enter');
    await assertStopped(page, board);
    await activateKeyboard(page, play);
    await activateKeyboard(page, board.locator('[data-chain-list] [data-chain="l2"]'));
    await frameReadout(board, 'l2', 0); await assertStopped(page, board);
    await activateKeyboard(page, play); await slider.focus(); await page.keyboard.press('End');
    await frameReadout(board, 'l2', 8); await assertStopped(page, board);
    await activateKeyboard(page, play);
    assert.equal(await play.getAttribute('aria-label'), 'Pause data frame', 'Completed frame can be replayed');
    await page.waitForFunction(() => { const value = Number(document.querySelector('#copper-data [data-frame-slider]').value); return value > 0 && value < 8; });
    await activateKeyboard(page, board.locator('[data-inspector-mode="copper"]'));
    await assertStopped(page, board);
    await activateKeyboard(page, board.locator('[data-inspector-mode="data"]'));
    await activateKeyboard(page, play); await activateKeyboard(page, board.locator('[data-inspector-view="rotate"]'));
    await assertStopped(page, board);
    await activateKeyboard(page, board.locator('[data-inspector-mode="data"]'));
    await activateKeyboard(page, board.locator('[data-chain-list] [data-chain="status"]'));
    for (let replay = 0; replay < 2; replay++) {
      await activateKeyboard(page, play);
      await page.waitForFunction(() => document.querySelector('#copper-data [data-frame-slider]').value === '1' && document.querySelector('#copper-data [data-frame-play]').getAttribute('aria-label') === 'Play data frame');
      await frameReadout(board, 'status', 1);
    }
    await activateKeyboard(page, board.locator('[data-frame-reset]')); await frameReadout(board, 'status', 0);
    await activateKeyboard(page, board.locator('[data-chain-list] [data-chain="l1"]'));
    await activateKeyboard(page, play);
    await page.waitForFunction(() => Number(document.querySelector('#copper-data [data-frame-slider]').value) > 0);
    await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
    await page.waitForFunction(() => document.querySelector('#copper-data [data-frame-play]').getAttribute('aria-label') === 'Play data frame');
    const pausedStep = await slider.inputValue(); await assertStopped(page, board);
    await play.scrollIntoViewIfNeeded(); await assertStopped(page, board);
    assert.equal(await slider.inputValue(), pausedStep, 'Returning to the workbench preserves its paused step without auto-resume');
    return { playPause: true, repeatedActivation: true, completionReplay: true, cancelOnChainScrubModeAndView: true, offscreenPauseWithoutAutoResume: true };
  });
  await browserTest('TramTrace 2D workbench survives denied WebGL at narrow widths', { noWebGL: true, viewport: { width: 320, height: 740 } }, async ({ page }) => {
    const board = await openWorkbench(page);
    assert.equal(await page.evaluate(() => document.createElement('canvas').getContext('webgl')), null, 'Test genuinely denies WebGL');
    assert.equal(await board.locator('[data-pcb-canvas]').evaluate(canvas => !!canvas.getContext('2d')), true);
    for (const width of [320, 390]) {
      await page.setViewportSize({ width, height: 740 });
      await activateKeyboard(page, board.locator('[data-inspector-mode="copper"]'));
      assert.equal(await board.locator('[data-legend="copper"]').isVisible(), true);
      await activateKeyboard(page, board.locator('[data-inspector-mode="data"]'));
      await activateKeyboard(page, board.locator('[data-chain-list] [data-chain="l4"]'));
      await board.locator('[data-frame-slider]').focus(); await page.keyboard.press('End'); await frameReadout(board, 'l4', 32);
      await noOverflow(page, '2D workbench with denied WebGL at ' + width);
      for (const button of await board.locator('[data-inspector-mode], [data-chain-list] button, [data-frame-play], [data-frame-reset]').all()) {
        const bounds = await button.boundingBox(); assert.ok(bounds && bounds.x >= -1 && bounds.x + bounds.width <= width + 1, 'Essential workbench control fits horizontally');
      }
      const viewport = board.locator('.pcb-viewport');
      assert.equal(await viewport.evaluate(node => { node.scrollLeft = node.scrollWidth; return node.scrollWidth <= node.clientWidth || node.scrollLeft > 0; }), true, 'Oversized board remains locally pannable');
      await screenshot(page, 'mobile-' + width + '-tramtrace-2d');
    }
    return { webglDenied: true, canvas2dAvailable: true, testedWidths: [320, 390] };
  });
  await browserTest('all interior routes and shared destinations return real content', { js: false }, async ({ page, context }) => {
    const routes = sourcePages.map(file => '/v3/' + file.replace(/index\.html$/, ''));
    for (const route of [...routes, '/shared/', '/book/', '/shared/flight-review/', '/assets/documents/Andrew_Chung_Public_CV.pdf']) {
      const response = await context.request.get(origin + route);
      assert.equal(response.status(), 200, route);
      const body = await response.body(); assert.ok(body.length > 100, route + ' body exists');
      if (route.endsWith('.pdf')) assert.equal(body.subarray(0, 4).toString(), '%PDF');
    }
    // This route redirects immediately, so wait for its destination before
    // touching its DOM or fonts. The old document may disappear after load.
    await page.goto(origin + '/v3/projects/skylabs/flight-review/', { waitUntil: 'domcontentloaded' });
    await page.waitForURL('**/shared/flight-review/', { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    return { routesChecked: routes.length + 4, flightReviewRedirect: true };
  });
  await browserTest('no JavaScript retains navigation photographs and complete collection', { js: false, viewport: { width: 390, height: 844 } }, async ({ page }) => {
    await visit(page);
    assert.equal(await page.locator('.site-header nav').isVisible(), true);
    await staticAircraft(page);
    await loaded(page.locator(hardware + ' .poster:visible').first());
    await visit(page, '/v3/projects/'); await searchCount(page, 15);
    assert.equal(await page.locator('[data-v2-search-wrap]').isVisible(), false);
    await noOverflow(page, 'No-JS collection');
  });
  for (const [name, options] of [['reduced motion', {}], ['Save Data', { motion: 'no-preference', saveData: true }], ['short viewport', { motion: 'no-preference', viewport: { width: 844, height: 390 } }]]) {
    await browserTest(name + ' retains static aircraft without CAD downloads', options, async ({ page, requests }) => {
      await visit(page); await approachAircraft(page); await staticAircraft(page);
      assert.equal(await page.locator(hero).getAttribute('data-aircraft-state'), 'static');
      assert.equal(requests.some(url => cadRequest.test(url)), false, 'Preference must avoid aircraft-specific model and renderer downloads');
      return { renderer: 'static', cadDownloads: 0 };
    });
  }
  for (const [name, options] of [['WebGL unavailable', { noWebGL: true }], ['model asset failure', { block: /\/assets\/models\/aircraft\// }], ['story controller failure', { block: /\/assets\/v3-aircraft-hero\.js/ }]]) {
    await browserTest(name + ' preserves readable fallback and project access', { motion: 'no-preference', ...options }, async ({ page }) => {
      await visit(page); await approachAircraft(page);
      if (name !== 'story controller failure') await page.locator('[data-aircraft-state="unavailable"]').waitFor({ timeout: 120000 });
      await staticAircraft(page);
      return { renderer: name === 'story controller failure' ? 'controller absent, source HTML' : 'unavailable', fallbackVerified: true };
    });
  }
  await browserTest('actual WebGL aircraft and telemetry readiness', { motion: 'no-preference' }, async ({ page }) => {
    const rendererStarted = Date.now();
    await visit(page); await approachAircraft(page);
    await page.waitForFunction(() => {
      const root = document.querySelector('[data-aircraft-hero]');
      return root.dataset.aircraftState === 'unavailable' || Number(root.dataset.aircraftFrames) > 0;
    }, null, { timeout: 120000 });
    assert.notEqual(await page.locator(hero).getAttribute('data-aircraft-state'), 'unavailable', 'Actual WebGL must render; fallback is not a render pass');
    const firstFrameElapsedMs = Date.now() - rendererStarted;
    await page.locator('[data-aircraft-telemetry-ready="true"]').waitFor({ timeout: 120000 });
    const telemetryReadyElapsedMs = Date.now() - rendererStarted;
    const skip = page.locator('[data-aircraft-skip]'); if (await skip.isVisible()) await skip.click();
    await page.locator('[data-aircraft-state="ready"]').waitFor({ timeout: 30000 });
    assert.equal(await page.locator(hero).getAttribute('data-aircraft-assembly-error'), '0.000000000');
    await selectedAircraftCopy(page, 0); await noOverflow(page, 'Desktop rendered aircraft stopped');
    await screenshot(page, 'desktop-aircraft-stopped');
    const desktopStopped = await page.locator(hero).evaluate(node => ({ ...node.dataset }));
    await page.locator('[data-aircraft-go="0"]').focus(); await page.keyboard.press('ArrowRight');
    assert.equal(await page.locator('[data-aircraft-go="1"]').evaluate(node => node === document.activeElement), true);
    const beforeDesktopTelemetry = Number(await page.locator(hero).getAttribute('data-aircraft-frames'));
    await page.keyboard.press('Enter');
    await waitAircraftDestination(page, 1, beforeDesktopTelemetry);
    assert.equal(await page.locator('[data-aircraft-canvas]').isVisible(), true);
    assert.equal(await page.locator(hero).getAttribute('data-aircraft-telemetry-components'), '153');
    await noOverflow(page, 'Rendered aircraft'); await screenshot(page, 'desktop-aircraft-telemetry');
    const state = await page.locator(hero).evaluate(node => ({ ...node.dataset }));
    const desktopPerformance = { ...(await performanceData(page)), firstFrameElapsedMs, telemetryReadyElapsedMs, renderedFrames: Number(state.aircraftFrames) };
    await page.setViewportSize({ width: 390, height: 844 });
    const mobileStates = [];
    for (const [chapter, name] of [[0, 'stopped'], [1, 'telemetry']]) {
      const previousFrames = Number(await page.locator(hero).getAttribute('data-aircraft-frames'));
      await page.locator('[data-aircraft-go="' + chapter + '"]').click();
      await waitAircraftDestination(page, chapter, previousFrames);
      assert.equal(await page.locator('[data-aircraft-canvas]').isVisible(), true);
      if (chapter === 0) {
        assert.equal(await page.locator(hero).getAttribute('data-aircraft-assembly-error'), '0.000000000');
        assert.ok((await page.locator('[data-aircraft-copy] article[data-aircraft-chapter="0"] h2').textContent()).trim(), 'Aircraft has its own subordinate heading');
        assert.match(await page.locator('[data-aircraft-copy] article[data-aircraft-chapter="0"]').textContent(), /Skylabs/);
      }
      await screenshot(page, 'mobile-aircraft-' + name);
      mobileStates.push({ viewport: { width: 390, height: 844 }, destination: name, state: await page.locator(hero).evaluate(node => ({ ...node.dataset })) });
    }
    assert.equal(await page.evaluate(() => '__v3Aircraft' in window), false, 'Production URL does not expose a capture global');
    return { renderer: 'rendered', state, desktopStopped, mobileStates, performance: desktopPerformance };
  });
  await browserTest('responsive core pages without narrow or short viewport overflow', {}, async ({ page }) => {
    const sizes = [{ width: 1440, height: 900 }, { width: 390, height: 844 }, { width: 320, height: 568 }, { width: 844, height: 390 }];
    const routes = ['/v3/', '/v3/projects/', '/v3/about/', '/v3/projects/tramtrace/'];
    for (const viewport of sizes) for (const route of routes) {
      await page.setViewportSize(viewport); await visit(page, route);
      await noOverflow(page, route + ' ' + viewport.width + 'x' + viewport.height);
      if (route === '/v3/') {
        await hardwareSettled(page);
        const supportingPhotos = await supportingPhotoFrames(page);
        (evidence.landingGeometry ||= []).push({ viewport, supportingPhotos });
        await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
      }
      if (viewport.width === 390) {
        await screenshot(page, 'mobile-' + (route === '/v3/' ? 'home' : route.replace(/^\/v3\/|\/$/g, '').replaceAll('/', '-')));
        if (route === '/v3/') await screenshot(page, 'mobile-home-full', true);
      }
    }
    return { viewports: sizes, routes };
  });
  await browserTest('320px and landscape native hardware controls remain reachable', {}, async ({ page }) => {
    const viewports = [{ width: 320, height: 568 }, { width: 844, height: 390 }], controls = [];
    for (const viewport of viewports) {
      await page.setViewportSize(viewport); await visit(page, '/v3/?capture=1'); await hardwareSettled(page);
      for (const item of hardwareProjects) {
        await selectHardware(page, item.key); await assertHardwareSelection(page, item.key);
        for (const button of await page.locator(hardware + ' button[data-project]:visible').all()) controls.push({ viewport, geometry: await assertUsableControl(page, button, item.key + ' project control') });
      }
      await selectHardware(page, 'tramtrace');
      for (const view of ['overview', 'controller', 'copper']) {
        const button = page.locator(hardware + ' button[data-view="' + view + '"]');
        await assertUsableControl(page, button, view + ' inspection'); await activateKeyboard(page, button); await hardwareSettled(page, 'tramtrace', view);
        await noOverflow(page, viewport.width + 'px ' + view);
        if (view === 'copper') await assertUsableControl(page, page.locator('#copper-range'), 'Copper range');
        await approachHardware(page); await screenshot(page, viewport.width + 'x' + viewport.height + '-hardware-' + view);
      }
    }
    return { viewports, controls };
  });
  await browserTest('loaded dark collection About and non-TramTrace case capture', {}, async ({ page }) => {
    for (const [device, viewport] of [['desktop', { width: 1440, height: 900 }], ['mobile', { width: 390, height: 844 }]]) {
      await page.setViewportSize(viewport);
      for (const [name, route] of [['collection', '/v3/projects/'], ['about', '/v3/about/'], ['raspberry-pi-case', '/v3/projects/framework-raspberry-pi/'], ['tramtrace-case', '/v3/projects/tramtrace/']]) {
        await visit(page, route); assert.equal(await page.locator('h1').isVisible(), true); await noOverflow(page, device + ' ' + route);
        await screenshot(page, device + '-' + name + '-fully-loaded', true);
      }
    }
    return { decodedAfterRealScroll: true, cases: ['framework-raspberry-pi', 'tramtrace'] };
  });
  await browserTest('all interiors fit 320 pixel no-JavaScript reading', { js: false, viewport: { width: 320, height: 740 } }, async ({ page }) => {
    for (const file of sourcePages) {
      if (file === 'projects/skylabs/flight-review/index.html') continue;
      await visit(page, '/v3/' + file.replace(/index\.html$/, ''));
      assert.equal(await page.locator('h1').isVisible(), true, file + ' title');
      await noOverflow(page, file);
    }
    return { interiorsChecked: sourcePages.length - 1, viewport: { width: 320, height: 740 } };
  });
}
(async () => {
  fs.mkdirSync(output, { recursive: true });
  await staticTests();
  if (!staticOnly) {
    try {
      let playwright;
      try { playwright = require('playwright'); }
      catch (error) { if (error.code !== 'MODULE_NOT_FOUND') throw error; playwright = require('/opt/codex/cua_node/lib/node_modules/playwright'); }
      browser = await playwright.chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_EXECUTABLE || undefined, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
      evidence.browser = { status: 'launched', version: browser.version(), executable: process.env.CHROMIUM_EXECUTABLE || 'Playwright bundled Chromium' };
      await browserTests();
    } catch (error) { evidence.browser = { status: 'blocked', error: error.stack || String(error) }; console.error('BLOCKED browser suite: ' + evidence.browser.error); }
    finally { if (browser) await browser.close(); }
  }
  evidence.performanceContext = 'Diagnostic measurements from this local preview/CI browser only. No network throttling or physical mobile device was used. Zero transfer sizes can reflect caching or unavailable timing; these are not user-network benchmarks or performance scores.';
  evidence.finished = new Date().toISOString();
  evidence.screenshots = screenshotPaths;
  evidence.status = evidence.tests.some(item => item.status === 'failed') ? 'failed' : evidence.browser?.status === 'blocked' ? 'blocked' : 'passed';
  evidence.coverage = staticOnly ? 'Source checks only; browser rendering and interactions were not run.' : evidence.browser?.status === 'blocked' ? 'Browser launch failed; static results are not a browser pass.' : 'Source inventory, original geometry, actual WebGL pixels, native keyboard/touch, idle rendering, fallbacks, routes, workbench and fully decoded screenshots. Passing assertions do not replace human visual review of the captured images.';
  fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify(evidence, null, 2));
  console.log(evidence.status.toUpperCase() + ': ' + evidence.tests.filter(item => item.status === 'passed').length + '/' + evidence.tests.length + ' checks; artifacts ' + output);
  if (evidence.status !== 'passed') process.exitCode = 1;
})().catch(error => { console.error(error); process.exitCode = 1; });
