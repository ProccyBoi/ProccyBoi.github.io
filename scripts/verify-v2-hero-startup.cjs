/* Interactive hero startup acceptance with deliberately delayed dependencies.
 * Keep the static server running at V2_BASE_URL (default localhost:8080).
 * CHROMIUM_EXECUTABLE selects the test browser; HERO_STARTUP_OUT changes the
 * ignored evidence directory. Source CAD, materials, and the real renderer
 * remain active. Only network timing and a deliberate failed dependency vary.
 * --static-only limits verification to reduced motion, Save Data and no-JS.
 * The default checks the current poster-only TramTrace/Dash/Pi homepage.
 * --legacy-loading-effect is only for an explicitly selected historical URL
 * that still serves the decorative loading canvas and async startup script.
 */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const base = process.env.V2_BASE_URL || 'http://127.0.0.1:8080';
const output = process.env.HERO_STARTUP_OUT || '.codex-temp/hero-startup';
const root = '[data-assembly]';
const board = '[data-hero-loading-board]';
const gate = () => { let release; const promise = new Promise(resolve => { release = resolve; }); return { promise, release }; };
const pause = duration => new Promise(resolve => setTimeout(resolve, duration));

async function phase(page, progress) {
  await page.evaluate(value => {
    const node = document.querySelector('[data-assembly]');
    scrollTo({ top: scrollY + node.getBoundingClientRect().top + value * (node.offsetHeight - node.querySelector('.v2-assembly-sticky').clientHeight), behavior: 'instant' });
  }, progress);
  await page.waitForFunction(value => {
    const node = document.querySelector('[data-assembly]'), span = Math.max(1, node.offsetHeight - node.querySelector('.v2-assembly-sticky').clientHeight);
    const actual = Math.min(1, Math.max(0, -node.getBoundingClientRect().top / span));
    // Native scroll positions are rounded to CSS pixels. Wait for the exact
    // reachable pose and any own-context GPU work, not an intermediate easing
    // sample which happens to be close to the requested fraction.
    return Math.abs(actual - value) <= 1 / span + .00001 && Math.abs(Number(node.dataset.assemblyProgress) - actual) < .00001 && node.dataset.assemblyGPUPending !== 'true';
  }, progress, { timeout: 60000 }).catch(async error => {
    console.error('Startup scroll diagnostic', { requested: progress, actual: await page.locator(root).evaluate(node => ({ ...node.dataset, scrollY, top: node.getBoundingClientRect().top, height: node.offsetHeight })) });
    throw error;
  });
}

async function visiblePoster(page, index) {
  // Re-entering a chapter legitimately starts the 250ms CSS opacity fade.
  // Keep the full opacity/decoded-image requirement, but wait for that visual
  // milestone rather than treating the controller's pose as a paint barrier.
  await page.waitForFunction(index => {
    const node = document.querySelectorAll('[data-assembly-posters] img')[index];
    if (!node) return false;
    const style = getComputedStyle(node), box = node.getBoundingClientRect();
    return node.complete && node.naturalWidth > 0 && Number(style.opacity) > .95 && style.visibility === 'visible' && box.width > 0 && box.height > 0 && box.bottom > 0 && box.top < innerHeight;
  }, index, { timeout: 15000 });
  return page.locator('[data-assembly-posters] img').nth(index).evaluate(node => ({ src: node.currentSrc, decoded: node.complete && node.naturalWidth > 0, opacity: Number(getComputedStyle(node).opacity), visibility: getComputedStyle(node).visibility }));
}

async function gpuReady(page, count = 3) {
  await page.waitForFunction(count => {
    const data = document.querySelector('[data-assembly]').dataset;
    return Number(data.assemblyModelsReady) === count && data.assemblyGPUPending === 'false' && data.assemblyGPUCompletion === 'complete' && Number(data.assemblyCompletedFrames) > 0;
  }, count, { timeout: 90000 });
}

