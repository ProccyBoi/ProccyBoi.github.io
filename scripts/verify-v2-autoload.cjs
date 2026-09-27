/* No-click loading, focus, reduced motion, visibility and retry acceptance.
   Start the static server first. Optional V2_BASE_URL / CHROMIUM_EXECUTABLE. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const {chromium} = require('playwright');
const base = process.env.V2_BASE_URL || 'http://127.0.0.1:8080';
const repository = path.resolve(__dirname, '..');
const configs = [
  {name:'hardware', route:'/v2/projects/framework-logic-analyser/', root:'[data-hardware]',
    stage:'[data-hardware-stage]', action:'[data-hardware-explode]',
    asset:'**/hardware/framework-logic-analyser/board.glb'},
  {name:'pi', route:'/v2/projects/framework-raspberry-pi/', root:'[data-pi-inspector]',
    stage:'[data-pi-stage]', action:'[data-pi-explode]', asset:'**/framework-pi-board.glb'},
  {name:'cad', route:'/__v2_autoload_cad__', root:'[data-cad-hero]', stage:'.qa-cad-stage',
    action:'[data-cad-view="top"]', asset:'**/framework-esp32/framework-board.glb'}
];
const cadHTML = `<!doctype html><html><head><meta charset="utf-8"><style>
  body{margin:0}[hidden]{display:none!important}.qa-cad-stage{position:relative;height:600px}
  .qa-cad-stage img,.qa-cad-stage canvas{position:absolute;inset:0;width:100%;height:100%;object-fit:contain}
  </style></head><body><main data-cad-hero data-cad-model="framework">
  <div class="qa-cad-stage"><img data-cad-poster src="/assets/images/v2/framework-cad.webp" alt="Board preview"><canvas data-cad-canvas hidden></canvas></div>
  <button data-cad-start>Open CAD</button><button data-cad-view="iso">Perspective</button><button data-cad-view="top">Top</button>
  <p data-cad-status role="status"></p></main><script src="/assets/v2-cad.js" defer></script></body></html>`;

async function createPage(browser, config, options = {}) {
  const page = await browser.newPage({viewport:{width:1200,height:900}, reducedMotion:options.reduced ? 'reduce' : 'no-preference'});
  const errors = [], geometry = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { if (/\.(glb|stl)(?:\?|$)/.test(request.url())) geometry.push(request.url()); });
  if (options.reduced) await page.addInitScript(() => {
    Object.defineProperty(navigator, 'connection', {configurable:true, value:{saveData:true}});
  });
  if (options.noObserver) await page.addInitScript(() => { delete window.IntersectionObserver; });
  let html = config.name === 'cad' ? cadHTML : await fs.readFile(path.join(repository, config.route, 'index.html'), 'utf8');
  html = html.replace(/<body\b[^>]*>/i, '$&<button id="qa-focus">Keep keyboard focus</button><div style="height:2500px" aria-hidden="true"></div>');
  await page.route(base + config.route, route => route.fulfill({contentType:'text/html', body:html}));
  return {page, errors, geometry};
}
const ready = (page, config) => page.waitForFunction(({root,name}) => document.querySelector(root)?.dataset[name+'State'] === 'ready', config, {timeout:90000});
const state = (page, config, key) => page.locator(config.root).getAttribute(`data-${config.name}-${key}`);
async function enter(page, config) {
  await page.locator(config.stage).scrollIntoViewIfNeeded();
  await ready(page, config);
  await page.waitForFunction(({root,name}) => Number(document.querySelector(root).dataset[name+'Frames']) > 0, config);
}
async function idle(page, config) {
  await page.waitForFunction(({root,name}) => document.querySelector(root).dataset[name+'Motion'] === 'idle', config);
  await page.waitForTimeout(100);
}

