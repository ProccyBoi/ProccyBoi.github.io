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
const root = path.resolve(__dirname, '..');
const origin = new URL(process.env.V3_BASE_URL || 'http://localhost:8080/v3/').origin;
const output = path.resolve(process.env.V3_SCREENSHOTS || path.join(root, '.codex-temp/v3-portfolio'));
const staticOnly = process.argv.includes('--static-only');
const evidence = { started: new Date().toISOString(), origin, mode: staticOnly ? 'static-only' : 'full', tests: [], browser: null };
const projectSlugs = ['coaster', 'dash', 'framework-dual-usb', 'framework-expansion-card', 'framework-logic-analyser', 'framework-raspberry-pi', 'lora-receiver', 'lora-talkie', 'metroboard', 'rf-test-board', 'runswift', 'skylabs', 'switch-mode-power-supplies', 'tamagotchi-sd-card', 'tramtrace'];
const toolSlugs = ['scopelab', 'lithography-animation', 'mosfet-operating-regions'];
const primary = 'a[data-v2-project][href^="/v3/projects/"]';
const hero = '[data-aircraft-hero]';
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
async function screenshot(page, name, fullPage = false) {
  const file = name.replace(/[^a-z0-9_-]/gi, '-').toLowerCase() + '.png';
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
async function searchCount(page, count) {
  await page.waitForFunction(({ selector, count }) => [...document.querySelectorAll(selector)].filter(node => !node.hidden && !node.closest('[hidden]')).length === count, { selector: primary, count });
  assert.equal(await page.locator(primary + ':visible').count(), count);
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
    assert.equal(await page.locator('h1').isVisible(), true);
    assert.match(await page.locator('main').textContent(), /Andrew Chung|electrical engineering/i);
    const skip = page.locator('a[href$="#main"]').first();
    await skip.focus(); await page.keyboard.press('Enter');
    assert.equal(new URL(page.url()).hash, '#main');
    await noOverflow(page, 'Desktop home');
    await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
    await screenshot(page, 'desktop-home');
    await screenshot(page, 'desktop-home-full', true);
    await page.locator('[data-v2-nav] a[href="/v3/projects/"]').click();
    await page.waitForURL('**/v3/projects/');
    await searchCount(page, 15);
    await screenshot(page, 'desktop-collection');
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
  await browserTest('all interior routes and shared destinations return real content', { js: false }, async ({ page, context }) => {
    const routes = sourcePages.map(file => '/v3/' + file.replace(/index\.html$/, ''));
    for (const route of [...routes, '/shared/', '/book/', '/shared/flight-review/', '/assets/documents/Andrew_Chung_Public_CV.pdf']) {
      const response = await context.request.get(origin + route);
      assert.equal(response.status(), 200, route);
      const body = await response.body(); assert.ok(body.length > 100, route + ' body exists');
      if (route.endsWith('.pdf')) assert.equal(body.subarray(0, 4).toString(), '%PDF');
    }
    await visit(page, '/v3/projects/skylabs/flight-review/');
    await page.waitForURL('**/shared/flight-review/');
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
    await visit(page); await approachAircraft(page);
    await page.waitForFunction(() => {
      const root = document.querySelector('[data-aircraft-hero]');
      return root.dataset.aircraftState === 'unavailable' || Number(root.dataset.aircraftFrames) > 0;
    }, null, { timeout: 120000 });
    assert.notEqual(await page.locator(hero).getAttribute('data-aircraft-state'), 'unavailable', 'Actual WebGL must render; fallback is not a render pass');
    await page.locator('[data-aircraft-telemetry-ready="true"]').waitFor({ timeout: 120000 });
    const skip = page.locator('[data-aircraft-skip]'); if (await skip.isVisible()) await skip.click();
    await page.locator('[data-aircraft-state="ready"]').waitFor({ timeout: 30000 });
    assert.equal(await page.locator(hero).getAttribute('data-aircraft-assembly-error'), '0.000000000');
    await page.locator('[data-aircraft-go="0"]').focus(); await page.keyboard.press('ArrowRight');
    assert.equal(await page.locator('[data-aircraft-go="1"]').evaluate(node => node === document.activeElement), true);
    await page.keyboard.press('Enter');
    await page.locator(hero + '[data-aircraft-chapter="1"]').waitFor({ timeout: 30000 });
    assert.equal(await page.locator('[data-aircraft-canvas]').isVisible(), true);
    assert.equal(await page.locator(hero).getAttribute('data-aircraft-telemetry-components'), '153');
    await noOverflow(page, 'Rendered aircraft'); await screenshot(page, 'desktop-aircraft-telemetry');
    const state = await page.locator(hero).evaluate(node => ({ ...node.dataset }));
    assert.equal(await page.evaluate(() => '__v3Aircraft' in window), false, 'Production URL does not expose a capture global');
    return { renderer: 'rendered', state };
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
      let playwright;
      try { playwright = require('playwright'); }
      catch (error) { if (fs.existsSync('/opt/codex/cua_node/lib/node_modules/playwright')) playwright = require('/opt/codex/cua_node/lib/node_modules/playwright'); else throw error; }
      browser = await playwright.chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_EXECUTABLE || undefined, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
      evidence.browser = { status: 'launched', version: browser.version(), executable: process.env.CHROMIUM_EXECUTABLE || 'Playwright bundled Chromium' };
      await browserTests();
    } catch (error) { evidence.browser = { status: 'blocked', error: error.stack || String(error) }; console.error('BLOCKED browser suite: ' + evidence.browser.error); }
    finally { if (browser) await browser.close(); }
  }
  evidence.finished = new Date().toISOString();
  evidence.screenshots = screenshotPaths;
  evidence.status = evidence.tests.some(item => item.status === 'failed') ? 'failed' : evidence.browser?.status === 'blocked' ? 'blocked' : 'passed';
  evidence.coverage = staticOnly ? 'Source checks only; browser rendering and interactions were not run.' : evidence.browser?.status === 'blocked' ? 'Browser launch failed; static results are not a browser pass.' : 'Static inventory, live DOM, keyboard, fallback, responsive and actual WebGL readiness checks.';
  fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify(evidence, null, 2));
  console.log(evidence.status.toUpperCase() + ': ' + evidence.tests.filter(item => item.status === 'passed').length + '/' + evidence.tests.length + ' checks; artifacts ' + output);
  if (evidence.status !== 'passed') process.exitCode = 1;
})().catch(error => { console.error(error); process.exitCode = 1; });