async function failureSnapshot(page, name, error, extra = {}) {
  const report = { name, error: error.stack || String(error), ...extra };
  try {
    report.state = await page.evaluate(() => {
      const root = document.querySelector('[data-assembly]'), canvas = root?.querySelector('[data-assembly-canvas]');
      const describe = node => {
        const box = node.getBoundingClientRect(), style = getComputedStyle(node);
        return { dataset: { ...node.dataset }, style: node.getAttribute('style'), opacity: style.opacity, visibility: style.visibility, display: style.display, box: { x: box.x, y: box.y, width: box.width, height: box.height }, src: node.currentSrc || node.src, decoded: node.complete, naturalWidth: node.naturalWidth };
      };
      return { url: location.href, scrollY, viewport: { width: innerWidth, height: innerHeight, dpr: devicePixelRatio }, hidden: document.hidden,
        hero: root ? { ...describe(root), classes: root.className } : null, canvas: canvas ? { ...describe(canvas), width: canvas.width, height: canvas.height } : null,
        posters: [...document.querySelectorAll('[data-assembly-posters] img')].map(describe), boards: [...document.querySelectorAll('[data-hero-loading-board]')].map(describe),
        resources: performance.getEntriesByType('resource').filter(entry => /\/assets\//.test(entry.name)).map(entry => ({ name: entry.name, start: entry.startTime, duration: entry.duration, responseEnd: entry.responseEnd, transferSize: entry.transferSize })),
      };
    });
  } catch (failure) { report.collectionError = failure.message; }
  fs.writeFileSync(path.join(output, name + '-failure.json'), JSON.stringify(report, null, 2) + '\n');
  await page.screenshot({ path: path.join(output, name + '-failure.png'), timeout: 15000, animations: 'disabled' }).catch(() => {});
}

async function loaderState(page) {
  return page.locator(root).evaluate(node => ({
    state: node.dataset.heroLoadingState,
    frames: Number(node.dataset.heroLoadingFrames || 0),
    interactions: Number(node.dataset.heroLoadingInteractions || 0),
    pulses: Number(node.dataset.heroLoadingPulses || 0),
    lensActive: node.dataset.heroLoadingLensActive === 'true',
    modelsReady: Number(node.dataset.assemblyModelsReady || 0),
    modelsSettled: Number(node.dataset.assemblyModelsSettled || 0),
    boards: [...node.querySelectorAll('[data-hero-loading-board]')].map(item => item.dataset.state),
  }));
}

async function stableFrames(page, label) {
  // Two short intervals allow an in-flight frame or fade to finish without
  // confusing one queued callback with a continuing idle animation.
  await pause(180);
  const first = await loaderState(page);
  await pause(300);
  const last = await loaderState(page);
  assert.equal(last.frames, first.frames, label);
  return last;
}

async function poseMatches(page, index) {
  const result = await page.evaluate(i => {
    const overlay = document.querySelectorAll('[data-hero-loading-board]')[i];
    const poster = document.querySelectorAll('[data-assembly-posters] img')[i];
    const a = overlay.getBoundingClientRect(), b = poster.getBoundingClientRect();
    return {
      centreError: Math.hypot(a.x + a.width / 2 - b.x - b.width / 2, a.y + a.height / 2 - b.y - b.height / 2),
      board: { x: a.x, y: a.y, width: a.width, height: a.height },
      poster: { x: b.x, y: b.y, width: b.width, height: b.height },
      visible: getComputedStyle(overlay).visibility !== 'hidden',
      overflow: document.documentElement.scrollWidth > innerWidth,
    };
  }, index);
  assert.ok(result.centreError < 2, `Loading image must follow the project's scroll pose (${JSON.stringify(result)})`);
  assert.ok(result.visible && result.board.width > 0 && result.board.height > 0);
  assert.equal(result.overflow, false, 'The loading experience must not widen the page');
  return result;
}

async function pointerPoint(page, index) {
  return page.locator(board).nth(index).evaluate(node => {
    const box = node.getBoundingClientRect();
    return { x: Math.max(10, Math.min(innerWidth - 10, box.x + box.width / 2)), y: Math.max(100, Math.min(innerHeight - 180, box.y + box.height / 2)) };
  });
}

async function canvasHasInk(page) {
  return page.locator('.v2-hero-loading-canvas').evaluate(canvas => {
    const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
    for (let i = 3; i < data.length; i += 4) if (data[i] > 0) return true;
    return false;
  });
}

async function currentState(page) {
  return page.locator(root).evaluate(node => ({
    state: node.dataset.assemblyState, frames: Number(node.dataset.assemblyFrames || 0),
    modelsReady: Number(node.dataset.assemblyModelsReady || 0), modelsSettled: Number(node.dataset.assemblyModelsSettled || 0),
    posters: [...node.querySelectorAll('[data-assembly-posters] img')].map(item => item.dataset.assemblyModelState || 'poster'),
  }));
}

async function stableCurrentFrames(page, label) {
  await pause(180); const first = await currentState(page);
  await pause(300); const last = await currentState(page);
  assert.equal(last.frames, first.frames, label); return last;
}

async function currentStartup(browser, evidence, observeErrors) {
  const desktop = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'no-preference' });
  const page = await desktop.newPage(), three = gate(), pi = gate(), requests = [];
  observeErrors(page); page.on('request', request => requests.push(new URL(request.url()).pathname));
  await page.route('**/three.min.js', async route => { await three.promise; await route.continue(); });
  await page.route(/\/models\/hero\/pi(?:\.idx)?\.bin(?:\.gz)?(?:\?|$)/, async route => { await pi.promise; await route.continue(); });
  try {
    await page.goto(base + '/v2/', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => Number(document.querySelector('[data-assembly]')?.dataset.assemblyFrames) > 0);
    assert.equal(await page.evaluate(() => Boolean(window.THREE)), false, 'Poster scene works before Three.js');
    assert.equal(await page.locator('.v2-hero-loading, .v2-hero-loading-canvas').count(), 0, 'Current homepage has no decorative loading canvas');
    const initial = await visiblePoster(page, 0), poses = [];
    for (const [index, value, href] of [[0, .265, '/v2/projects/tramtrace/'], [1, .565, '/v2/projects/dash/#explore'], [2, .88, '/v2/projects/framework-raspberry-pi/']]) {
      await phase(page, value);
      poses.push({ index, phase: value, poster: await visiblePoster(page, index) });
      assert.equal(await page.locator('[data-assembly-explore]').getAttribute('href'), href, 'Project navigation remains available while CAD waits');
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    }
    await page.screenshot({ path: path.join(output, 'desktop-posters-before-three.png') });
    evidence.cases.push({ name: 'decoded posters and real project links before Three.js', initial, poses });
    await page.evaluate(() => scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' }));
    const offscreen = await stableCurrentFrames(page, 'Offscreen poster scene must stop requesting frames');
    await phase(page, 0); await page.emulateMedia({ reducedMotion: 'reduce' });
    const reduced = await stableCurrentFrames(page, 'Preference change must stop hero frames');
    await page.emulateMedia({ reducedMotion: 'no-preference' }); await phase(page, 0);
    three.release(); await gpuReady(page, 2);
    await phase(page, .88); const partial = await visiblePoster(page, 2);
    assert.notEqual(await page.locator('[data-assembly-posters] img').nth(2).getAttribute('data-assembly-model-state'), 'ready', 'Delayed Pi is not falsely marked painted');
    pi.release(); await gpuReady(page);
    assert.equal(await page.locator(root).getAttribute('data-assembly-models-settled'), '3');
    assert.equal(await page.locator(root).getAttribute('data-assembly-environment'), 'prepared');
    assert.equal(await page.locator('[data-assembly-posters] img').nth(2).evaluate(node => Number(getComputedStyle(node).opacity) < .05), true);
    const settled = await stableCurrentFrames(page, 'Completed hero must stop idle frame work');
    for (const dependency of ['/assets/vendor/three.min.js', '/assets/v2-hero-assets.js', '/assets/v2-hero-environment.js', '/assets/v2-hero-motion.js']) {
      assert.equal(requests.filter(url => url === dependency).length, 1, 'Deferred startup and controller share dependency: ' + dependency);
    }
    await page.screenshot({ path: path.join(output, 'desktop-complete.png') });
    evidence.cases.push({ name: 'finite frames, preference suspension and independent Pi handoff', offscreen, reduced, partial, settled });
  } catch (error) { await failureSnapshot(page, 'desktop-startup', error, { requests }); throw error; }
  finally { three.release(); pi.release(); await desktop.close(); }

  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: 'no-preference' });
  const phone = await mobile.newPage(), mobileThree = gate(); observeErrors(phone);
  await phone.route('**/three.min.js', async route => { await mobileThree.promise; await route.abort('failed'); });
  try {
    await phone.goto(base + '/v2/', { waitUntil: 'domcontentloaded' });
    await phone.waitForFunction(() => Number(document.querySelector('[data-assembly]')?.dataset.assemblyFrames) > 0);
    await phase(phone, .565); const pending = await visiblePoster(phone, 1);
    assert.equal(await phone.locator('[data-assembly-explore]').getAttribute('href'), '/v2/projects/dash/#explore');
    assert.equal(await phone.locator('.v2-hero-loading-canvas').count(), 0);
    const beforeScroll = await phone.evaluate(() => scrollY), session = await mobile.newCDPSession(phone);
    await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 350, y: 600 }] });
    await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 350, y: 400 }] });
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await phone.waitForFunction(value => scrollY > value + 50, beforeScroll);
    // Allow native momentum to stop before the next deliberate chapter seek.
    await phone.evaluate(() => new Promise(resolve => {
      let previous = scrollY, stableAt = performance.now();
      const check = now => { if (Math.abs(scrollY - previous) > .2) stableAt = now; previous = scrollY; if (now - stableAt > 220) resolve(); else requestAnimationFrame(check); };
      requestAnimationFrame(check);
    }));
    mobileThree.release(); await phone.waitForFunction(() => document.querySelector('[data-assembly]').dataset.assemblyState === 'unavailable');
    await phase(phone, .565); const failed = await visiblePoster(phone, 1);
    assert.equal(await phone.locator(root).evaluate(node => !node.classList.contains('is-loaded')), true);
    assert.equal(await phone.locator('[data-assembly-explore]').getAttribute('href'), '/v2/projects/dash/#explore');
    await phone.screenshot({ path: path.join(output, 'mobile-failed-fallback.png') });
    evidence.cases.push({ name: 'mobile native scrolling and decoded Dash fallback', pending, failed });
  } catch (error) { await failureSnapshot(phone, 'mobile-startup', error); throw error; }
  finally { mobileThree.release(); await mobile.close(); }

  const lighting = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'no-preference' });
  const fallback = await lighting.newPage(); observeErrors(fallback);
  try {
    await fallback.route(/\/models\/hero\/environment\.bin(?:\.gz)?(?:\?|$)/, route => route.abort('failed'));
    await fallback.goto(base + '/v2/', { waitUntil: 'domcontentloaded' });
    await gpuReady(fallback);
    assert.equal(await fallback.locator(root).getAttribute('data-assembly-environment'), 'generated');
    assert.equal(await fallback.locator('.v2-hero-loading-canvas').count(), 0);
    evidence.cases.push({ name: 'prepared-lighting failure recovers original lighting', ...await currentState(fallback) });
  } catch (error) { await failureSnapshot(fallback, 'lighting-fallback-startup', error); throw error; }
  finally { await lighting.close(); }
}

