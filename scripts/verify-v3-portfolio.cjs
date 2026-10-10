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
const cadRequest = /\/assets\/(?:models\/(?:aircraft|hero)\/|vendor\/three\.min\.js|v3-aircraft-(?:scene|atmosphere)\.js)/;
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
        const deferred = node.hasAttribute('data-v3-src') && !node.getAttribute('src') && document.body.classList.contains('v2-ready');
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
      await image.evaluate(node => (node.hasAttribute('data-v3-src') && !node.getAttribute('src') ? node.parentElement : node).scrollIntoView({ block: 'center', behavior: 'instant' }));
      const details = await image.evaluate(async node => {
        // Scrolling triggers both native lazy loading and data-v3-src IO. Wait
        // for that real load event before decoding, including src-less images.
        await new Promise((resolve, reject) => {
          if (node.complete && node.naturalWidth > 0) return resolve();
          const cleanup = () => { clearTimeout(timer); node.removeEventListener('load', success); node.removeEventListener('error', failure); };
          const success = () => { cleanup(); resolve(); };
          const failure = () => { cleanup(); reject(new Error('Meaningful photograph failed: ' + node.alt + ' (' + (node.currentSrc || node.dataset.v3Src || node.src) + ')')); };
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
  const context = await browser.newContext({ viewport: options.viewport || { width: 1440, height: 900 }, reducedMotion: options.motion || 'reduce', javaScriptEnabled: options.js !== false });
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
      try { await screenshot(run.page, 'failure-' + name, true); } catch {}
      const file = 'failure-' + name.replace(/[^a-z0-9_-]/gi, '-').toLowerCase() + '.json';
      fs.writeFileSync(path.join(output, file), JSON.stringify({ url: run.page.url(), errors: run.errors, badResponses: run.badResponses, shaders: run.shaders, requests: run.requests }, null, 2));
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
  const dimensions = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, viewport: innerWidth }));
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
  const headerBottom = await page.locator('.v2-header').evaluate(node => node.getBoundingClientRect().bottom);
  const navigationTop = await page.locator('[data-aircraft-nav]').evaluate(node => node.getBoundingClientRect().top);
  assert.ok(bounds.x >= -1 && bounds.x + bounds.width <= viewport.width + 1, 'Selected copy fits viewport width');
  assert.ok(bounds.y >= headerBottom - 1 && bounds.y + bounds.height <= Math.min(viewport.height, navigationTop) + 1, 'Selected copy fits between the header and aircraft navigation');
}
async function waitAircraftDestination(page, chapter, previousFrames) {
  await page.waitForFunction(({ chapter, previousFrames }) => {
    const state = document.querySelector('[data-aircraft-hero]').dataset;
    return state.aircraftState === 'ready' && state.aircraftChapter === String(chapter) && Number(state.aircraftFrames) > previousFrames &&
      (chapter === 0 ? state.aircraftPhase === 'stopped' && Number(state.aircraftProgress) < .01 : state.aircraftPhase === 'telemetry' && Number(state.aircraftProgress) > .99);
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
  await test('Core navigation and discoverable CV contact files booking and tools', () => {
    const core = ['v3/index.html', 'v3/projects/index.html', 'v3/about/index.html'];
    const all = core.flatMap(links), paths = new Set(all.filter(link => link.url.origin === origin).map(link => link.url.pathname));
    for (const route of ['/v3/projects/', '/v3/about/', '/shared/', '/book/', '/shared/flight-review/', '/assets/documents/Andrew_Chung_Public_CV.pdf', ...toolSlugs.map(slug => '/v3/projects/' + slug + '/')]) {
      assert.ok(paths.has(route), 'Core v3 routes must expose ' + route);
      assert.ok(fs.existsSync(localFile(new URL(route, origin))), route + ' target exists');
    }
    assert.ok(all.some(link => link.href === 'mailto:andrew.noah.chung@gmail.com'));
    for (const file of core) {
      const html = read(file);
      assert.equal(tags(html, 'h1').length, 1, file + ': one h1');
      assert.ok(tags(html, 'nav').some(tag => 'data-v2-nav' in tag), file + ': shared keyboard navigation hook');
      assert.ok(links(file).some(link => link.url.pathname === '/v3/'), file + ': home link');
    }
    return { routes: [...paths].sort() };
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
    const gallery = read('v3/projects/tramtrace/index.html');
    assert.ok(tags(gallery, 'img').filter(tag => 'data-zoomable' in tag).length >= 3);
    assert.equal(tags(gallery, 'dialog').filter(tag => 'data-lightbox' in tag).length, 1);
    return { aircraftDestinations: ['aircraft', 'telemetry'], numberedOverlay: false };
  });
}
async function browserTests() {
  await browserTest('desktop navigation and meaningful first screen', {}, async ({ page }) => {
    await visit(page);
    const initialHomePerformance = await performanceData(page);
    assert.equal(await page.locator('h1').isVisible(), true);
    assert.match(await page.locator('main').textContent(), /Andrew Chung|electrical engineering/i);
    const skip = page.locator('a[href$="#main"]').first();
    await skip.focus(); await page.keyboard.press('Enter');
    assert.equal(new URL(page.url()).hash, '#main');
    await noOverflow(page, 'Desktop home');
    await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
    await screenshot(page, 'desktop-home');
    await screenshot(page, 'desktop-home-full', true);
    const inspectedHomePerformance = await performanceData(page);
    await page.locator('[data-v2-nav] a[href="/v3/projects/"]').click();
    await page.waitForURL('**/v3/projects/');
    await searchCount(page, 15);
    await screenshot(page, 'desktop-collection');
    return { performance: { initialHome: initialHomePerformance, afterFullPageViewing: inspectedHomePerformance } };
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
  await browserTest('mobile menu keyboard Escape and navigation', { viewport: { width: 390, height: 844 } }, async ({ page }) => {
    await visit(page);
    const menu = page.locator('[data-v2-menu]');
    await menu.focus(); await page.keyboard.press('Enter');
    assert.equal(await menu.getAttribute('aria-expanded'), 'true');
    assert.equal(await page.locator('[data-v2-nav]').isVisible(), true);
    await page.keyboard.press('Escape');
    assert.equal(await menu.getAttribute('aria-expanded'), 'false');
    assert.equal(await menu.evaluate(node => node === document.activeElement), true);
    await menu.click(); await page.locator('[data-v2-nav] a[href="/v3/about/"]').click();
    await page.waitForURL('**/v3/about/');
    assert.equal(await menu.getAttribute('aria-expanded'), 'false');
    await noOverflow(page, 'Mobile About');
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
    assert.equal(await page.locator('[data-v2-nav]').isVisible(), true);
    await staticAircraft(page);
    const nativePhoto = page.locator('#work noscript img').first();
    if (await nativePhoto.count()) await loaded(nativePhoto);
    await visit(page, '/v3/projects/'); await searchCount(page, 15);
    assert.equal(await page.locator('[data-v2-search-wrap]').isVisible(), false);
    await noOverflow(page, 'No-JS collection');
  });
  for (const [name, options] of [['reduced motion', {}], ['Save Data', { motion: 'no-preference', saveData: true }], ['short viewport', { motion: 'no-preference', viewport: { width: 844, height: 390 } }]]) {
    await browserTest(name + ' retains static aircraft without CAD downloads', options, async ({ page, requests }) => {
      await visit(page); await approachAircraft(page); await staticAircraft(page);
      assert.equal(await page.locator(hero).getAttribute('data-aircraft-state'), 'static');
      assert.equal(requests.some(url => cadRequest.test(url)), false, 'Preference must avoid automatic model and Three downloads');
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
        assert.match(await page.locator('[data-aircraft-copy] article[data-aircraft-chapter="0"] h1').textContent(), /Andrew Chung/);
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
      if (viewport.width === 390) {
        await screenshot(page, 'mobile-' + (route === '/v3/' ? 'home' : route.replace(/^\/v3\/|\/$/g, '').replaceAll('/', '-')));
        if (route === '/v3/') await screenshot(page, 'mobile-home-full', true);
      }
    }
    return { viewports: sizes, routes };
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
      const playwright = require('playwright');
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
  evidence.coverage = staticOnly ? 'Source checks only; browser rendering and interactions were not run.' : evidence.browser?.status === 'blocked' ? 'Browser launch failed; static results are not a browser pass.' : 'Static inventory, live DOM, keyboard, fallback, responsive and actual WebGL readiness checks.';
  fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify(evidence, null, 2));
  console.log(evidence.status.toUpperCase() + ': ' + evidence.tests.filter(item => item.status === 'passed').length + '/' + evidence.tests.length + ' checks; artifacts ' + output);
  if (evidence.status !== 'passed') process.exitCode = 1;
})().catch(error => { console.error(error); process.exitCode = 1; });
