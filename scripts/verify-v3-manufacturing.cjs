/* Acceptance checks against the native v3 page and the real prepared CAD.
 * Run --static-only without WebGL, or --scene-only for the renderer checks.
 * --viewport=1265x712 narrows scene checks to one viewport.
 * Requires a local server, Playwright, and optional CHROMIUM_EXECUTABLE. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const base = process.env.V3_BASE_URL || 'http://127.0.0.1:8080';
const output = process.env.V3_MANUFACTURING_OUT || '.codex-temp/v3-manufacturing';
const staticOnly = process.argv.includes('--static-only');
const sceneOnly = process.argv.includes('--scene-only');
const selectedViewport = process.argv.find(argument => argument.startsWith('--viewport='))?.split('=')[1];
const evidence = [];
const modelRequest = /\/assets\/(?:models\/(?:hero|manufacturing)\/|vendor\/three\.min\.js|v3-manufacturing\.js)/;
const chapters = ['fabrication', 'copper', 'legend', 'assembly', 'in-use'];

async function newPage(browser, options = {}) {
  const context = await browser.newContext({
    viewport: options.viewport || { width: 1440, height: 1000 },
    reducedMotion: options.reduced ? 'reduce' : 'no-preference',
    javaScriptEnabled: options.javaScriptEnabled !== false,
    isMobile: !!options.mobile, hasTouch: !!options.mobile
  });
  if (options.saveData) await context.addInitScript(() => {
    Object.defineProperty(navigator, 'connection', { configurable: true, value: { saveData: true } });
  });
  if (options.block) await context.route(options.block, route => route.abort());
  const page = await context.newPage();
  const errors = [], requests = [], shaderErrors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => requests.push(request.url()));
  page.on('console', message => { if (/Shader Error|VALIDATE_STATUS|Error compiling shader|THREE.WebGLProgram/.test(message.text())) shaderErrors.push(message.text()); });
  return { context, page, errors, requests, shaderErrors };
}

async function layout(page) {
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, 'No horizontal page overflow');
  const nav = await page.locator('[data-v3-stage-nav] a').evaluateAll(links => links.map(link => {
    const box = link.getBoundingClientRect();
    return { width: box.width, height: box.height, left: box.left, right: box.right, top: box.top, bottom: box.bottom };
  }));
  const viewport = page.viewportSize();
  for (const target of nav) {
    assert.ok(target.width >= 44 && target.height >= 44, 'Native stage links meet the 44px target');
    assert.ok(target.left >= -1 && target.right <= viewport.width + 1, 'Stage links fit the viewport');
  }
  const pinned = await page.locator('[data-v3-hero].is-story').count();
  if (pinned) {
    for (const target of nav) assert.ok(target.top >= 0 && target.bottom <= viewport.height + 1, 'Pinned stage links fit vertically');
    const content = await page.locator('[data-v3-copy] .is-current').evaluate(article => {
      const visible = [...article.children].filter(node => getComputedStyle(node).display !== 'none');
      return visible.map(node => {
        const rect = node.getBoundingClientRect();
        return { top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right };
      });
    });
    for (const rect of content) {
      assert.ok(rect.top >= 70 && rect.bottom <= Math.min(...nav.map(target => target.top)) - 8, 'Active copy fits between header and stage navigation');
      assert.ok(rect.left >= 0 && rect.right <= viewport.width + 1, 'Active copy fits horizontally');
    }
  }
}

async function finish(run, name, details = {}) {
  assert.deepEqual(run.errors, [], 'No unhandled browser exceptions');
  assert.deepEqual(run.shaderErrors, [], 'No shader compilation errors');
  evidence.push({ name, ...details });
  console.log('PASS ' + name);
  await run.context.close();
}

async function staticCase(browser, name, options) {
  const run = await newPage(browser, options);
  const { page, requests } = run;
  await page.goto(base + '/v3/?v=manufacturing-test', { waitUntil: 'networkidle' });
  if (options.block && options.state) await page.locator(`[data-v3-hero-state="${options.state}"]`).waitFor();
  assert.equal(await page.locator('[data-v3-hero].is-story').count(), 0, 'Fallback removes the long animation track');
  for (const id of chapters) {
    assert.equal(await page.locator(`#${id}`).isVisible(), true, 'Every source chapter remains readable');
    assert.equal(await page.locator(`#${id}`).getAttribute('aria-hidden'), null);
  }
  await page.waitForFunction(() => {
    const image = document.querySelector('[data-v3-poster]');
    return image.complete && image.naturalWidth === 1600;
  });
  if (!options.block) assert.equal(requests.some(url => modelRequest.test(url)), false, 'Static preferences avoid all WebGL/CAD requests');
  await page.locator('[data-v3-go="3"]').click();
  assert.equal(new URL(page.url()).hash, '#assembly', 'Fallback uses native chapter anchors');
  assert.equal(await page.locator('#assembly h2').isVisible(), true);
  await layout(page);
  assert.equal(await page.locator('a[href="/v3/projects/tramtrace/"]').count(), 2);
  for (const frame of await page.locator('.v3-static-photo, .v3-project-photo').all()) {
    await frame.evaluate(node => node.scrollIntoView({ behavior: 'instant', block: 'center' }));
    await frame.locator('img:visible').waitFor();
    await page.waitForFunction(selector => {
      const images = [...document.querySelectorAll(selector)].filter(image => image.getBoundingClientRect().height > 0);
      return images.length > 0 && images.every(image => image.complete && image.naturalWidth > 0);
    }, await frame.evaluate(node => {
      node.dataset.checkedPhoto = 'true';
      return '[data-checked-photo="true"] img';
    }));
    await frame.evaluate(node => delete node.dataset.checkedPhoto);
  }
  await layout(page);
  await finish(run, name, { requests: requests.length });
}

async function progress(page, amount) {
  await page.locator('[data-v3-hero]').evaluate((root, target) => {
    const stage = root.querySelector('[data-v3-stage]');
    const top = scrollY + root.getBoundingClientRect().top;
    const distance = root.offsetHeight - stage.offsetHeight;
    scrollTo({ top: top + distance * target, behavior: 'instant' });
  }, amount);
  await page.waitForFunction(target => {
    const root = document.querySelector('[data-v3-hero]');
    return root.dataset.v3HeroState === 'ready' && Math.abs(Number(root.dataset.v3Progress) - target) < .003;
  }, amount);
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  return page.locator('[data-v3-hero]').evaluate(root => ({ ...root.dataset }));
}

async function sceneCase(browser, viewport, mobile) {
  const run = await newPage(browser, { viewport, mobile });
  const { page } = run;
  await page.goto(base + '/v3/?v=manufacturing-test', { waitUntil: 'domcontentloaded' });
  await page.locator('[data-v3-hero-state="ready"]').waitFor({ timeout: 120000 });
  const first = await progress(page, 0);
  assert.equal(Number(first.v3Components), 143);
  assert.equal(Number(first.v3Leds), 116);
  assert.equal(Number(first.v3OriginalMeshes), 104);
  assert.equal(Number(first.v3OriginalTriangles), 96514);
  assert.equal(Number(first.v3PasteApertures), 611);
  assert.ok(Number(first.v3FabricationTriangles) > 2, 'Fabrication uses the actual outline triangulation');
  assert.equal(run.requests.some(url => /back-copper\.svg/.test(url)), false, 'Unseen back copper is not loaded');
  assert.equal(run.requests.some(url => /tramtrace-hero-\d+\.webp/.test(url)), false, 'The final photo is deferred');
  await layout(page);
  const checks = mobile ? [[.35, 'solder-mask'], [.76, 'placement'], [.92, 'assembled']] : [
    [0, 'laminate'], [.20, 'etching'], [.35, 'solder-mask'], [.46, 'legend'],
    [.535, 'solder-paste'], [.65, 'placement'], [.76, 'placement'], [.875, 'reflow'], [.92, 'assembled']
  ];
  const phases = [];
  for (const [amount, expected] of checks) {
    const state = await progress(page, amount);
    assert.equal(state.v3Phase, expected);
    if (expected === 'placement') {
      assert.ok(Number(state.v3Placed) > 0 && Number(state.v3Placed) < 143);
      assert.ok(Number(state.v3Arriving) > 0 && Number(state.v3Arriving) < 143, 'Packages have individual arrival times');
    }
    if (expected === 'assembled') {
      assert.equal(Number(state.v3Placed), 143);
      assert.equal(Number(state.v3FinalError), 0, 'Source component transforms are restored exactly');
    }
    phases.push({ progress: amount, phase: state.v3Phase, placed: Number(state.v3Placed), arriving: Number(state.v3Arriving) });
    await page.screenshot({ path: path.join(output, `${viewport.width}-${expected}-${amount}.png`) });
  }
  await progress(page, .98);
  await page.locator('[data-v3-story-view="photo"]').waitFor();
  assert.equal(await page.locator('[data-v3-product-photo]').evaluate(image => image.complete && image.naturalWidth > 0), true);
  await page.waitForFunction(() => document.querySelector('[data-v3-visual]').getAnimations({ subtree: true }).every(animation => animation.playState !== 'running' && animation.playState !== 'pending'));
  await page.screenshot({ path: path.join(output, `${viewport.width}-photo.png`) });
  await layout(page);
  const backwards = await progress(page, .20);
  assert.equal(backwards.v3Phase, 'etching');
  assert.equal(Number(backwards.v3Placed), 0);
  assert.equal(backwards.v3StoryView, 'cad');
  const again = await progress(page, .92);
  assert.equal(Number(again.v3Placed), 143);
  assert.equal(Number(again.v3FinalError), 0);
  await page.waitForTimeout(350);
  const before = await page.locator('[data-v3-hero]').getAttribute('data-v3-frames');
  await page.waitForTimeout(800);
  assert.equal(await page.locator('[data-v3-hero]').getAttribute('data-v3-frames'), before, 'No idle renderer loop');
  await page.locator('[data-v3-go="0"]').focus();
  await page.keyboard.press('ArrowRight');
  assert.equal(await page.locator('[data-v3-go="3"]').evaluate(link => document.activeElement === link), true);
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => location.hash === '#assembly' && document.querySelector('[data-v3-hero]').dataset.v3Chapter === '3');
  await page.locator('[data-v3-go="4"]').click();
  await page.waitForFunction(() => location.hash === '#in-use' && document.querySelector('[data-v3-hero]').dataset.v3Chapter === '4');
  await page.locator('[data-v3-story-view="photo"]').waitFor();
  await page.locator('#work').evaluate(node => scrollTo({ top: scrollY + node.getBoundingClientRect().top + 10, behavior: 'instant' }));
  await page.waitForTimeout(350);
  const offscreen = await page.locator('[data-v3-hero]').getAttribute('data-v3-frames');
  await page.waitForTimeout(600);
  assert.equal(await page.locator('[data-v3-hero]').getAttribute('data-v3-frames'), offscreen, 'No offscreen renderer loop');
  if (!mobile) {
    await progress(page, .92);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.locator('[data-v3-hero-state="static"]').waitFor();
    assert.equal(await page.locator('#in-use').isVisible(), true);
    assert.equal(await page.locator('#in-use').evaluate(node => { const rect = node.getBoundingClientRect(); return rect.top >= 0 && rect.top < innerHeight; }), true, 'Live reduced-motion change preserves the active chapter in view');
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.locator('[data-v3-hero-state="ready"]').waitFor();
    await progress(page, .92);
    await page.locator('[data-v3-canvas]').evaluate(canvas => {
      const context = canvas.getContext('webgl2') || canvas.getContext('webgl');
      const lose = context.getExtension('WEBGL_lose_context');
      if (!lose) throw new Error('Context-loss extension unavailable');
      lose.loseContext();
    });
    await page.locator('[data-v3-hero-state="unavailable"]').waitFor();
    assert.equal(await page.locator('#in-use').evaluate(node => { const rect = node.getBoundingClientRect(); return rect.top >= 0 && rect.top < innerHeight; }), true, 'Late context loss preserves the final chapter in view');
    await page.locator('.v3-static-photo img:visible').waitFor();
    await page.waitForFunction(() => document.querySelector('.v3-static-photo img[data-v3-src]').naturalWidth > 0);
    assert.equal(await page.locator('#in-use .v3-link').isVisible(), true);
  }
  await finish(run, `${viewport.width}px real CAD: fabrication, placement, reflow, reverse scroll, photo, keyboard and finite rendering`, { phases, statistics: first });
}

(async () => {
  fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch({ headless: true,
    executablePath: process.env.CHROMIUM_EXECUTABLE || undefined,
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  try {
    if (!sceneOnly) {
    await staticCase(browser, 'Reduced motion: readable compact story, real photographs, zero CAD requests', { reduced: true });
    await staticCase(browser, 'Save Data: readable compact story, zero CAD requests', { saveData: true });
    await staticCase(browser, 'JavaScript disabled: native source story and four real project photos', { javaScriptEnabled: false });
    await staticCase(browser, 'Failed controller: source story, links and independent photo loading survive', { block: /\/v3-hero\.js(?:\?|$)/ });
    await staticCase(browser, 'Failed renderer dependency: compact fallback without hidden copy', { block: /\/vendor\/three\.min\.js(?:\?|$)/, state: 'unavailable' });
    await staticCase(browser, 'Failed registration: compact fallback without unhandled rejection', { block: /\/manufacturing\.json(?:\?|$)/, state: 'unavailable' });
    await staticCase(browser, '320px short phone: readable compact story with accessible controls', { viewport: { width: 320, height: 568 }, mobile: true });
    await staticCase(browser, '844px landscape phone: accessible stage links and real working photo', { viewport: { width: 844, height: 390 }, mobile: true });
    }
    if (!staticOnly) {
      const sizes = selectedViewport ? [selectedViewport.split('x').map(Number)] : [[1440, 1000], [390, 844], [320, 740]];
      for (const [width, height] of sizes) {
        assert.ok(width > 0 && height > 640, 'Scene viewport must have positive width and height above the compact fallback');
        await sceneCase(browser, { width, height }, width < 761);
      }
    }
  } finally {
    await browser.close();
    fs.writeFileSync(path.join(output, 'evidence.json'), JSON.stringify(evidence, null, 2));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