(async () => {
  fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_EXECUTABLE || undefined, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const evidence = { capturedAt: new Date().toISOString(), cases: [], errors: [] };
  const observeErrors = page => page.on('pageerror', error => evidence.errors.push(error.message));
  try {
    if (!process.argv.includes('--static-only')) {
    if (process.argv.includes('--legacy-loading-effect')) {
    const desktop = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'no-preference' });
    const page = await desktop.newPage();
    observeErrors(page);
    const three = gate(), pi = gate(), earlyStartup = gate();
    const requests = [];
    page.on('request', request => requests.push(new URL(request.url()).pathname));
    // The async preparation can arrive after the scene has already started.
    // Its shared promises must still avoid duplicate dependency downloads.
    await page.route(/\/v2-hero-startup\.js(?:\?|$)/, async route => { await earlyStartup.promise; await route.continue(); });
    await page.route('**/three.min.js', async route => { await three.promise; await route.continue(); });
    await page.route(/\/models\/hero\/pi(?:\.idx)?\.bin(?:\.gz)?(?:\?|$)/, async route => { await pi.promise; await route.continue(); });
    await page.route('**/framework-pi-board.glb', async route => { await pi.promise; await route.continue(); });
    try {
      await page.goto(base + '/v2/', { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => Number(document.querySelector('[data-assembly]')?.dataset.heroLoadingFrames) > 3, null, { timeout: 15000 });
      assert.equal(await page.evaluate(() => Boolean(window.THREE)), false, 'The interactive loading scene must appear before Three.js');
      if (!requests.includes('/assets/models/framework-pi/framework-pi-silk-front.svg')) {
        await page.waitForRequest(request => new URL(request.url()).pathname === '/assets/models/framework-pi/framework-pi-silk-front.svg', {timeout:15000});
      }
      assert.ok(requests.includes('/assets/models/framework-pi/framework-pi-silk-front.svg'), 'Support transport overlaps renderer loading after lead bytes are ready');
      earlyStartup.release();
      assert.equal(await page.locator('.v2-hero-loading').getAttribute('aria-hidden'), 'true', 'Decorative loading content must not be read as interface controls');
      assert.equal(await page.locator('.v2-hero-loading-canvas').evaluate(node => getComputedStyle(node).pointerEvents), 'none');
      await page.waitForFunction(() => {
        const canvas = document.querySelector('.v2-hero-loading-canvas');
        if (!canvas) return false;
        const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
        for (let i = 3; i < pixels.length; i += 4) if (pixels[i]) return true;
        return false;
      }, null, { timeout: 15000 });
      await page.screenshot({ path: path.join(output, 'desktop-before-three.png') });
      const initial = await loaderState(page);
      const point = await pointerPoint(page, 0);
      await page.mouse.move(point.x, point.y, { steps: 8 });
      await page.waitForFunction(value => Number(document.querySelector('[data-assembly]').dataset.heroLoadingInteractions) > value, initial.interactions);
      await page.waitForFunction(() => document.querySelector('[data-assembly]').dataset.heroLoadingLensActive === 'true');
      const moved = await loaderState(page);
      await page.mouse.click(point.x, point.y);
      await page.waitForFunction(value => Number(document.querySelector('[data-assembly]').dataset.heroLoadingPulses) > value, moved.pulses);
      await pause(160);
      await page.screenshot({ path: path.join(output, 'desktop-pointer-pulse.png') });
      evidence.cases.push({ name: 'interactive before Three.js', initial, afterInteraction: await loaderState(page) });
      await page.mouse.move(12, 150);
      await page.waitForFunction(() => document.querySelector('[data-assembly]').dataset.heroLoadingLensActive === 'false');

      const poses = [];
      for (const [index, value] of [[0, .265], [1, .565], [2, .88]]) {
        await phase(page, value);
        poses.push({ index, phase: value, ...await poseMatches(page, index) });
      }
      await page.screenshot({ path: path.join(output, 'desktop-pi-loading-pose.png') });
      // Navigation remains meaningful throughout loading: this is the real
      // project anchor, not a synthetic click handled by the canvas.
      const link = page.locator('[data-assembly-explore]');
      const href = await link.getAttribute('href');
      assert.equal(href, '/v2/projects/framework-raspberry-pi/');
      const intercepted = gate();
      await page.route('**/v2/projects/framework-raspberry-pi/', route => { intercepted.release(); return route.abort('aborted'); });
      await Promise.all([intercepted.promise, link.click({ noWaitAfter: true })]);
      await page.unroute('**/v2/projects/framework-raspberry-pi/');
      evidence.cases.push({ name: 'scroll poses and project navigation while loading', poses });

      await page.evaluate(() => scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' }));
      await page.waitForFunction(() => document.querySelector('[data-assembly]').dataset.heroLoadingState === 'paused');
      const offscreen = await stableFrames(page, 'Offscreen loading particles must stop requesting frames');
      await phase(page, 0);
      await page.waitForFunction(() => document.querySelector('[data-assembly]').dataset.heroLoadingState === 'active');
      await page.emulateMedia({ reducedMotion: 'reduce' });
      const reduced = await stableFrames(page, 'A motion preference change must stop loading animation immediately');
      assert.equal(await page.locator('.v2-hero-loading').evaluate(node => getComputedStyle(node).display), 'none');
      await page.emulateMedia({ reducedMotion: 'no-preference' });
      await page.waitForFunction(() => document.querySelector('[data-assembly]').dataset.heroLoadingState === 'active');
      evidence.cases.push({ name: 'offscreen and reduced-motion suspension', offscreen, reduced });

      three.release();
      await page.waitForFunction(() => document.querySelector('[data-assembly]').dataset.assemblyModelsReady === '2', null, { timeout: 60000 });
      await page.waitForFunction(() => {
        const nodes = [...document.querySelectorAll('[data-hero-loading-board]')];
        return nodes[0]?.dataset.state === 'ready' && nodes[1]?.dataset.state === 'ready' && nodes[2]?.dataset.state === 'pending';
      });
      await phase(page, .88);
      assert.equal(await canvasHasInk(page), true, 'A late supporting model must retain an interactive loading composition');
      await page.screenshot({ path: path.join(output, 'desktop-independent-pi-handoff.png') });
      const partial = await loaderState(page);
      pi.release();
      await page.waitForFunction(() => document.querySelector('[data-assembly]').dataset.assemblyModelsSettled === '3', null, { timeout: 60000 });
      await page.waitForFunction(() => document.querySelector('[data-assembly]').dataset.heroLoadingState === 'settled', null, { timeout: 15000 });
      const settled = await stableFrames(page, 'Completed model handoffs must stop loading animation');
      assert.equal(settled.modelsReady, 3);
      assert.equal(await page.locator(root).getAttribute('data-assembly-environment'), 'prepared', 'The normal path must use the identical prefiltered environment');
      assert.deepEqual(settled.boards, ['ready', 'ready', 'ready']);
      for (const dependency of ['/assets/vendor/three.min.js', '/assets/v2-hero-assets.js', '/assets/v2-hero-environment.js', '/assets/v2-hero-motion.js']) {
        assert.equal(requests.filter(url => url === dependency).length, 1, 'Late async startup must share the dependency request: ' + dependency);
      }
      assert.equal(await page.locator('[data-assembly-posters] img').nth(2).evaluate(node => Number(getComputedStyle(node).opacity) < .05), true);
      await page.screenshot({ path: path.join(output, 'desktop-complete.png') });
      evidence.cases.push({ name: 'independent model handoff and finite animation', partial, settled });
    } catch (error) {
      await failureSnapshot(page, 'desktop-startup', error, { requests, errors: evidence.errors }); throw error;
    } finally { three.release(); pi.release(); earlyStartup.release(); await desktop.close(); }

    const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true, reducedMotion: 'no-preference' });
    const phone = await mobile.newPage();
    observeErrors(phone);
    const mobileThree = gate();
    await phone.route('**/three.min.js', async route => { await mobileThree.promise; await route.abort('failed'); });
    try {
      await phone.goto(base + '/v2/', { waitUntil: 'domcontentloaded' });
      await phone.waitForFunction(() => Number(document.querySelector('[data-assembly]')?.dataset.heroLoadingFrames) > 3);
      await phase(phone, .565);
      const pose = await poseMatches(phone, 1);
      const beforeTap = await loaderState(phone), point = await pointerPoint(phone, 1);
      await phone.touchscreen.tap(point.x, point.y);
      await phone.waitForFunction(value => Number(document.querySelector('[data-assembly]').dataset.heroLoadingPulses) > value, beforeTap.pulses);
      await phone.waitForFunction(() => document.querySelector('[data-assembly]').dataset.heroLoadingLensActive === 'true');
      await phone.screenshot({ path: path.join(output, 'mobile-dash-touch.png') });
      const beforeScroll = await phone.evaluate(() => scrollY);
      const session = await mobile.newCDPSession(phone);
      await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 350, y: 600 }] });
      await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 350, y: 500 }] });
      await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 350, y: 400 }] });
      await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await phone.waitForFunction(value => scrollY > value + 50, beforeScroll);
      // Native touch scrolling may retain momentum after touchEnd. Wait for
      // the user's gesture to finish before seeking an exact test chapter.
      await phone.evaluate(() => new Promise(resolve => {
        let previous = scrollY, stableAt = performance.now();
        const check = now => {
          if (Math.abs(scrollY - previous) > .2) stableAt = now;
          previous = scrollY;
          if (now - stableAt > 220) resolve();
          else requestAnimationFrame(check);
        };
        requestAnimationFrame(check);
      }));
      mobileThree.release();
      await phone.waitForFunction(() => document.querySelector('[data-assembly]').dataset.assemblyState === 'unavailable');
      await phone.waitForFunction(() => document.querySelector('[data-assembly]').dataset.heroLoadingState === 'settled');
      const failed = await stableFrames(phone, 'A failed dependency must settle loading particles and retain static posters');
      assert.deepEqual(failed.boards, ['failed', 'failed', 'failed']);
      await phase(phone, .565);
      const poster = await visiblePoster(phone, 1);
      assert.ok(poster.decoded && poster.opacity > .95 && poster.visibility === 'visible', 'A failed renderer must retain a fully visible decoded dash poster');
      assert.equal(await phone.locator(root).evaluate(node => node.dataset.assemblyState === 'unavailable' && !node.classList.contains('is-loaded')), true);
      await phone.screenshot({ path: path.join(output, 'mobile-failed-fallback.png') });
      evidence.cases.push({ name: 'touch, native scrolling, mobile pose and failed dependency', pose, beforeTap, failed, poster });
    } catch (error) {
      await failureSnapshot(phone, 'mobile-startup', error, { errors: evidence.errors }); throw error;
    } finally { mobileThree.release(); await mobile.close(); }

    const lightingFallback = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'no-preference' });
    const fallback = await lightingFallback.newPage();
    observeErrors(fallback);
    try {
    await fallback.route(/\/models\/hero\/environment\.bin(?:\.gz)?(?:\?|$)/, route => route.abort('failed'));
    await fallback.goto(base + '/v2/', { waitUntil: 'domcontentloaded' });
    await fallback.waitForFunction(() => document.querySelector('[data-assembly]').dataset.assemblyModelsSettled === '3', null, { timeout: 90000 });
    assert.equal(await fallback.locator(root).getAttribute('data-assembly-environment'), 'generated');
    await gpuReady(fallback);
    assert.equal(await fallback.locator(root).getAttribute('data-assembly-models-ready'), '3', 'A failed lighting download must recover the original full-quality environment and all CAD');
    await fallback.waitForFunction(() => document.querySelector('[data-assembly]').dataset.heroLoadingState === 'settled');
    evidence.cases.push({ name: 'prepared-lighting failure recovers original lighting', ...await loaderState(fallback) });
    } catch (error) {
      await failureSnapshot(fallback, 'lighting-fallback-startup', error, { errors: evidence.errors }); throw error;
    } finally { await lightingFallback.close(); }
    } else { await currentStartup(browser, evidence, observeErrors); }
    }

    for (const mode of ['reduced-motion', 'save-data', 'no-js']) {
      const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: mode === 'reduced-motion' ? 'reduce' : 'no-preference', javaScriptEnabled: mode !== 'no-js' });
      const page = await context.newPage();
      observeErrors(page);
      const heavy = [];
      page.on('request', request => { if (/three\.min\.js|\/models\/hero\/|v2-hero-loading\.js/.test(request.url())) heavy.push(request.url()); });
      try {
      if (mode === 'save-data') await page.addInitScript(() => Object.defineProperty(navigator, 'connection', { configurable: true, value: { saveData: true } }));
      await page.goto(base + '/v2/', { waitUntil: 'networkidle' });
      assert.equal(await page.locator('[data-assembly-posters] img').evaluateAll(nodes => nodes.every(node => node.naturalWidth > 0 && getComputedStyle(node).visibility === 'visible' && getComputedStyle(node).opacity === '1')), true, `${mode} must retain all original project posters`);
      assert.equal(heavy.some(url => /three\.min\.js|\/models\/hero\//.test(url)), false, `${mode} must not download 3D assets`);
      if (mode !== 'no-js') {
        const state = process.argv.includes('--legacy-loading-effect')
          ? await stableFrames(page, `${mode} must not animate historical loading particles`)
          : await stableCurrentFrames(page, `${mode} must not animate hero frames`);
        assert.equal(state.frames, 0);
      }
      if (!process.argv.includes('--legacy-loading-effect')) assert.equal(await page.locator('.v2-hero-loading-canvas').count(), 0);
      await page.screenshot({ path: path.join(output, mode + '.png') });
      for (const viewport of [{width:320,height:740},{width:600,height:670}]) {
        await page.setViewportSize(viewport);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `${mode} must fit at ${viewport.width}px`);
        const title = await page.locator('#hero-title').boundingBox();
        assert.ok(title.x >= 0 && title.x + title.width <= viewport.width, `${mode} masthead must fit at ${viewport.width}px`);
        await page.screenshot({ path: path.join(output, `${mode}-${viewport.width}.png`) });
      }
      evidence.cases.push({ name: mode, heavyRequests: heavy });
      } catch (error) {
        await failureSnapshot(page, mode + '-startup', error, { heavyRequests: heavy, errors: evidence.errors }); throw error;
      } finally { await context.close(); }
    }
    assert.deepEqual(evidence.errors, [], 'Hero startup must not emit uncaught JavaScript errors');
    fs.writeFileSync(path.join(output, 'acceptance.json'), JSON.stringify(evidence, null, 2) + '\n');
    console.log(JSON.stringify({ result: 'PASS', cases: evidence.cases.map(item => item.name), evidence: path.join(output, 'acceptance.json') }, null, 2));
  } catch (error) {
    fs.writeFileSync(path.join(output, 'acceptance-failure.json'), JSON.stringify({ ...evidence, error: error.stack || String(error) }, null, 2) + '\n');
    throw error;
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
