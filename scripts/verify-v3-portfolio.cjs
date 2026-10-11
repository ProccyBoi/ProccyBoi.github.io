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
const galleryProjects = [
  { key: 'tramtrace', slug: 'tramtrace', overview: 'tramtrace-hero', detail: 'tramtrace-controller' },
  { key: 'skylabs', slug: 'skylabs', overview: 'skylabs-telemetry-hero', detail: 'skylabs-telemetry-macro' },
  { key: 'dual-usb-c', slug: 'framework-dual-usb', overview: 'framework-dual-hero', detail: 'framework-dual-ports' }
];
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
        const deferred = (node.hasAttribute('data-v3-src') || node.hasAttribute('data-gallery-src')) && !node.getAttribute('src') && document.body.classList.contains('v2-ready');
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
      fs.writeFileSync(path.join(output, file), JSON.stringify({ url: run.page.url(), errors: run.errors, badResponses: run.badResponses, shaders: run.shaders, requests: run.requests, inputDiagnostics: await run.page.evaluate(() => window.__v3InputDiagnostics || null).catch(() => null) }, null, 2));
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
async function approachGallery(page) {
  await page.locator('[data-gallery]').evaluate(node => scrollTo({ top: scrollY + node.getBoundingClientRect().top - 100, behavior: 'instant' }));
}
async function gallerySettled(page, project = 'tramtrace', view = 'overview', state = 'ready') {
  await page.waitForFunction(({ project, view, state }) => {
    const root = document.querySelector('[data-gallery]'), image = root?.querySelector('[data-gallery-photo]:not([hidden]):not([inert]) img.is-current');
    return root?.dataset.galleryActive === project && root.dataset.galleryView === view && root.dataset.galleryState === state &&
      !root.querySelector('[data-gallery-stage]').hasAttribute('aria-busy') &&
      (state === 'error' || (image?.complete && image.naturalWidth > 0)) &&
      root.getAnimations({ subtree: true }).every(animation => !['running', 'pending'].includes(animation.playState));
  }, { project, view, state });
}
async function gallerySelect(page, key, view = 'overview') {
  await activateKeyboard(page, page.locator('[data-gallery-select="' + key + '"]'));
  await gallerySettled(page, key);
  if (view === 'detail') {
    await activateKeyboard(page, page.locator('button[data-gallery-view="detail"]'));
    await gallerySettled(page, key, 'detail');
  }
}
async function assertGalleryLinks(page, key) {
  const project = galleryProjects.find(item => item.key === key);
  const info = page.locator('[data-gallery-project="' + key + '"] .v2-gallery-info');
  const target = '/v3/projects/' + project.slug + '/';
  const primaryLink = info.locator('a[href="' + target + '"]');
  assert.equal(await primaryLink.count(), 1, 'One exact primary project link');
  assert.match((await primaryLink.textContent()).trim(), /^Explore\s+/);
  assert.equal(await primaryLink.isVisible(), true);
  if (key === 'tramtrace') {
    const copper = info.locator('a[href="/v3/projects/tramtrace/#copper-data"]');
    assert.equal(await copper.count(), 1); assert.match(await copper.textContent(), /Copper\s*&\s*LED data/);
    assert.ok(tags(read('v3/projects/tramtrace/index.html'), 'section').some(tag => tag.id === 'copper-data'), 'Copper CTA resolves to the real integrated workbench');
  }
  if (key === 'skylabs') {
    const aircraft = info.locator('a[href="#aircraft"]');
    assert.equal(await aircraft.count(), 1); assert.match(await aircraft.textContent(), /See the aircraft/);
    assert.equal(await page.locator('#aircraft').count(), 1, 'Aircraft CTA resolves to its real story destination');
  }
}
async function assertGallerySelection(page, key, view = 'overview') {
  const project = galleryProjects.find(item => item.key === key);
  assert.equal(await page.locator('[data-gallery-select][aria-expanded="true"]').count(), 1);
  assert.equal(await page.locator('[data-gallery-select="' + key + '"]').getAttribute('aria-expanded'), 'true');
  assert.equal(await page.locator('[data-gallery-project="' + key + '"] .v2-gallery-info').evaluate(node => node.inert), false);
  await assertGalleryLinks(page, key);
  const photo = page.locator('[data-gallery-photo]:not([hidden]):not([inert])');
  assert.equal(await photo.count(), 1);
  assert.equal(await page.locator('[data-gallery-photo]:not([hidden])').count(), 1, 'Settled gallery shows one unobstructed photograph');
  const image = photo.locator('img.is-current');
  assert.ok((await image.getAttribute('src')).includes(project[view]));
  assert.equal(await image.evaluate(node => node.complete && node.naturalWidth > 0 && node.alt.trim().length > 0), true);
  assert.equal(await page.locator('button[data-gallery-view="' + view + '"]').getAttribute('aria-pressed'), 'true');
  await noOverflow(page, 'Selected project gallery');
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
      assert.ok(tags(html, 'nav').some(tag => 'data-v2-nav' in tag), file + ': shared keyboard navigation hook');
      assert.ok(links(file).some(link => link.url.pathname === '/v3/'), file + ': home link');
    }
    return { routes: [...paths].sort() };
  });
  await test('Landing preview restores actual v2 gallery without assignment showcase', () => {
    const home = read('v3/index.html'), styles = tags(home, 'link').filter(tag => tag.rel === 'stylesheet').map(tag => tag.href.split('?')[0]);
    assert.ok(styles.includes('/assets/v2.css')); assert.ok(styles.includes('/assets/v2-gallery.css'));
    assert.ok(styles.includes('/assets/v3-landing.css')); assert.equal(styles.includes('/assets/v3.css'), false, 'Warm interior theme does not override the landing preview');
    assert.equal(/class="[^"]*\b(?:v3-system|v3-tools|v3-evidence-note|v3-signal-path)\b|id="skylabs-system"/.test(home), false, 'Remove assignment/showcase sections from the landing');
    const nav = home.match(/<nav\b[^>]*data-v2-nav[^>]*>([\s\S]*?)<\/nav>/)?.[1];
    assert.ok(nav); assert.equal(/>\s*Tools\b|href="[^\"]*#tools"/i.test(nav), false);
    const articles = tags(home, 'article').filter(tag => 'data-gallery-project' in tag);
    assert.deepEqual(articles.map(tag => tag['data-gallery-project']), galleryProjects.map(item => item.key));
    assert.deepEqual(articles.map(tag => tag['data-gallery-detail']), galleryProjects.map(item => item.detail));
    for (const project of galleryProjects) {
      assert.ok(tags(home, 'img').some(tag => tag['data-gallery-src']?.includes(project.overview)), project.key + ' genuine overview retained');
      for (const size of [960, 1920]) assert.ok(fs.existsSync(path.join(root, 'assets/images/projects/' + project.detail + '-' + size + '.webp')));
    }
    assert.ok(tags(home, 'script').some(tag => tag.src?.split('?')[0] === '/assets/v2-gallery.js'), 'Use the actual v2 gallery controller');
    for (const className of ['v2-about-preview', 'v2-contact']) assert.ok(home.includes(className));
    const footer = home.match(/<footer\b[\s\S]*?<\/footer>/)?.[0] || '';
    for (const target of ['/shared/', '/book/', '/assets/documents/Andrew_Chung_Public_CV.pdf']) assert.ok(tags(footer, 'a').some(tag => tag.href === target), target + ' remains available in footer');
    return { galleryProjects: galleryProjects.map(item => item.key), sharedGallery: true, previewOnly: true };
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
  await browserTest('landing uses actual v2 dark palette and Archivo typography', {}, async ({ page }) => {
    await visit(page);
    const theme = await page.evaluate(() => {
      const body = getComputedStyle(document.body), heading = getComputedStyle(document.querySelector('h1'));
      return { background: body.backgroundColor, color: body.color, font: body.fontFamily, headingFont: heading.fontFamily,
        tokens: Object.fromEntries(['--v2-bg', '--v2-ink', '--v2-muted', '--v2-line', '--v2-accent', '--v2-mono'].map(name => [name, body.getPropertyValue(name).trim()])) };
    });
    assert.equal(theme.background, 'rgb(20, 20, 18)'); assert.equal(theme.color, 'rgb(236, 235, 227)');
    assert.match(theme.font, /^Archivo(?:,|$)/); assert.match(theme.headingFont, /^Archivo(?:,|$)/);
    for (const [token, value] of Object.entries({ '--v2-bg': '#141412', '--v2-ink': '#ecebe3', '--v2-muted': '#aaa99f', '--v2-line': '#393a34', '--v2-accent': '#fa7148' })) assert.equal(theme.tokens[token].toLowerCase(), value);
    assert.match(theme.tokens['--v2-mono'], /IBM Plex Mono/);
    assert.equal(await page.locator('.v3-system,.v3-tools,.v3-evidence-note,.v3-signal-path').count(), 0);
    assert.equal(await page.locator('[data-v2-nav] a').filter({ hasText: /^Tools$/ }).count(), 0);
    return theme;
  });
  await browserTest('restored gallery real macros keyboard repeated selection and URL state', {}, async ({ page }) => {
    await visit(page, '/v3/?qa=landing#work'); await approachGallery(page); await gallerySettled(page);
    const historyLength = await page.evaluate(() => history.length);
    for (const project of galleryProjects) {
      await gallerySelect(page, project.key); await assertGallerySelection(page, project.key);
      if (project.key === 'tramtrace') await screenshot(page, 'desktop-gallery-overview');
      await activateKeyboard(page, page.locator('button[data-gallery-view="detail"]'));
      await gallerySettled(page, project.key, 'detail'); await assertGallerySelection(page, project.key, 'detail');
      await screenshot(page, 'desktop-gallery-' + project.key + '-detail');
      const url = new URL(page.url()); assert.equal(url.searchParams.get('qa'), 'landing'); assert.equal(url.hash, '#work');
      assert.equal(url.searchParams.get('project'), project.key); assert.equal(url.searchParams.get('view'), 'detail');
      assert.equal(await page.evaluate(() => history.length), historyLength, 'Photo selection replaces rather than spams history');
      await gallerySelect(page, project.key); await gallerySelect(page, project.key); await assertGallerySelection(page, project.key);
    }
    await page.locator('[data-gallery-select="tramtrace"]').focus(); await page.keyboard.press('ArrowDown');
    assert.equal(await page.locator('[data-gallery-select="skylabs"]').evaluate(node => node === document.activeElement), true);
    await page.keyboard.press('Enter'); await gallerySettled(page, 'skylabs');
    await page.keyboard.press('End'); assert.equal(await page.locator('[data-gallery-select="dual-usb-c"]').evaluate(node => node === document.activeElement), true);
    await page.keyboard.press('Home'); assert.equal(await page.locator('[data-gallery-select="tramtrace"]').evaluate(node => node === document.activeElement), true);
    return { projectCount: 3, realMacroCount: 3, keyboard: true, repeatedSelection: true };
  });
  await browserTest('restored gallery detail deep link reload Back and Forward', {}, async ({ page }) => {
    await visit(page, '/v3/?qa=shared&project=skylabs&view=detail#work'); await approachGallery(page);
    await gallerySettled(page, 'skylabs', 'detail'); await assertGallerySelection(page, 'skylabs', 'detail');
    await page.reload({ waitUntil: 'load' }); await approachGallery(page); await gallerySettled(page, 'skylabs', 'detail');
    await page.evaluate(() => history.pushState({}, '', location.href));
    await gallerySelect(page, 'dual-usb-c'); await page.goBack(); await gallerySettled(page, 'skylabs', 'detail');
    await assertGallerySelection(page, 'skylabs', 'detail');
    await page.goForward(); await gallerySettled(page, 'dual-usb-c'); await assertGallerySelection(page, 'dual-usb-c');
    assert.equal(new URL(page.url()).searchParams.get('qa'), 'shared');
  });
  await browserTest('restored gallery narrow detail view and Save Data', { touch: true, saveData: true, viewport: { width: 390, height: 844 } }, async ({ page, requests }) => {
    await visit(page); await approachGallery(page); await gallerySettled(page);
    for (const project of galleryProjects) await gallerySelect(page, project.key);
    assert.equal(requests.some(url => /tramtrace-controller|skylabs-telemetry-macro|framework-dual-ports/.test(url)), false, 'Save Data does not prefetch unselected macros');
    await activateKeyboard(page, page.locator('button[data-gallery-view="detail"]'));
    await gallerySettled(page, 'dual-usb-c', 'detail'); await assertGallerySelection(page, 'dual-usb-c', 'detail');
    await screenshot(page, 'mobile-gallery-detail');
    assert.equal(requests.some(url => /tramtrace-controller|skylabs-telemetry-macro/.test(url)), false);
    for (const button of await page.locator('button[data-gallery-view], [data-gallery-expand]').all()) {
      const bounds = await button.boundingBox(); assert.ok(bounds.width >= 44 && bounds.height >= 44, 'Photo controls have usable touch targets');
    }
    await page.setViewportSize({ width: 320, height: 740 }); await noOverflow(page, 'Gallery at 320px');
    await page.setViewportSize({ width: 390, height: 600 });
    assert.equal(await page.locator('[data-gallery-stage]').evaluate(node => getComputedStyle(node).position), 'static', 'Short viewports do not pin the gallery');
  });
  await browserTest('restored gallery image failure retry and missing detail recovery', { saveData: true }, async ({ page, context }) => {
    let failOverview = true;
    await context.route(/\/skylabs-telemetry-hero-(?:960|1920)\.webp/, route => failOverview ? route.abort() : route.continue());
    await context.route(/\/tramtrace-controller-(?:960|1920)\.webp/, route => route.abort());
    await visit(page); await approachGallery(page); await gallerySettled(page);
    await activateKeyboard(page, page.locator('[data-gallery-select="skylabs"]'));
    await gallerySettled(page, 'skylabs', 'overview', 'error');
    const error = page.locator('[data-gallery-error="skylabs"]'); assert.equal(await error.isVisible(), true);
    assert.equal(await error.locator('a').getAttribute('href'), '/v3/projects/skylabs/');
    failOverview = false; await page.locator('[data-gallery-retry="skylabs"]').click();
    await gallerySettled(page, 'skylabs'); await assertGallerySelection(page, 'skylabs');
    assert.equal(await page.locator('button[data-gallery-view="overview"]').evaluate(node => node === document.activeElement), true);
    await gallerySelect(page, 'tramtrace'); await activateKeyboard(page, page.locator('button[data-gallery-view="detail"]'));
    await gallerySettled(page, 'tramtrace'); await assertGallerySelection(page, 'tramtrace');
    assert.equal(new URL(page.url()).searchParams.has('view'), false, 'Missing macro normalizes back to its genuine overview');
  });
  for (const options of [{ name: 'no JavaScript', js: false }, { name: 'gallery controller failure', block: /\/assets\/v2-gallery\.js/ }]) {
    await browserTest('restored gallery remains readable with ' + options.name, { ...options, viewport: { width: 390, height: 844 } }, async ({ page }) => {
      await visit(page);
      for (const project of galleryProjects) {
        const article = page.locator('[data-gallery-project="' + project.key + '"]');
        const image = article.locator(options.js === false ? 'noscript img' : '[data-gallery-original]');
        await article.scrollIntoViewIfNeeded();
        if (options.js !== false) await page.waitForFunction(key => {
          const image = document.querySelector('[data-gallery-project="' + key + '"] [data-gallery-original]');
          return image?.complete && image.naturalWidth > 0;
        }, project.key);
        await loaded(image); assert.equal(await article.locator('.v2-gallery-info').isVisible(), true);
        await assertGalleryLinks(page, project.key);
      }
      await noOverflow(page, options.name + ' gallery');
    });
  }
  await browserTest('gallery delayed detail cannot replace a newer project selection', { saveData: true }, async ({ page, context }) => {
    let release;
    const delayed = new Promise(resolve => { release = resolve; });
    await context.route(/\/framework-dual-ports-(?:960|1920)\.webp/, async route => { await delayed; await route.continue(); });
    try {
      await visit(page); await approachGallery(page); await gallerySettled(page); await gallerySelect(page, 'dual-usb-c');
      await activateKeyboard(page, page.locator('button[data-gallery-view="detail"]'));
      await page.waitForFunction(() => document.querySelector('[data-gallery-stage]').getAttribute('aria-busy') === 'true');
      await gallerySelect(page, 'tramtrace'); release();
      await page.waitForLoadState('networkidle'); await gallerySettled(page, 'tramtrace'); await assertGallerySelection(page, 'tramtrace');
      assert.equal(new URL(page.url()).searchParams.get('project'), 'tramtrace');
    } finally { release(); }
  });
  await browserTest('expanded hardware photo zoom pan keyboard close and repeat', {}, async ({ page }) => {
    await visit(page); await approachGallery(page); await gallerySettled(page);
    await gallerySelect(page, 'skylabs', 'detail');
    const opener = page.locator('[data-gallery-expand]'), dialog = page.locator('[data-gallery-inspect]');
    await opener.scrollIntoViewIfNeeded(); await opener.focus();
    const before = { url: page.url(), scrollY: await page.evaluate(() => scrollY) };
    const expectedSource = await page.locator('[data-gallery-photo]:not([hidden]):not([inert]) img.is-current').evaluate(image => {
      const candidates = image.srcset.split(',').map(value => { const [url, size] = value.trim().split(/\s+/); return { url: new URL(url, location.href).href, size: parseInt(size) || 0 }; }).sort((a, b) => b.size - a.size);
      return candidates[0]?.url || image.currentSrc || image.src;
    });
    await page.keyboard.press('Enter'); await page.locator('[data-gallery-inspect][data-state="ready"]').waitFor();
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
    await dialog.locator('[data-inspect-reset]').click(); assert.equal(Number(await dialog.getAttribute('data-zoom')), 1);
    assert.equal(Number(await dialog.getAttribute('data-pan-x')), 0); assert.equal(Number(await dialog.getAttribute('data-pan-y')), 0);
    for (let i = 0; i < 12; i++) { await page.keyboard.press(i > 8 ? 'Shift+Tab' : 'Tab'); assert.equal(await dialog.evaluate(node => node.contains(document.activeElement)), true, 'Expanded photo contains forward and reverse keyboard focus'); }
    await page.keyboard.press('Escape'); await dialog.waitFor({ state: 'hidden' });
    assert.equal(await opener.evaluate(node => node === document.activeElement), true);
    assert.equal(page.url(), before.url); assert.ok(Math.abs(await page.evaluate(() => scrollY) - before.scrollY) <= 2);
    await page.keyboard.press('Enter'); await page.locator('[data-gallery-inspect][data-state="ready"]').waitFor();
    assert.equal(Number(await dialog.getAttribute('data-zoom')), 1, 'Reopening starts fitted rather than carrying stale pan/zoom');
    await dialog.locator('[data-inspect-close]').click(); await dialog.waitFor({ state: 'hidden' });
    await gallerySelect(page, 'dual-usb-c'); await opener.click(); await page.locator('[data-gallery-inspect][data-state="ready"]').waitFor();
    assert.match(await dialog.locator('[data-inspect-image]').getAttribute('src'), /framework-dual-hero/);
    await page.keyboard.press('Escape'); await dialog.waitFor({ state: 'hidden' });
    return { suppliedLargestPhoto: true, boundedZoom: [1, 3], keyboardAndPointerPan: true, focusAndScrollRestored: true };
  });
  await browserTest('expanded hardware photo mobile pinch pan and dismissal', { touch: true, viewport: { width: 390, height: 844 } }, async ({ page, context }) => {
    await visit(page); await approachGallery(page); await gallerySettled(page); await gallerySelect(page, 'tramtrace', 'detail');
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
    await assertGallerySelection(page, 'tramtrace', 'detail');
    return { viewport: { width: 390, height: 844 }, freshMobileClose: true, touchPinch: true, touchPan: true, postGestureControlTaps: true, inputDiagnostics: await page.evaluate(() => window.__v3InputDiagnostics) };
  });
  await browserTest('expanded photo Close ignores touch-down drag cancellation and multitouch', { touch: true, viewport: { width: 390, height: 844 } }, async ({ page, context }) => {
    await visit(page); await approachGallery(page); await gallerySettled(page);
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
  await browserTest('expanded photo resource failure retry and selected-source recovery', { saveData: true, viewport: { width: 390, height: 844 } }, async ({ page, context }) => {
    let fail = true;
    await context.route(/\/tramtrace-controller-1920\.webp/, route => fail ? route.abort() : route.continue());
    await visit(page); await approachGallery(page); await gallerySettled(page); await gallerySelect(page, 'tramtrace', 'detail');
    const opener = page.locator('[data-gallery-expand]'), dialog = page.locator('[data-gallery-inspect]');
    await opener.click(); await page.locator('[data-gallery-inspect][data-state="error"]').waitFor();
    assert.equal(await dialog.locator('[data-inspect-retry]').isVisible(), true);
    assert.equal(await dialog.locator('[data-inspect-in]').isDisabled(), true);
    assert.equal(await dialog.locator('[data-inspect-out]').isDisabled(), true);
    fail = false; await dialog.locator('[data-inspect-retry]').click();
    await page.locator('[data-gallery-inspect][data-state="ready"]').waitFor();
    assert.equal(await dialog.locator('[data-inspect-image]').evaluate(image => image.naturalWidth >= 1920), true);
    await page.keyboard.press('Escape'); await dialog.waitFor({ state: 'hidden' });
    await gallerySelect(page, 'skylabs'); await opener.click(); await page.locator('[data-gallery-inspect][data-state="ready"]').waitFor();
    assert.match(await dialog.locator('[data-inspect-image]').getAttribute('src'), /skylabs-telemetry-hero/);
    await page.keyboard.press('Escape'); await dialog.waitFor({ state: 'hidden' });
    await assertGallerySelection(page, 'skylabs');
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
