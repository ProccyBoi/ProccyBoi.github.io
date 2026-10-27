/* Character interaction and case-study acceptance checks for both Dash routes.
 * The current full-device viewer is covered by verify-dash-device.cjs; the
 * archived PCB animation is covered by verify-dash-assembly.cjs.
 * Requires Playwright and a running static preview. Optional environment:
 * DASH_BASE_URL, CHROMIUM_EXECUTABLE, DASH_SCREENSHOTS. */
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require('playwright');
const base = process.env.DASH_BASE_URL || 'http://127.0.0.1:8765';
const screenshotDir = process.env.DASH_SCREENSHOTS;
const routes = ['/projects/dash/', '/v2/projects/dash/'];

(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.CHROMIUM_EXECUTABLE || undefined
  });
  const errors = [];
  const observe = page => page.on('pageerror', error => errors.push(error.message));
  const assertFiniteMotion = async (locator, animationName, message) => {
    const motion = await locator.evaluate(node => ({
      name: getComputedStyle(node).animationName,
      animations: node.getAnimations().map(animation => ({
        state: animation.playState,
        duration: animation.effect.getTiming().duration,
        iterations: animation.effect.getTiming().iterations
      }))
    }));
    assert.equal(motion.name, animationName, `${message}: the CSS animation is applied`);
    assert.ok(motion.animations.some(animation => animation.state === 'running' && animation.duration > 0 && animation.iterations === 1), `${message}: a finite animation actually begins`);
  };
  try {
    if (screenshotDir) await fs.mkdir(screenshotDir, { recursive: true });
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const page = await context.newPage();
    observe(page);
    await page.clock.install();

    for (const route of routes) {
      await page.goto(base + route, { waitUntil: 'networkidle' });
      const demo = page.locator('[data-dash-demo]');
      await page.locator('#character').scrollIntoViewIfNeeded();
      await demo.locator('[data-dash-controls]').waitFor({ state: 'visible' });
      const action = demo.locator('[data-dash-action]');
      const reset = demo.getByRole('button', { name: 'Reset', exact: true });
      const duration = demo.getByLabel('Session length', { exact: true });
      const clock = demo.getByRole('timer', { name: 'Time remaining' });
      assert.equal(await demo.locator('[data-dash-controls]').isVisible(), true, 'Interactive controls initialize');
      assert.equal(await demo.locator('[data-dash-fallback]').isVisible(), false);
      assert.equal(await clock.textContent(), '00:10', 'Default is a short demonstration');
      assert.equal(await reset.isDisabled(), true);

      for (const width of [1440, 768, 390, 320]) {
        await page.setViewportSize({ width, height: 1000 });
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `${route} overflows at ${width}px`);
        assert.equal(await action.isVisible(), true, `Start button is available at ${width}px`);
        const clipped = await action.evaluate(node => {
          const bounds = node.getBoundingClientRect();
          return bounds.left < 0 || bounds.right > innerWidth;
        });
        assert.equal(clipped, false, `Start button is clipped at ${width}px`);
      }
      console.log(`PASS ${route}: 1440, 768, 390 and 320px reflow`);

      await page.setViewportSize({ width: 1440, height: 1000 });
      for (const image of await page.locator('.project-gallery img[data-zoomable]').all()) {
        await image.scrollIntoViewIfNeeded();
        await image.evaluate(node => node.decode());
        assert.equal(await image.evaluate(node => node.complete && node.naturalWidth > 0), true, 'Prototype photograph loads');
      }
      await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
      if (screenshotDir) {
        await page.screenshot({ path: path.join(screenshotDir, route.startsWith('/v2') ? 'dash-v2-desktop.png' : 'dash-desktop.png') });
        await page.setViewportSize({ width: 390, height: 844 });
        await page.screenshot({ path: path.join(screenshotDir, route.startsWith('/v2') ? 'dash-v2-mobile.png' : 'dash-mobile.png'), fullPage: true });
        await page.setViewportSize({ width: 1440, height: 1000 });
      }

      // Keyboard activation exercises the same controls a pointer user sees.
      await action.focus();
      await page.keyboard.press('Enter');
      assert.equal(await action.textContent(), 'Pause');
      assert.equal(await duration.isDisabled(), true, 'A running session cannot change duration');
      await page.clock.fastForward(3100);
      assert.match(await clock.textContent(), /^00:0[67]$/, 'The countdown advances from its deadline');
      await action.click();
      assert.equal(await action.textContent(), 'Resume');
      const pausedTime = await clock.textContent();
      await page.clock.fastForward(5000);
      assert.equal(await clock.textContent(), pausedTime, 'Pause preserves remaining time');
      assert.equal(await duration.isDisabled(), true);
      await action.click();
      assert.equal(await action.textContent(), 'Pause');
      await page.clock.fastForward(8000);
      assert.equal(await action.textContent(), 'Start again');
      assert.equal(await clock.textContent(), '00:00');
      assert.equal(await duration.isDisabled(), false);
      assert.match(await demo.locator('[data-dash-live]').textContent(), /Session complete/);
      assert.equal(await demo.getAttribute('data-dash-motion'), 'complete', 'Completion triggers the cheerful expression');
      await assertFiniteMotion(demo.locator('.dash-demo__face'), 'dash-celebrate', 'Completion bounce');
      await page.clock.fastForward(1800);
      assert.equal(await demo.getAttribute('data-dash-motion'), null, 'Completion motion settles without an idle loop');
      await action.click();
      assert.equal(await action.textContent(), 'Pause');
      await reset.click();
      assert.equal(await action.textContent(), 'Start focus');
      assert.equal(await clock.textContent(), '00:10');
      await page.clock.fastForward(20000);
      assert.equal(await clock.textContent(), '00:10', 'Reset clears a running countdown');
      console.log(`PASS ${route}: keyboard start, pause, resume, completion, restart and reset`);

      for (const [value, display] of [['1500', '25:00'], ['2700', '45:00'], ['3600', '60:00'], ['10', '00:10']]) {
        await duration.selectOption(value);
        assert.equal(await clock.textContent(), display, 'Duration selection updates the timer');
      }
      for (const [gesture, feedback] of [['tap', /quick blink/], ['shake', /dizzy wobble/]]) {
        const button = demo.locator(`[data-dash-gesture="${gesture}"]`);
        await button.focus();
        await page.keyboard.press('Space');
        assert.match(await demo.locator('[data-dash-feedback]').textContent(), feedback);
        assert.equal(await demo.getAttribute('data-dash-reaction'), gesture);
        assert.equal(await clock.textContent(), '00:10', 'A gesture does not change session time');
        await assertFiniteMotion(demo.locator('.dash-demo__eye').first(), gesture === 'tap' ? 'dash-blink' : 'dash-dizzy', `${gesture} eye reaction`);
        if (gesture === 'shake') {
          await assertFiniteMotion(demo.locator('.dash-demo__stage'), 'dash-stage-shake', 'Shake display response');
        }
        await page.clock.fastForward(1800);
        assert.equal(await demo.getAttribute('data-dash-reaction'), null, 'The finite reaction returns to the session expression');
        assert.equal(await demo.locator('.dash-demo__eye').first().evaluate(node => getComputedStyle(node).animationName), 'none', 'Eyes stop animating after the reaction');
      }
      console.log(`PASS ${route}: durations, keyboard gestures and finite reactions`);
    }
    await context.close();

    // Native scrolling needs the ordinary browser clock, separate from the
    // accelerated timer checks above.
    const navigation = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const navigationPage = await navigation.newPage();
    observe(navigationPage);
    for (const route of routes) {
      await navigationPage.goto(base + route + '#character', { waitUntil: 'networkidle' });
      await navigationPage.waitForFunction(() => location.hash === '#character' && document.getElementById('character').getBoundingClientRect().top >= 0 && document.getElementById('character').getBoundingClientRect().top < innerHeight);
      const character = navigationPage.locator('[data-dash-demo]');
      await character.scrollIntoViewIfNeeded();
      await navigationPage.waitForFunction(() => !document.querySelector('[data-dash-demo]').hasAttribute('data-dash-motion'));
      const stage = character.locator('.dash-demo__stage');
      const face = character.locator('.dash-demo__face');
      const stageBounds = await stage.boundingBox();
      assert.ok(stageBounds, 'Character display is visible for pointer interaction');
      await stage.hover({ position: { x: stageBounds.width * .85, y: stageBounds.height * .25 } });
      const gaze = await face.evaluate(node => ({
        x: parseFloat(node.style.getPropertyValue('--dash-gaze-x')),
        y: parseFloat(node.style.getPropertyValue('--dash-gaze-y'))
      }));
      assert.ok(gaze.x > 0 && gaze.x <= 10 && gaze.y < 0 && gaze.y >= -6, 'Mouse gaze responds within its bounded offsets');
      await character.locator('[data-dash-duration]').hover();
      assert.deepEqual(await face.evaluate(node => ({
        x: node.style.getPropertyValue('--dash-gaze-x'),
        y: node.style.getPropertyValue('--dash-gaze-y')
      })), { x: '0px', y: '0px' }, 'Gaze returns to center when the pointer leaves');
      // The archived PCB has a stable deep link on both versions. Gallery
      // placement differs between the original page and generated v2 route.
      await navigationPage.goto('about:blank');
      await navigationPage.goto(base + route + '#prototype', { waitUntil: 'networkidle' });
      assert.equal(new URL(navigationPage.url()).hash, '#prototype');
      await navigationPage.waitForFunction(() => document.getElementById('prototype').getBoundingClientRect().top >= 0 && document.getElementById('prototype').getBoundingClientRect().top < innerHeight);
      const images = navigationPage.locator('.project-gallery img[data-zoomable]');
      await images.first().scrollIntoViewIfNeeded();
      await images.first().focus();
      await navigationPage.keyboard.press('Enter');
      const lightbox = navigationPage.getByRole('dialog', { name: 'Project image viewer' });
      assert.equal(await lightbox.isVisible(), true, 'Prototype photo opens from the keyboard');
      assert.equal(await lightbox.locator('[data-lightbox-caption]').textContent(), await images.first().getAttribute('data-caption'));
      await lightbox.getByRole('button', { name: 'Next image', exact: true }).click();
      await lightbox.locator('[data-lightbox-image]').evaluate(node => node.decode());
      assert.equal(await lightbox.locator('[data-lightbox-caption]').textContent(), await images.nth(1).getAttribute('data-caption'));
      await lightbox.getByRole('button', { name: 'Close', exact: true }).click();
      assert.equal(await lightbox.isVisible(), false);
      await navigationPage.waitForFunction(() => document.activeElement === document.querySelector('.project-gallery img[data-zoomable]'));
      console.log(`PASS ${route}: character/prototype anchors, bounded pointer gaze, loaded gallery, keyboard lightbox, next image, close and focus restoration`);
    }
    await navigation.close();

    const noJS = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 390, height: 844 } });
    const staticPage = await noJS.newPage();
    observe(staticPage);
    for (const route of routes) {
      await staticPage.goto(base + route, { waitUntil: 'networkidle' });
      assert.equal(await staticPage.locator('h1').isVisible(), true);
      assert.equal(await staticPage.locator('[data-dash-fallback]').isVisible(), true);
      assert.equal(await staticPage.locator('[data-dash-controls]').isVisible(), false);
      assert.equal(await staticPage.getByRole('heading', { name: 'From the car to the desk', exact: true }).isVisible(), true);
      assert.equal(await staticPage.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      assert.ok(await staticPage.locator('a[href="https://github.com/JPhusion/dash"]').count() > 0);
    }
    await noJS.close();
    console.log('PASS both routes: no-JavaScript content, fallback, source link and mobile layout');

    const reduced = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 390, height: 844 } });
    const reducedPage = await reduced.newPage();
    observe(reducedPage);
    for (const route of routes) {
      await reducedPage.goto(base + route, { waitUntil: 'networkidle' });
      await reducedPage.locator('[data-dash-gesture="shake"]').click();
      const motion = await reducedPage.locator('.dash-demo__eye').first().evaluate(node => {
        const css = getComputedStyle(node);
        return { animation: css.animationName, transition: css.transitionDuration };
      });
      assert.equal(motion.animation, 'none');
      assert.equal(motion.transition, '0s');
      assert.match(await reducedPage.locator('[data-dash-feedback]').textContent(), /dizzy wobble/);

      // A preference change must stop a sequence that is already in progress,
      // not merely disable sequences after the next page load.
      await reducedPage.emulateMedia({ reducedMotion: 'no-preference' });
      await reducedPage.waitForFunction(() => !matchMedia('(prefers-reduced-motion: reduce)').matches && !document.querySelector('[data-dash-demo]').hasAttribute('data-dash-reaction'));
      await reducedPage.locator('[data-dash-gesture="shake"]').click();
      await assertFiniteMotion(reducedPage.locator('.dash-demo__eye').first(), 'dash-dizzy', 'Motion before a live preference change');
      await reducedPage.emulateMedia({ reducedMotion: 'reduce' });
      await reducedPage.waitForFunction(() => {
        const demo = document.querySelector('[data-dash-demo]');
        return !demo.hasAttribute('data-dash-reaction') && !demo.hasAttribute('data-dash-motion');
      });
      assert.equal(await reducedPage.locator('.dash-demo__stage').evaluate(node => getComputedStyle(node).animationName), 'none', 'Live reduced-motion preference stops display movement');
      assert.equal(await reducedPage.locator('.dash-demo__eye').first().evaluate(node => getComputedStyle(node).animationName), 'none', 'Live reduced-motion preference stops eye movement');
      assert.deepEqual(await reducedPage.locator('.dash-demo__face').evaluate(node => ({
        x: node.style.getPropertyValue('--dash-gaze-x'),
        y: node.style.getPropertyValue('--dash-gaze-y')
      })), { x: '0px', y: '0px' }, 'Reduced motion also centers the gaze');
    }
    await reduced.close();
    console.log('PASS both routes: initial and live reduced-motion preferences stop animation while retaining feedback');
    assert.deepEqual(errors, [], 'No browser JavaScript errors');
    console.log('PASS no browser JavaScript errors');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