(async () => {
  const browser = await chromium.launch({headless:true, executablePath:process.env.CHROMIUM_EXECUTABLE || undefined,
    args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  try {
    for (const config of configs) {
      const {page, errors, geometry} = await createPage(browser, config);
      await page.goto(base + config.route);
      await page.locator('#qa-focus').focus();
      await page.waitForTimeout(180);
      assert.equal(geometry.length, 0, config.name + ': distant viewers defer geometry');
      assert.equal(await state(page, config, 'state'), 'poster');
      assert.equal(await page.locator(`[data-${config.name}-start]`).isVisible(), false);
      await enter(page, config);
      assert.equal(await page.evaluate(() => document.activeElement.id), 'qa-focus', 'Automatic loading must not move focus');
      assert.ok(geometry.length > 0, 'Entering the viewport automatically requests geometry');
      assert.equal(await page.locator(`[data-${config.name}-poster]`).isVisible(), false);
      if (config.name === 'hardware') assert.equal(await page.locator('[data-hardware-scroll]').getAttribute('aria-pressed'), 'false');
      await idle(page, config);
      const before = await state(page, config, 'frames');
      await page.waitForTimeout(250);
      assert.equal(await state(page, config, 'frames'), before, 'Idle viewers stop rendering');
      await page.evaluate(() => scrollTo({top:0,behavior:'instant'}));
      await page.waitForTimeout(180);
      const offscreen = await state(page, config, 'frames');
      await page.locator(config.action).evaluate(button => button.click());
      await page.waitForTimeout(250);
      assert.equal(await state(page, config, 'frames'), offscreen, 'Offscreen transitions do not render');
      await enter(page, config); await idle(page, config);
      assert.deepEqual(errors, []);
      await page.close();

      const reduced = await createPage(browser, config, {reduced:true});
      await reduced.page.goto(base + config.route); await enter(reduced.page, config);
      await reduced.page.locator(config.action).click(); await idle(reduced.page, config);
      if (config.name !== 'cad') await reduced.page.waitForFunction(({root,name}) => Number(document.querySelector(root).dataset[name+'Progress']) === 1, config);
      if (config.name === 'hardware') assert.equal(await state(reduced.page, config, 'progress'), '1.0000');
      if (config.name === 'pi') assert.equal(await state(reduced.page, config, 'progress'), '1.000');
      if (config.name === 'cad') assert.equal(await state(reduced.page, config, 'angle'), 'top');
      assert.deepEqual(reduced.errors, []);
      await reduced.page.close();

      const retry = await createPage(browser, config);
      let blocked = true, attempts = 0;
      await retry.page.route(config.asset, route => { attempts++; return blocked ? route.abort() : route.continue(); });
      await retry.page.goto(base + config.route);
      await retry.page.locator(config.stage).scrollIntoViewIfNeeded();
      await retry.page.waitForFunction(({root,name}) => document.querySelector(root).dataset[name+'State'] === 'unavailable', config, {timeout:90000});
      assert.equal(await retry.page.locator(`[data-${config.name}-poster]`).isVisible(), true);
      const button = retry.page.locator(`[data-${config.name}-start]`);
      assert.equal(await button.innerText(), 'Retry 3D'); assert.equal(await button.isEnabled(), true);
      const stopped = attempts; await retry.page.waitForTimeout(200);
      assert.equal(attempts, stopped, 'Failure does not repeatedly fetch automatically');
      blocked = false; await button.click(); await ready(retry.page, config);
      assert.equal(await button.isVisible(), false); assert.deepEqual(retry.errors, []);
      await retry.page.close();

      const fallback = await createPage(browser, config, {noObserver:true});
      await fallback.page.goto(base + config.route); await ready(fallback.page, config);
      assert.ok(fallback.geometry.length > 0, 'Browsers without IntersectionObserver still load');
      assert.deepEqual(fallback.errors, []); await fallback.page.close();
      console.log(`PASS ${config.name}: near-viewport autoload, no focus change, idle/offscreen pause, reduced motion/save-data, fallback, retry`);
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
