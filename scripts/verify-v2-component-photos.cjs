/* Component-photo acceptance through the real viewer keyboard controls.
 * Requires Playwright and a static server. Optional: V2_BASE_URL,
 * CHROMIUM_EXECUTABLE, V2_COMPONENT_PHOTOS_OUT. No synthetic selection events
 * or replacement CAD are used. One desktop viewport keeps this test focused. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const {chromium} = require('playwright');
const base = process.env.V2_BASE_URL || 'http://127.0.0.1:8080';
const output = process.env.V2_COMPONENT_PHOTOS_OUT || '.codex-temp/component-photos';
const cases = [
  {
    slug:'framework-dual-usb', root:'[data-dual-usb-inspector]', control:'[data-dual-usb-stage]', panel:'[data-dual-usb-part]', label:'[data-dual-usb-part-name]',
    ready:'[data-dual-usb-status].is-ready', selection:'data-explorer-part', ref:'U3', text:'U3 · CH334F',
    photo:'/assets/images/projects/framework-dual-hub-960.webp', alt:'Photograph of the CH334F hub soldered into the dual USB-C card.'
  },
  {
    slug:'skylabs', root:'[data-hardware]', stage:'[data-hardware-stage]', control:'[data-hardware-canvas]', panel:'[data-hardware-part]', label:'[data-hardware-part]',
    ready:'[data-hardware-state="ready"]', selection:'data-hardware-selection', ref:'U11', text:'U11 · HX711 strain interface',
    photo:'/assets/images/projects/skylabs-telemetry-macro-960.webp', alt:'Photograph of the HX711 strain interface on the assembled Skylabs telemetry board.'
  },
  {
    slug:'tramtrace', root:'[data-pcb-object]', control:'[data-pcb-object-canvas]', panel:'[data-pcb-part]', label:'[data-pcb-name]',
    ready:'[data-pcb-object][data-source-model="kicad-glb"]', selection:'data-explorer-part', ref:'U3', text:'U3 · ESP32-WROOM-32E',
    photo:'/assets/images/projects/tramtrace-controller-960.webp', alt:'Photograph of the ESP32 module and surrounding circuitry on TramTrace.'
  }
];

async function open(page, config) {
  await page.mouse.move(0, 0);
  await page.goto(base + '/v2/projects/' + config.slug + '/', {waitUntil:'domcontentloaded'});
  await page.locator(config.stage || config.control).scrollIntoViewIfNeeded();
  await page.locator(config.ready).waitFor({state:'attached', timeout:90000});
  await page.waitForFunction(selector => {
    const node = document.querySelector(selector);
    return node?.dataset.hardwareMotion === 'idle' || node?.dataset.explorerMotion === 'idle';
  }, config.root, {timeout:60000});
  assert.equal(await page.locator(config.panel + ' .v2-component-photo').count(), 0, 'No component photo exists before identifying a matching part');
  assert.deepEqual(await page.evaluate(() => window.__componentPhotoRequests), [], 'The enhancement must request no image before selection');
  await page.locator(config.control).focus();
}

async function selection(page, config) {
  return (await page.locator(config.root).getAttribute(config.selection) || '').split(' · ')[0];
}

async function select(page, config) {
  const visited = new Set();
  for (let count = 0; count < 180; count++) {
    await page.keyboard.press(']');
    const ref = await selection(page, config);
    if (ref === config.ref) {
      // In the Tram viewer this must survive the queued canvas render; a
      // keyboard readout must not immediately be cleared by an empty raycast.
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      assert.equal(await selection(page, config), config.ref);
      return count + 1;
    }
    assert.ok(ref && !visited.has(ref), config.slug + ': bracket browsing must reach ' + config.ref);
    visited.add(ref);
  }
  assert.fail(config.slug + ': component traversal exceeded its bound');
}

async function assertIdentity(page, config) {
  assert.equal(await page.locator(config.panel).isVisible(), true);
  assert.equal((await page.locator(config.label).textContent()).trim(), config.text, 'The real viewer identity remains intact');
}

async function assertReadable(page, config) {
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const result = await page.locator(config.label).evaluate(label => {
    const text = document.createTreeWalker(label, NodeFilter.SHOW_TEXT).nextNode(), range = document.createRange();
    range.selectNode(text);
    const lines = [...range.getClientRects()].filter(rect => rect.width && rect.height);
    // Readouts deliberately pass pointer input through to the board. Enable
    // hit testing briefly to check what actually paints above each text line.
    const previous = label.style.pointerEvents; label.style.pointerEvents = 'auto';
    const readable = lines.every(rect => {
      const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
      return hit && (hit === label || label.contains(hit));
    });
    label.style.pointerEvents = previous;
    const panel = label.closest('.v2-part-readout'), stage = panel.closest('.object-stage, .pcb-object-stage, .hardware-stage');
    const panelRect = panel.getBoundingClientRect(), stageRect = stage.getBoundingClientRect();
    return {readable, lines:lines.length, withinStage:panelRect.top >= stageRect.top && panelRect.bottom <= stageRect.bottom, top:panelRect.top};
  });
  assert.ok(result.lines && result.readable, config.slug + ': every label line must paint above the viewer, clear of sticky navigation');
  assert.ok(result.withinStage, config.slug + ': the photograph must stay within its board stage');
  return result;
}

async function clear(page, config) {
  await page.keyboard.press('Escape');
  assert.equal(await selection(page, config), '');
  assert.equal(await page.locator(config.panel).isVisible(), false);
  assert.equal(await page.locator(config.panel + ' .v2-component-photo:visible').count(), 0, 'Escape clears the photograph with the component');
  assert.equal(await page.locator(config.panel).evaluate(panel => panel.style.getPropertyValue('--v2-component-photo-top')), '', 'Clearing restores the ordinary readout position');
}

(async () => {
  await fs.mkdir(output, {recursive:true});
  const browser = await chromium.launch({headless:true, executablePath:process.env.CHROMIUM_EXECUTABLE || undefined, args:['--use-angle=swiftshader', '--enable-unsafe-swiftshader']});
  const evidence = {cases:[], errors:[]};
  try {
    const context = await browser.newContext({viewport:{width:1440, height:1000}, reducedMotion:'no-preference'});
    // The same files are used in ordinary photo galleries. Track assignments
    // made by this enhancement specifically, so native gallery lookahead is
    // not incorrectly reported as eager component-image loading. The original
    // setter still performs each real browser request and decode.
    await context.addInitScript(() => {
      window.__componentPhotoRequests = [];
      const original = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src');
      Object.defineProperty(HTMLImageElement.prototype, 'src', {...original, set(value) {
        if (this.parentElement?.classList.contains('v2-component-photo')) window.__componentPhotoRequests.push(value);
        return original.set.call(this, value);
      }});
    });
    const page = await context.newPage();
    page.on('pageerror', error => evidence.errors.push(error.message));
    for (const config of cases) {
      await open(page, config);
      const steps = await select(page, config);
      await assertIdentity(page, config);
      const photo = page.locator(config.panel + ' .v2-component-photo img');
      await photo.waitFor({state:'visible', timeout:15000});
      assert.equal(await photo.getAttribute('src'), config.photo);
      assert.equal(await photo.getAttribute('alt'), config.alt);
      assert.equal(await photo.evaluate(img => img.complete && img.naturalWidth === 960 && img.naturalHeight === 640), true, 'The original photograph is decoded');
      assert.deepEqual(await page.evaluate(() => window.__componentPhotoRequests), [config.photo]);
      assert.equal(await page.locator(config.panel).evaluate(node => getComputedStyle(node).fontSize), '14px');
      await assertReadable(page, config);
      await page.locator(config.panel).screenshot({path:path.join(output, config.slug + '.png')});
      await clear(page, config);
      // Return to the same reference through actual controls. This exercises
      // readout.textContent replacement in the shared hardware viewer.
      await page.keyboard.press('['); await page.keyboard.press(']');
      await assertIdentity(page, config);
      await photo.waitFor({state:'visible'});
      assert.deepEqual(await page.evaluate(() => window.__componentPhotoRequests), [config.photo], 'Revisiting a component reuses its loaded Image');
      evidence.cases.push({project:config.slug, component:config.ref, keyboardSteps:steps, photograph:config.photo});
      console.log('PASS ' + config.slug + ': keyboard identification, original photograph, lazy loading, Escape and cached reuse');
      if (config.slug === 'framework-dual-usb') {
        for (const viewport of [{width:1440,height:1000}, {width:390,height:844}]) {
          await page.setViewportSize(viewport);
          await page.locator(config.control).evaluate(stage => scrollTo({top:scrollY + stage.getBoundingClientRect().top - 24, behavior:'instant'}));
          await clear(page, config);
          const before = await page.evaluate(() => scrollY);
          await page.keyboard.press('['); await page.keyboard.press(']');
          await assertReadable(page, config);
          assert.equal(await page.evaluate(() => scrollY), before, 'Identifying a part must not scroll the page');
          await page.evaluate(() => scrollBy({top:60, behavior:'instant'}));
          await assertReadable(page, config);
          await page.locator(config.panel).screenshot({path:path.join(output, config.slug + '-scrolled-' + viewport.width + '.png')});
          await page.locator(config.control).evaluate(stage => {
            const bottom = Math.max(...[...document.querySelectorAll('.v2-header, .v2-case-nav')].map(node => node.getBoundingClientRect().bottom));
            scrollTo({top:scrollY + stage.getBoundingClientRect().top - bottom - 30, behavior:'instant'});
          });
          await assertReadable(page, config);
          assert.equal(await page.locator(config.panel).evaluate(panel => panel.style.getPropertyValue('--v2-component-photo-top')), '', 'A fully visible stage returns the photo to its original top-right position');
        }
        await page.setViewportSize({width:1440,height:1000});
        evidence.cases.push({case:'sticky-navigation clearance at desktop and phone widths, passive scrolling, no page jump, original position restored'});
        console.log('PASS component label clears sticky navigation on desktop and phone without scrolling the page');
      }
      if (config.slug === 'skylabs') {
        await page.locator('[data-hardware-board="ground"]').click();
        await page.locator('[data-hardware="/assets/models/hardware/skylabs-ground-station/assembly.json"][data-hardware-state="ready"]').waitFor({timeout:90000});
        assert.equal(await page.locator(config.panel).isVisible(), false, 'Changing boards clears the telemetry readout');
        await page.locator(config.control).focus();
        const seen = new Set();
        for (let count = 0; count < 180; count++) {
          await page.keyboard.press(']');
          const ref = await selection(page, config);
          if (seen.has(ref)) break;
          assert.ok(ref, 'Ground-station keyboard identification must remain functional');
          seen.add(ref);
          assert.equal(await page.locator(config.panel + ' .v2-component-photo:visible').count(), 0, 'A ground-station reference must never show an aircraft photograph');
          assert.deepEqual(await page.evaluate(() => window.__componentPhotoRequests), [config.photo]);
        }
        assert.ok(seen.size > 1 && seen.size < 180, 'Ground-station components form a finite keyboard traversal');
        await clear(page, config);
        evidence.cases.push({case:'telemetry-to-ground switch', groundReferences:[...seen]});
        console.log('PASS ground-station switch: ' + seen.size + ' references without telemetry imagery');
      }
    }
    const failed = cases[0];
    await page.route('**' + failed.photo, route => route.fulfill({status:404, contentType:'text/plain', body:'Missing photograph fixture'}));
    await open(page, failed); await select(page, failed);
    await page.waitForFunction(selector => {
      const panel = document.querySelector(selector), img = panel?.querySelector('.v2-component-photo img');
      return img?.complete && img.naturalWidth === 0 && !panel.classList.contains('has-component-photo');
    }, failed.panel, {timeout:15000});
    await assertIdentity(page, failed);
    assert.equal(await page.locator(failed.panel + ' .v2-component-photo:visible').count(), 0);
    await page.keyboard.press(']');
    assert.notEqual(await selection(page, failed), failed.ref, 'A failed photograph cannot interrupt component browsing');
    await clear(page, failed);
    evidence.cases.push({case:'photograph 404 retains ordinary identity and keyboard controls'});
    assert.deepEqual(evidence.errors, []);
    await fs.writeFile(path.join(output, 'acceptance.json'), JSON.stringify(evidence, null, 2) + '\n');
    console.log(JSON.stringify({result:'PASS', cases:evidence.cases, evidence:path.join(output, 'acceptance.json')}, null, 2));
    await context.close();
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
