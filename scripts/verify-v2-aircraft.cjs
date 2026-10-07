/* Focused acceptance for the deferred Skylabs story inside the existing v2
 * homepage. Run against a local HTTP server; screenshots and evidence remain
 * in .codex-temp. Capture controls are enabled only by the test URL. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { chromium } = require('playwright');
const base = process.env.V2_BASE_URL || 'http://127.0.0.1:8080';
const output = process.env.V2_AIRCRAFT_OUT || '.codex-temp/v2-aircraft';
const baseline = process.env.V2_AIRCRAFT_BASELINE || 'ff8eed148bc2de5abf1208a3ee7cad9efc34da5d';
const aircraft = '[data-aircraft-hero]';
const evidence = [];
const aircraftRequest = /\/assets\/(?:models\/aircraft\/|v3-aircraft-(?:scene|atmosphere)\.js|vendor\/(?:GLTFLoader|meshopt_decoder)[^/]*)/i;
const telemetryRequest = /\/assets\/models\/hero\/telemetry\.(?:idx\.bin\.gz|bin)(?:\?|$)/;

function passed(name, details = {}, run) {
  if (run) { assert.deepEqual(run.errors, [], 'No unhandled browser errors'); assert.deepEqual(run.shaders, [], 'No shader compilation errors'); }
  evidence.push({ name, ...details }); console.log('PASS ' + name);
}
function sourceContract() {
  const original = execFileSync('git', ['-c', 'safe.directory=' + process.cwd().replaceAll('\\', '/'), 'show', baseline + ':v2/index.html'], { encoding: 'utf8' });
  const current = fs.readFileSync('v2/index.html', 'utf8');
  const initialHero = html => html.match(/<section class="v2-assembly"[\s\S]*?<\/section>/)?.[0].replaceAll('\r\n', '\n');
  assert.ok(initialHero(original)); assert.equal(initialHero(current), initialHero(original), 'Existing three-project hero remains byte-for-byte unchanged');
  const workHeading = html => html.match(/<div class="v2-gallery-heading" id="work">[^\n]+/)?.[0].trim();
  assert.equal(workHeading(current), workHeading(original), '#work still targets the original Selected work heading');
  assert.ok(current.indexOf('data-gallery') < current.indexOf('data-aircraft-hero') && current.indexOf('data-aircraft-hero') < current.indexOf('class="v2-about-preview'), 'Aircraft follows Selected work and precedes About');
  assert.match(current, /data-aircraft-deferred/);
  passed('original hero, work anchor and section ordering', { baseline });
}
async function open(browser, options = {}) {
  const context = await browser.newContext({ viewport: options.viewport || { width: 1440, height: 900 }, javaScriptEnabled: options.js !== false, reducedMotion: options.reduced ? 'reduce' : 'no-preference' });
  const page = await context.newPage(), requests = [], errors = [], shaders = [];
  page.setDefaultTimeout(30000);
  page.on('request', request => requests.push(request.url()));
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (/Shader Error|VALIDATE_STATUS|Error compiling shader|THREE.WebGLProgram/.test(message.text())) shaders.push(message.text()); });
  return { context, page, requests, errors, shaders };
}
async function scrollTo(page, selector, offset = 0) {
  await page.locator(selector).evaluate((element, adjustment) => scrollTo({ top: scrollY + element.getBoundingClientRect().top + adjustment, behavior: 'instant' }), offset);
}
async function idleFrames(page, selector, key, label) {
  await page.waitForTimeout(400);
  const before = await page.locator(selector).getAttribute(key);
  await page.waitForTimeout(650);
  assert.equal(await page.locator(selector).getAttribute(key), before, label);
}
async function settle(page) {
  await page.waitForFunction(() => document.querySelector('[data-aircraft-hero]').getAnimations({ subtree: true }).every(animation => !['running', 'pending'].includes(animation.playState)));
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}
async function progress(page, amount) {
  await page.locator(aircraft).evaluate((root, value) => scrollTo({ top: scrollY + root.getBoundingClientRect().top + (root.offsetHeight - root.querySelector('[data-aircraft-stage]').offsetHeight) * value, behavior: 'instant' }), amount);
  await page.waitForFunction(value => Math.abs(Number(document.querySelector('[data-aircraft-hero]').dataset.aircraftProgress) - value) < .003, amount);
  await settle(page);
  return page.locator(aircraft).evaluate(root => ({ ...root.dataset }));
}
async function layout(page, pinned = true) {
  const result = await page.evaluate(() => {
    const root = document.querySelector('[data-aircraft-hero]'), rect = element => { const box = element.getBoundingClientRect(); return { x: box.x, y: box.y, right: box.right, bottom: box.bottom, width: box.width, height: box.height }; };
    return { overflow: document.documentElement.scrollWidth > innerWidth + 1, header: document.querySelector('header').getBoundingClientRect().bottom, navigation: [...root.querySelectorAll('[data-aircraft-go]')].map(rect), copy: [...root.querySelectorAll('[data-aircraft-chapter].is-current > *')].filter(element => getComputedStyle(element).display !== 'none').map(rect) };
  });
  assert.equal(result.overflow, false, 'No horizontal overflow');
  for (const box of result.navigation) {
    assert.ok(box.width >= 44 && box.height >= 44, 'Aircraft navigation uses 44px targets');
    assert.ok(box.x >= -1 && box.right <= page.viewportSize().width + 1, 'Aircraft navigation fits horizontally');
    if (pinned) assert.ok(box.y >= result.header - 1 && box.bottom <= page.viewportSize().height + 1, 'Pinned navigation fits below the existing header');
  }
  if (pinned) for (const box of result.copy) {
    assert.ok(box.x >= -1 && box.right <= page.viewportSize().width + 1, 'Story copy fits horizontally');
    assert.ok(box.y >= result.header - 1 && box.bottom < Math.min(...result.navigation.map(box => box.y)), `Story copy fits between the header and controls (${JSON.stringify({ box, header: result.header, navigation: result.navigation })})`);
  }
  return result;
}
async function desktop(browser) {
  const run = await open(browser), { page } = run;
  try {
    await page.goto(base + '/v2/?capture&v=aircraft-integration-test', { waitUntil: 'domcontentloaded' });
    await page.locator('[data-assembly-models-ready="3"]').waitFor({ timeout: 120000 });
    await page.waitForTimeout(800);
    assert.equal(run.requests.filter(url => aircraftRequest.test(url)).length, 0, 'Aircraft dependencies do not compete with the opening hero');
    await page.mouse.move(700, 450); await page.mouse.wheel(0, 100);
    await page.waitForTimeout(200);
    assert.ok(Number(await page.locator(aircraft).getAttribute('data-aircraft-landing')) === 0, 'Scrolling the original hero does not finish the unseen landing');
    await scrollTo(page, '#work'); await page.waitForTimeout(300);
    const distance = await page.locator(aircraft).evaluate(root => root.getBoundingClientRect().top - innerHeight);
    assert.ok(distance > 300, 'Selected work remains well above the aircraft');
    assert.equal(run.requests.filter(url => aircraftRequest.test(url)).length, 0, 'Selected work does not trigger distant aircraft loading');
    assert.ok(Number(await page.locator(aircraft).getAttribute('data-aircraft-landing')) === 0, 'Gallery scrolling preserves the automatic landing');
    const sharedTelemetryBefore = run.requests.filter(url => telemetryRequest.test(url));
    assert.equal(sharedTelemetryBefore.length, 1, 'Original hero has fetched its telemetry pack once');
    passed('deferred loading preserves the original hero and gallery', { distance, telemetryRequests: sharedTelemetryBefore.length }, run);

    await scrollTo(page, aircraft);
    await page.locator('[data-aircraft-state="landing"]').waitFor({ timeout: 120000 });
    const landing = Number(await page.locator(aircraft).getAttribute('data-aircraft-landing'));
    assert.ok(landing < .7, 'Entry begins the automatic landing instead of skipping to stopped');
    await page.locator('[data-aircraft-phase="stopped"][data-aircraft-state="ready"]').waitFor({ timeout: 30000 });
    await page.locator('[data-aircraft-telemetry-ready="true"]').waitFor({ timeout: 60000 });
    await page.waitForFunction(() => !!window.__v3Aircraft?.atmosphere);
    await page.waitForLoadState('networkidle');
    assert.equal(run.requests.filter(url => telemetryRequest.test(url)).length, 1, 'Aircraft reuses the existing telemetry transport rather than downloading it again');
    assert.equal(run.requests.filter(url => /\/v2-hero-assets\.js/.test(url)).length, 1, 'Shared asset loader is initialized once');
    assert.equal(await page.locator(aircraft).getAttribute('data-aircraft-source-occurrences'), '117');
    await idleFrames(page, '[data-assembly]', 'data-assembly-frames', 'Original hero stops rendering while the aircraft is visible');
    await idleFrames(page, aircraft, 'data-aircraft-frames', 'Aircraft stops rendering after landing');
    await layout(page);
    await page.screenshot({ path: path.join(output, 'desktop-aircraft.png') });
    passed('entry landing, original CAD and shared telemetry reuse', { landing, aircraftRequests: run.requests.filter(url => aircraftRequest.test(url)) }, run);

    const samples = [];
    for (const amount of [0, .2, .43, 1, 0]) {
      const state = await progress(page, amount); samples.push({ progress: amount, sky: Number(state.aircraftAtmosphere), phase: state.aircraftPhase });
      if (amount === 0) assert.equal(Number(state.aircraftAtmosphere), 1, 'Reverse scrolling restores the clouds');
      if (amount === .2) assert.ok(Number(state.aircraftAtmosphere) > 0 && Number(state.aircraftAtmosphere) < 1, 'Clouds fade during the peel');
      if (amount >= .43) assert.equal(Number(state.aircraftAtmosphere), 0, 'Clouds are gone before telemetry extraction');
      await layout(page);
    }
    await page.locator('[data-aircraft-go="2"]').click();
    await page.waitForFunction(() => location.hash === '#skylabs-telemetry' && document.querySelector('[data-aircraft-hero]').dataset.aircraftChapter === '2');
    await settle(page);
    assert.equal(await page.locator('#copy-skylabs-telemetry a').first().getAttribute('href'), '/v2/projects/skylabs/boards/telemetry/');
    await page.screenshot({ path: path.join(output, 'desktop-telemetry.png') });
    await scrollTo(page, '.v2-about-preview', 100); await idleFrames(page, aircraft, 'data-aircraft-frames', 'Aircraft stops rendering below its section');
    await scrollTo(page, '#work'); await idleFrames(page, aircraft, 'data-aircraft-frames', 'Aircraft stops rendering above its section');
    passed('cloud fade, reverse, chapter links and offscreen suspension', { samples }, run);
  } finally { await run.context.close(); }
}
async function mobile(browser) {
  const run = await open(browser, { viewport: { width: 390, height: 844 } }), { page } = run;
  try {
    await page.goto(base + '/v2/?v=aircraft-integration-mobile#skylabs-telemetry', { waitUntil: 'domcontentloaded' });
    await page.locator('[data-aircraft-telemetry-ready="true"][data-aircraft-chapter="2"]').waitFor({ timeout: 120000 });
    await settle(page); await layout(page);
    assert.equal(await page.evaluate(() => '__v3Aircraft' in window), false, 'Production has no capture controls');
    await page.screenshot({ path: path.join(output, 'mobile-telemetry.png') });
    await page.locator('[data-aircraft-go="0"]').click();
    await page.waitForFunction(() => location.hash === '#skylabs-aircraft' && document.querySelector('[data-aircraft-hero]').dataset.aircraftChapter === '0');
    await settle(page); await layout(page);
    await page.screenshot({ path: path.join(output, 'mobile-aircraft.png') });
    await page.locator('[data-aircraft-go="1"]').click();
    await page.waitForFunction(() => location.hash === '#skylabs-inside' && document.querySelector('[data-aircraft-hero]').dataset.aircraftChapter === '1');
    await settle(page); await layout(page);
    passed('mobile direct chapter, return navigation and layout', {}, run);
  } finally { await run.context.close(); }
}
async function staticCase(browser, name, options) {
  const run = await open(browser, options), { page } = run;
  try {
    await page.goto(base + '/v2/?v=aircraft-integration-static#skylabs-aircraft', { waitUntil: 'networkidle' });
    assert.equal(await page.locator(aircraft + '.is-story').count(), 0, 'Static preferences omit the long animation track');
    for (const id of ['skylabs-aircraft', 'skylabs-inside', 'skylabs-telemetry']) {
      assert.equal(await page.locator('#' + id).isVisible(), true, 'Static chapters remain readable');
      assert.equal(await page.locator('#' + id).getAttribute('aria-hidden'), null);
    }
    await page.waitForFunction(() => { const image = document.querySelector('[data-aircraft-poster]'); return image.complete && image.naturalWidth > 0 && image.currentSrc.includes('stopped'); });
    assert.equal(run.requests.filter(url => aircraftRequest.test(url)).length, 0, 'Static fallback requests no aircraft renderer or CAD');
    await scrollTo(page, aircraft); await layout(page, false);
    await page.screenshot({ path: path.join(output, name + '.png') });
    assert.equal(await page.locator('#skylabs-telemetry a').first().getAttribute('href'), '/v2/projects/skylabs/boards/telemetry/');
    passed(name, {}, run);
  } finally { await run.context.close(); }
}
async function v3Regression(browser) {
  const run = await open(browser), { page } = run;
  try {
    await page.goto(base + '/v3/?v=shared-controller-regression', { waitUntil: 'domcontentloaded' });
    await page.locator('[data-aircraft-state="landing"]').waitFor({ timeout: 120000 });
    await page.locator('[data-aircraft-phase="stopped"][data-aircraft-state="ready"]').waitFor({ timeout: 30000 });
    assert.equal(Number(await page.locator(aircraft).getAttribute('data-aircraft-atmosphere')), 1, 'Standalone v3 still autoplays with the sky');
    await page.locator('[data-aircraft-go="1"]').click();
    await page.waitForFunction(() => location.hash === '#inside' && document.querySelector('[data-aircraft-hero]').dataset.aircraftChapter === '1');
    await settle(page); await layout(page);
    assert.equal(Number(await page.locator(aircraft).getAttribute('data-aircraft-atmosphere')), 0, 'Original v3 chapter navigation still fades the sky');
    passed('standalone v3 shared-controller regression', {}, run);
  } finally { await run.context.close(); }
}
(async () => {
  fs.mkdirSync(output, { recursive: true }); sourceContract();
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_EXECUTABLE, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  try {
    if (!process.argv.includes('--scene-only')) {
      await staticCase(browser, 'reduced-motion', { reduced: true });
      await staticCase(browser, 'no-javascript', { js: false, viewport: { width: 390, height: 844 } });
    }
    if (!process.argv.includes('--static-only')) {
      if (process.argv.includes('--mobile-only')) await mobile(browser);
      else { await desktop(browser); await mobile(browser); await v3Regression(browser); }
    }
  } finally { await browser.close(); fs.writeFileSync(path.join(output, 'evidence.json'), JSON.stringify(evidence, null, 2) + '\n'); }
  console.log(`${evidence.length} v2 aircraft acceptance groups passed.`);
})().catch(error => { console.error(error); process.exitCode = 1; });
