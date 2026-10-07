/* Gallery acceptance against the real page, photographs and CSS. Hero scripts
 * are omitted only in this test so the native UI checks do not start WebGL.
 * Requires the local static server and Playwright. V2_BASE_URL,
 * CHROMIUM_EXECUTABLE and GALLERY_OUT are optional overrides. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const base = process.env.V2_BASE_URL || 'http://127.0.0.1:8080';
const output = process.env.GALLERY_OUT || '.codex-temp/gallery';
const detailPattern = /\/(?:tramtrace-controller|skylabs-telemetry-macro|framework-dual-ports)-(?:960|1920)\.webp/;
const galleryPhotoPattern = /\/assets\/images\/(?:projects\/|v2\/hardware\/(?:framework-logic-analyser|tamagotchi-sd-card)\.webp)/;
const projects = [
  { key: 'tramtrace', photo: 'tramtrace-hero', detail: 'tramtrace-controller', href: '/v2/projects/tramtrace/' },
  { key: 'skylabs', photo: 'skylabs-telemetry-hero', detail: 'skylabs-telemetry-macro', href: '/v2/projects/skylabs/' },
  { key: 'dual-usb-c', photo: 'framework-dual-hero', detail: 'framework-dual-ports', href: '/v2/projects/framework-dual-usb/' }
];
const evidence = [];

async function newPage(browser, options = {}) {
  const context = await browser.newContext({
    viewport: options.viewport || { width: 1440, height: 1000 },
    reducedMotion: options.reduced ? 'reduce' : 'no-preference',
    javaScriptEnabled: options.javaScriptEnabled !== false,
    isMobile: !!options.mobile,
    hasTouch: !!options.mobile
  });
  await context.route(/\/assets\/(?:v2-hero-startup|v2-assembly|v2-hero-loading)\.js(?:\?|$)/,
    route => route.fulfill({ contentType: 'application/javascript', body:
      options.heroScrollArea && /\/v2-assembly\.js/.test(route.request().url())
        ? 'document.querySelector("[data-assembly]").classList.add("is-enhanced");' : '' }));
  if (options.saveData) await context.addInitScript(() => {
    Object.defineProperty(navigator, 'connection', { configurable: true, value: { saveData: true } });
  });
  const page = await context.newPage();
  const errors = [], requests = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => requests.push(request.url()));
  return { context, page, errors, requests };
}

async function visit(page, suffix = '?v=gallery-check') {
  await page.goto(base + '/v2/' + suffix, { waitUntil: 'networkidle' });
  await page.locator('[data-gallery-ready="true"]').waitFor();
}

async function approach(page) {
  await page.locator('#work').evaluate(node => {
    scrollTo({ top: scrollY + node.getBoundingClientRect().top - 100, behavior: 'instant' });
  });
}

async function settled(page, project, view = 'overview', state = 'ready') {
  await page.waitForFunction(({ project, view, state }) => {
    const root = document.querySelector('[data-gallery]');
    const image = root.querySelector('[data-gallery-photo]:not([hidden]) .v2-gallery-sheet.is-current');
    return root.dataset.galleryActive === project && root.dataset.galleryView === view &&
      root.dataset.galleryState === state && !root.querySelector('[data-gallery-stage]').hasAttribute('aria-busy') &&
      (state === 'error' || (image?.complete && image.naturalWidth > 0));
  }, { project, view, state });
  await page.waitForFunction(() => document.querySelector('[data-gallery]').getAnimations({ subtree: true })
    .every(animation => animation.playState !== 'running' && animation.playState !== 'pending'));
}

async function choose(page, project, mobile = false) {
  const button = page.locator(`[data-gallery-select="${project}"]`);
  if (mobile) await button.evaluate(node => node.scrollIntoView({ block: 'end', behavior: 'instant' }));
  await (mobile ? button.tap() : button.click());
  await settled(page, project);
}

async function assertSelection(page, project, view = 'overview') {
  const match = projects.find(item => item.key === project);
  assert.equal(await page.locator('[data-gallery-select][aria-expanded="true"]').count(), 1);
  assert.equal(await page.locator(`[data-gallery-select="${project}"]`).getAttribute('aria-expanded'), 'true');
  assert.equal(await page.locator(`[data-gallery-project="${project}"] .v2-gallery-info`).evaluate(node => node.inert), false);
  assert.equal(await page.locator(`[data-gallery-project="${project}"] .v2-gallery-info a`).getAttribute('href'), match.href);
  const photo = page.locator('[data-gallery-photo]:not([hidden])');
  assert.equal(await photo.count(), 1, 'Only the selected project photograph is displayed after motion finishes');
  const current = photo.locator('.v2-gallery-sheet.is-current');
  assert.ok((await current.getAttribute('src')).includes(view === 'detail' ? match.detail : match.photo));
  assert.equal(await current.evaluate(image => image.complete && image.naturalWidth > 0), true);
  assert.equal(await page.locator(`button[data-gallery-view="${view}"]`).getAttribute('aria-pressed'), 'true');
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
}

async function finish(test, name, details = {}) {
  assert.deepEqual(test.errors, [], `${name}: JavaScript errors`);
  evidence.push({ name, ...details });
  console.log('PASS ' + name);
  await test.context.close();
}

(async () => {
  fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_EXECUTABLE || undefined });
  try {
    // Retain the real enhanced hero's CSS scroll area without starting its CAD
    // renderer. This checks preload-scanner and gallery request behavior at the
    // normal desktop viewport, rather than relying on native lazy-load distance.
    const startup = await newPage(browser, { heroScrollArea: true });
    await visit(startup.page);
    assert.equal(startup.requests.some(url => galleryPhotoPattern.test(url)), false, 'The initial hero has zero competing gallery photo requests');
    assert.equal(await startup.page.locator('[data-gallery] img[data-gallery-src][src]').count(), 0);
    await approach(startup.page);
    await settled(startup.page, 'tramtrace');
    await assertSelection(startup.page, 'tramtrace');
    assert.equal(startup.requests.some(url => /tramtrace-hero/.test(url)), true);
    await finish(startup, 'hero startup: zero gallery image requests until the gallery approaches');

    // With the hero controller omitted its poster layout is only one screen
    // tall. A short initial viewport keeps the gallery outside its 240px
    // approach margin, so the early-request assertion tests the actual gate.
    const desktop = await newPage(browser, { viewport: { width: 1440, height: 480 } });
    await visit(desktop.page);
    assert.ok(await desktop.page.locator('[data-gallery]').evaluate(node => node.getBoundingClientRect().top > innerHeight + 240));
    assert.equal(desktop.requests.some(url => detailPattern.test(url)), false, 'No detail photo is requested while the gallery is below the hero');
    await desktop.page.setViewportSize({ width: 1440, height: 1000 });
    await approach(desktop.page);
    await settled(desktop.page, 'tramtrace');
    await desktop.page.evaluate(() => { const url = new URL(location.href); url.hash = 'work'; history.replaceState(history.state, '', url); });
    const historyLength = await desktop.page.evaluate(() => history.length);
    for (const project of projects) {
      await choose(desktop.page, project.key);
      await assertSelection(desktop.page, project.key);
      await desktop.page.locator('button[data-gallery-view="detail"]').click();
      await settled(desktop.page, project.key, 'detail');
      await assertSelection(desktop.page, project.key, 'detail');
      const url = new URL(desktop.page.url());
      assert.equal(url.searchParams.get('v'), 'gallery-check');
      assert.equal(url.searchParams.get('project'), project.key);
      assert.equal(url.searchParams.get('view'), 'detail');
      assert.equal(url.hash, '#work');
      assert.equal(await desktop.page.evaluate(() => history.length), historyLength, 'Selecting a photograph does not add history entries');
    }
    await desktop.page.locator('[data-gallery-select="tramtrace"]').focus();
    await desktop.page.keyboard.press('ArrowDown');
    assert.equal(await desktop.page.locator('[data-gallery-select="skylabs"]').evaluate(node => node === document.activeElement), true);
    await desktop.page.keyboard.press('Enter');
    await settled(desktop.page, 'skylabs');
    await assertSelection(desktop.page, 'skylabs');
    await desktop.page.screenshot({ path: path.join(output, 'desktop.png') });
    await finish(desktop, 'desktop: all projects, real detail photos, keyboard and URL state');

    const race = await newPage(browser);
    let releaseDetail;
    const delayed = new Promise(resolve => { releaseDetail = resolve; });
    let detailStarted = false;
    await race.context.route(/\/framework-dual-ports-(?:960|1920)\.webp/, async route => {
      detailStarted = true;
      await delayed;
      await route.continue();
    });
    await visit(race.page);
    await approach(race.page);
    await choose(race.page, 'dual-usb-c');
    await race.page.locator('button[data-gallery-view="detail"]').click();
    await race.page.waitForFunction(() => document.querySelector('[data-gallery-stage]').getAttribute('aria-busy') === 'true');
    await choose(race.page, 'tramtrace');
    assert.equal(detailStarted, true);
    releaseDetail();
    await race.page.waitForLoadState('networkidle');
    await settled(race.page, 'tramtrace');
    await assertSelection(race.page, 'tramtrace');
    assert.equal(new URL(race.page.url()).searchParams.get('project'), 'tramtrace');
    await finish(race, 'late image completion cannot replace a newer selection');

    const shared = await newPage(browser, { reduced: true });
    await visit(shared.page, '?v=shared&project=skylabs&view=detail#work');
    await settled(shared.page, 'skylabs', 'detail');
    await assertSelection(shared.page, 'skylabs', 'detail');
    await shared.page.evaluate(() => history.pushState({}, '', location.href));
    await choose(shared.page, 'dual-usb-c');
    await shared.page.goBack();
    await settled(shared.page, 'skylabs', 'detail');
    await assertSelection(shared.page, 'skylabs', 'detail');
    assert.equal(new URL(shared.page.url()).searchParams.get('v'), 'shared');
    assert.equal(await shared.page.locator('[data-gallery]').evaluate(node => node.getAnimations({ subtree: true }).length), 0);
    await finish(shared, 'shared detail URL, browser back and reduced motion');

    const saver = await newPage(browser, { reduced: true, saveData: true });
    await visit(saver.page);
    await approach(saver.page);
    await settled(saver.page, 'tramtrace');
    for (const project of projects) await choose(saver.page, project.key);
    await saver.page.waitForLoadState('networkidle');
    assert.equal(saver.requests.some(url => detailPattern.test(url)), false, 'Save Data does not fetch an unselected detail');
    await saver.page.locator('button[data-gallery-view="detail"]').click();
    await settled(saver.page, 'dual-usb-c', 'detail');
    await assertSelection(saver.page, 'dual-usb-c', 'detail');
    assert.equal(saver.requests.some(url => /framework-dual-ports/.test(url)), true);
    assert.equal(saver.requests.some(url => /tramtrace-controller|skylabs-telemetry-macro/.test(url)), false);
    await finish(saver, 'Save Data fetches detail only after an explicit selection');

    for (const width of [390, 320]) {
      const phone = await newPage(browser, { viewport: { width, height: 844 }, reduced: true, mobile: true });
      await visit(phone.page);
      await approach(phone.page);
      await settled(phone.page, 'tramtrace');
      for (const project of projects) {
        await choose(phone.page, project.key, true);
        await assertSelection(phone.page, project.key);
        const bounds = await phone.page.locator('[data-gallery-stage]').boundingBox();
        assert.ok(bounds.y >= 65 && bounds.y + bounds.height <= 845, 'The selected photo remains visible alongside lower project controls');
        for (const button of await phone.page.locator('button[data-gallery-view]').all()) {
          const size = await button.boundingBox();
          assert.ok(size.width >= 44 && size.height >= 44, 'Thumbnail touch targets are at least 44px');
        }
      }
      await phone.page.locator('button[data-gallery-view="detail"]').tap();
      await settled(phone.page, 'dual-usb-c', 'detail');
      await assertSelection(phone.page, 'dual-usb-c', 'detail');
      await phone.page.screenshot({ path: path.join(output, `mobile-${width}.png`) });
      await phone.page.setViewportSize({ width, height: 600 });
      assert.equal(await phone.page.locator('[data-gallery-stage]').evaluate(node => getComputedStyle(node).position), 'static');
      await finish(phone, `${width}px mobile: visible selection feedback, touch targets and no overflow`);
    }

    const offline = await newPage(browser, { reduced: true });
    let failOriginal = true;
    await offline.context.route(/\/skylabs-telemetry-hero-(?:960|1920)\.webp/, route => failOriginal ? route.abort() : route.continue());
    await visit(offline.page);
    await approach(offline.page);
    await settled(offline.page, 'tramtrace');
    await offline.page.locator('[data-gallery-select="skylabs"]').click();
    await settled(offline.page, 'skylabs', 'overview', 'error');
    assert.equal(await offline.page.locator('[data-gallery-photo]:not([hidden]) [data-gallery-error="skylabs"]').isVisible(), true);
    assert.equal(await offline.page.locator('[data-gallery-error="skylabs"] a').getAttribute('href'), '/v2/projects/skylabs/');
    assert.equal(new URL(offline.page.url()).searchParams.get('project'), 'skylabs');
    failOriginal = false;
    await offline.page.locator('[data-gallery-retry="skylabs"]').click();
    await settled(offline.page, 'skylabs');
    await assertSelection(offline.page, 'skylabs');
    assert.equal(await offline.page.locator('[data-gallery-error="skylabs"]').isVisible(), false);
    assert.equal(await offline.page.locator('button[data-gallery-view="overview"]').evaluate(node => node === document.activeElement), true, 'Retry returns keyboard focus to the working photograph controls');
    await finish(offline, 'failed overview stays on the correct project and retry restores its photograph');

    const missingDetail = await newPage(browser, { reduced: true });
    await missingDetail.context.route(/\/tramtrace-controller-(?:960|1920)\.webp/, route => route.abort());
    await visit(missingDetail.page, '?v=detail-fallback&project=tramtrace&view=detail#work');
    await settled(missingDetail.page, 'tramtrace');
    await assertSelection(missingDetail.page, 'tramtrace');
    assert.equal(new URL(missingDetail.page.url()).searchParams.has('view'), false);
    assert.equal(new URL(missingDetail.page.url()).searchParams.get('v'), 'detail-fallback');
    await finish(missingDetail, 'missing optional detail keeps the correct overview and normalizes its URL');

    const plain = await newPage(browser, { javaScriptEnabled: false, viewport: { width: 390, height: 844 } });
    await plain.page.goto(base + '/v2/', { waitUntil: 'networkidle' });
    assert.equal(await plain.page.locator('[data-gallery]').getAttribute('data-gallery-ready'), null);
    assert.equal(await plain.page.locator('[data-gallery-stage]').isVisible(), false);
    for (const project of projects) {
      const article = plain.page.locator(`[data-gallery-project="${project.key}"]`);
      const nativePhoto = article.locator('noscript img');
      await nativePhoto.scrollIntoViewIfNeeded();
      assert.equal(await nativePhoto.isVisible(), true);
      await nativePhoto.evaluate(image => image.decode());
      assert.equal(await nativePhoto.evaluate(image => image.naturalWidth > 0), true);
      assert.equal(await article.locator('.v2-gallery-info a').getAttribute('href'), project.href);
      assert.equal(await article.locator('.v2-gallery-info').isVisible(), true);
    }
    assert.equal(await plain.page.locator('.v2-gallery-more-card').count(), 4);
    assert.equal(await plain.page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await finish(plain, 'no JavaScript: all seven projects remain readable and linked');

    const blocked = await newPage(browser, { heroScrollArea: true });
    await blocked.context.route(/\/v2-gallery\.js(?:\?|$)/, route => route.abort());
    await blocked.page.goto(base + '/v2/?v=blocked-controller', { waitUntil: 'networkidle' });
    assert.equal(blocked.requests.some(url => galleryPhotoPattern.test(url)), false, 'A failed gallery controller still leaves hero bandwidth free');
    assert.equal(await blocked.page.locator('[data-gallery]').getAttribute('data-gallery-ready'), null);
    await blocked.page.goto(base + '/v2/?v=blocked-controller#work', { waitUntil: 'networkidle' });
    assert.equal(await blocked.page.locator('[data-gallery-stage]').isVisible(), false);
    for (const project of projects) {
      const article = blocked.page.locator(`[data-gallery-project="${project.key}"]`);
      const photo = article.locator('[data-gallery-original]');
      await article.scrollIntoViewIfNeeded();
      await blocked.page.waitForFunction(key => {
        const image = document.querySelector(`[data-gallery-project="${key}"] [data-gallery-original]`);
        return image.hasAttribute('src') && image.complete && image.naturalWidth > 0;
      }, project.key);
      assert.equal(await photo.isVisible(), true);
      assert.equal(await article.locator('.v2-gallery-info a').getAttribute('href'), project.href);
    }
    for (const image of await blocked.page.locator('.v2-gallery-more-card img').all()) {
      await image.locator('..').scrollIntoViewIfNeeded();
      await image.evaluate(image => new Promise((resolve, reject) => {
        if (image.complete && image.naturalWidth) return resolve();
        image.addEventListener('load', resolve, { once: true });
        image.addEventListener('error', reject, { once: true });
      }));
    }
    assert.equal(await blocked.page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await finish(blocked, 'failed controller: viewport-gated native photos and all project links survive');
  } finally {
    await browser.close();
    fs.writeFileSync(path.join(output, 'evidence.json'), JSON.stringify(evidence, null, 2));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
