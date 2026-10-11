/* Focused booking acceptance checks. No live calendar requests or bookings.
 * node scripts/verify-v2-booking.cjs --static-only
 * With Playwright + a root preview: node scripts/verify-v2-booking.cjs
 * Use --webkit for the same checks in WebKit.
 * Optional: V2_BASE_URL, CHROMIUM_EXECUTABLE, V2_BOOKING_OUT (V2_SCREENSHOTS alias). */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'book/index.html'), 'utf8');
const html = fs.readFileSync(path.join(root, 'v2/book/index.html'), 'utf8');
const skin = fs.readFileSync(path.join(root, 'assets/v2-booking.css'), 'utf8');
const bridge = fs.readFileSync(path.join(root, 'assets/v2-booking.js'), 'utf8');
const endpoint = source.match(/data-booking-endpoint="([^"]+)"/)[1];

function staticChecks() {
  assert.equal(html.match(/data-booking-endpoint="([^"]+)"/)[1], endpoint);
  for (const asset of ['site.css', 'booking.css', 'v2.css', 'v2-booking.css', 'site.js', 'booking.js', 'v2.js', 'v2-booking.js']) {
    assert.ok(html.includes(`assets/${asset}`), `${asset} must be reused or linked`);
  }
  assert.match(html, /<body class="v2 v2-book">/);
  assert.match(html, /rel="canonical" href="https:\/\/proccyboi.github.io\/v2\/book\/"/);
  assert.match(html, /href="\/v2\/book\/#main"/);
  assert.match(html, /<main id="main"[^>]*tabindex="-1"/);
  assert.match(html, /<noscript>[\s\S]*live calendar needs JavaScript[\s\S]*<\/noscript>/);
  assert.match(html, /mailto:andrew.noah.chung@gmail.com\?subject=Meeting%20with%20Andrew/);
  const choices = text => [...text.matchAll(/name="(duration|format)-choice" value="([^"]+)"/g)].map(match => match.slice(1));
  assert.deepEqual(choices(html), choices(source), 'All existing durations and formats must remain');
  const hooks = text => [...text.matchAll(/\s(data-(?:booking|week|selection|form|duration|format|book-another)[\w-]*)[\s=>]/g)].map(match => match[1]).sort();
  assert.deepEqual(hooks(html), hooks(source), 'Keep the shared controller DOM contract');
  for (const field of ['name', 'email', 'topic', 'website', 'start', 'duration', 'format', 'time_zone', 'token', 'return_origin']) {
    assert.match(html, new RegExp(`name="${field}"`));
  }
  assert.match(html, /method="post" target="booking-response"/);
  assert.match(html, /data-booking-form-error role="alert"/);
  assert.match(html, /data-booking-days tabindex="0" role="region"/);
  assert.match(skin, /body\.v2-book/);
  assert.doesNotMatch(skin, /@import/);

  // The v2-only bridge is independently testable without a browser; this is
  // deliberately not presented as layout or shared-calendar validation.
  const form = { attributes: {}, setAttribute(key, value) { this.attributes[key] = value; }, addEventListener(type, handler, capture) { assert.equal(capture, true); this[type] = handler; } };
  const submit = { disabled: false };
  const success = { hidden: true };
  const weekNavigation = { hidden: true };
  const days = { hidden: false, scrollWidth: 900, clientWidth: 300 };
  const scrollHint = { hidden: true };
  const settings = [{ disabled: false }, { disabled: false }];
  const nodes = { '[data-booking-form]': form, '[data-booking-submit]': submit, '[data-booking-success]': success, '.booking-week-nav': weekNavigation, '[data-booking-days]': days, '[data-v2-booking-scroll-hint]': scrollHint };
  let sync;
  vm.runInNewContext(bridge, {
    document: { querySelector: () => ({ querySelector: selector => nodes[selector], querySelectorAll: () => settings }) },
    MutationObserver: class { constructor(callback) { sync = callback; } observe() {} },
    ResizeObserver: class { observe() {} },
    matchMedia: () => ({ matches: true }),
  });
  assert.equal(scrollHint.hidden, false, 'Show the mobile hint when available days overflow');
  days.hidden = true; sync();
  assert.equal(scrollHint.hidden, true, 'Hide the hint during loading, error and confirmation');
  days.hidden = false; days.scrollWidth = 300; sync();
  assert.equal(scrollHint.hidden, true, 'Hide the hint when all days fit');
  assert.equal(weekNavigation.hidden, false);
  success.hidden = false; sync();
  assert.equal(weekNavigation.hidden, true);
  success.hidden = true; sync();
  assert.equal(weekNavigation.hidden, false, 'A new duration after success restores week navigation');
  submit.disabled = true; sync();
  assert.ok(settings.every(group => group.disabled));
  assert.equal(days.inert, true);
  assert.equal(weekNavigation.inert, true);
  let prevented = false, stopped = false;
  form.submit({ preventDefault() { prevented = true; }, stopImmediatePropagation() { stopped = true; } });
  assert.ok(prevented && stopped, 'Block repeated submissions before the shared handler');
  submit.disabled = false; sync();
  assert.ok(settings.every(group => !group.disabled));
  assert.equal(days.inert, false);
  assert.equal(form.attributes['aria-busy'], 'false');
  form.submit({ preventDefault() { assert.fail('Fresh submission should proceed'); } });
  console.log('PASS: v2 booking static contract and repeated-flow bridge unit checks.');
}

function availability(url) {
  const duration = Number(url.searchParams.get('duration'));
  const monday = new Date(`${url.searchParams.get('start')}T00:00:00Z`);
  return {
    ok: true,
    token: `mock-token-${duration}`,
    days: Array.from({ length: 5 }, (_, index) => {
      const day = new Date(monday); day.setUTCDate(day.getUTCDate() + index);
      return {
        anchor: day.toISOString(),
        slots: [0, 3].map(hour => {
          const start = new Date(day); start.setUTCHours(hour);
          return { start: start.toISOString(), end: new Date(start.getTime() + duration * 60000).toISOString() };
        }),
      };
    }),
  };
}

async function mockNetwork(context, base) {
  const state = { mode: 'ready', requests: [], submissions: [], holdSubmission: false, releaseSubmission: null, holdDuration: null, releaseAvailability: null, response: { ok: true } };
  // This catch-all is installed before navigation. No request to any external
  // origin can escape the mock, even if an endpoint changes unexpectedly.
  await context.route('**/*', async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin === new URL(base).origin) {
      if (!['GET', 'HEAD'].includes(request.method())) return route.abort();
      return route.continue();
    }
    if (url.origin + url.pathname !== endpoint) return route.abort();
    if (request.method() === 'POST') {
      state.submissions.push(Object.fromEntries(new URLSearchParams(request.postData())));
      if (state.holdSubmission) await new Promise(resolve => { state.releaseSubmission = resolve; });
      return route.fulfill({ contentType: 'text/html', body: `<!doctype html><script>parent.postMessage(${JSON.stringify({ source: 'andrew-booking', ...state.response })}, '*');<\/script>` });
    }
    assert.equal(url.searchParams.get('action'), 'availability');
    const callback = url.searchParams.get('callback');
    assert.match(callback, /^andrewBookingAvailability\d+$/);
    state.requests.push(url.href);
    if (state.holdDuration === url.searchParams.get('duration')) await new Promise(resolve => { state.releaseAvailability = resolve; });
    if (state.mode === 'error') return route.abort('failed');
    const payload = availability(url);
    if (state.mode === 'empty') payload.days.forEach(day => { day.slots = []; });
    return route.fulfill({ contentType: 'text/javascript', body: `${callback}(${JSON.stringify(payload)});` });
  });
  return state;
}

async function selectDuration(page, duration) {
  const input = page.locator(`input[name="duration-choice"][value="${duration}"]`);
  await input.focus();
  await page.keyboard.press('Space');
  await page.waitForFunction(value => document.querySelector('[data-booking-card-title]').textContent.includes(`${value}-minute`) && !document.querySelector('[data-booking-days]').hidden, duration);
}

async function overflowCheck(page) {
  const sizes = await page.evaluate(() => ({ content: document.documentElement.scrollWidth, viewport: innerWidth }));
  assert.ok(sizes.content <= sizes.viewport + 1, `Page overflow: ${JSON.stringify(sizes)}`);
}

async function waitForMock(condition, message) {
  const deadline = Date.now() + 10000;
  while (!condition() && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 20));
  assert.ok(condition(), message);
}

async function browserChecks() {
  const playwright = require('playwright');
  const engine = process.argv.includes('--webkit') ? 'webkit' : 'chromium';
  const base = process.env.V2_BASE_URL || 'http://127.0.0.1:8080';
  const output = process.env.V2_BOOKING_OUT || process.env.V2_SCREENSHOTS;
  const screenshotPositions = {};
  if (output) fs.mkdirSync(output, { recursive: true });
  const screenshot = async (page, name) => {
    if (!output) return;
    // Keyboard and scroll assertions run separately. Capture clean review
    // frames from the top so fixed/sticky UI does not land mid-page in a
    // full-page image, and the calendar starts at its first day.
    // addStyleTag waits for an onload callback and has no default timeout.
    // Disabled page JavaScript can suppress that callback, so keep fallback
    // capture preparation synchronous in Playwright's isolated evaluation.
    await page.evaluate(() => {
      const style = document.createElement('style');
      style.id = 'booking-test-capture';
      style.textContent = 'html, body, [data-booking-days] { scroll-behavior: auto !important; } [data-booking-days] { scroll-snap-type: none !important; }';
      document.head.append(style);
    });
    try {
      await page.evaluate(() => {
        document.activeElement?.blur();
        document.querySelector('[data-booking-days]')?.scrollTo({ left: 0, top: 0, behavior: 'instant' });
        window.scrollTo({ left: 0, top: 0, behavior: 'instant' });
      });
      // Chromium can suppress page RAF callbacks when JavaScript is disabled.
      // Browser screenshot paint synchronization also works for that fallback.
      // Native focus/scroll work may land after the first reset in Chromium.
      // Settle for a bounded interval, then cancel it with one final reset.
      await page.waitForTimeout(180);
      screenshotPositions[name] = await page.evaluate(() => {
        window.scrollTo({ left: 0, top: 0, behavior: 'instant' });
        return { scrollY, headerTop: document.querySelector('.v2-header').getBoundingClientRect().top };
      });
      await page.screenshot({ path: path.join(output, `${engine}-${name}.png`), fullPage: true, animations: 'disabled', caret: 'hide', timeout: 30000 });
    } finally {
      await page.evaluate(() => document.getElementById('booking-test-capture')?.remove());
    }
  };
  const browser = await playwright[engine].launch({ headless: true, ...(engine === 'chromium' && process.env.CHROMIUM_EXECUTABLE ? { executablePath: process.env.CHROMIUM_EXECUTABLE } : {}) });
  const errors = [];
  const observe = page => page.on('pageerror', error => errors.push(error.message));
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, timezoneId: 'Australia/Sydney' });
    const state = await mockNetwork(context, base);
    const page = await context.newPage(); observe(page);
    await page.goto(`${base}/v2/book/`);
    await page.locator('[data-slot]').first().waitFor();
    assert.match(await page.locator('[data-sydney-time]').textContent(), /\d/);
    assert.match(await page.locator('[data-visitor-time-zone]').textContent(), /Sydney time/);
    assert.equal(await page.locator('.v2-nav a[aria-current="page"]').getAttribute('href'), '/v2/book/');
    assert.equal(await page.locator('[data-week-previous]').isDisabled(), true);
    assert.equal(await page.locator('body').evaluate(node => getComputedStyle(node).backgroundColor), 'rgb(20, 20, 18)');

    // Native radio keyboard operation, each duration, format and selection.
    for (const duration of [15, 30, 45, 60]) {
      await selectDuration(page, duration);
      await page.locator('[data-slot]').first().focus();
      await page.keyboard.press('Enter');
      assert.equal(await page.locator('[data-form-duration]').inputValue(), String(duration));
      assert.equal(await page.locator('[data-form-token]').inputValue(), `mock-token-${duration}`);
    }
    await page.locator('[name="format-choice"][value="in-person"]').focus();
    await page.keyboard.press('Space');
    assert.equal(await page.locator('[data-form-format]').inputValue(), 'in-person');
    assert.match(await page.locator('[data-selection-meta]').textContent(), /60 minutes · In person/);
    assert.equal(await page.locator('[data-form-time-zone]').inputValue(), 'Australia/Sydney');
    await screenshot(page, 'booking-form');

    const firstWeek = await page.locator('[data-week-label]').textContent();
    for (let index = 0; index < 8; index++) {
      await page.locator('[data-week-next]').click();
      await page.locator('[data-booking-days]').waitFor({ state: 'visible' });
    }
    assert.equal(await page.locator('[data-week-next]').isDisabled(), true);
    for (let index = 0; index < 8; index++) {
      await page.locator('[data-week-previous]').click();
      await page.locator('[data-booking-days]').waitFor({ state: 'visible' });
    }
    assert.equal(await page.locator('[data-week-label]').textContent(), firstWeek);
    assert.equal(await page.locator('[data-booking-details]').isVisible(), false);

    // A slow superseded request must not replace a newer duration's results.
    state.holdDuration = '45';
    await page.locator('[name="duration-choice"][value="45"]').focus();
    await page.keyboard.press('Space');
    await page.waitForFunction(() => document.querySelector('[data-booking-card-title]').textContent.includes('45-minute'));
    await waitForMock(() => state.releaseAvailability, 'Held availability must reach the mock');
    await selectDuration(page, 30);
    state.releaseAvailability(); state.holdDuration = null;
    await page.waitForFunction(() => ![...document.querySelectorAll('script[src]')].some(script => new URL(script.src).searchParams.get('duration') === '45'));
    await page.locator('[data-slot]').first().click();
    assert.equal(await page.locator('[data-form-token]').inputValue(), 'mock-token-30');

    // Hold the intercepted POST to verify pending controls and repeated Enter.
    await page.locator('#booking-name').fill('Booking Test');
    await page.locator('#booking-email').fill('booking-test@example.invalid');
    await page.locator('#booking-topic').fill('Mock acceptance test only');
    state.holdSubmission = true;
    await page.locator('[data-booking-submit]').click();
    await page.waitForFunction(() => document.querySelector('[data-booking-form]').getAttribute('aria-busy') === 'true');
    assert.notEqual(await page.locator('[data-duration-group]').getAttribute('disabled'), null);
    await page.locator('[data-booking-form]').evaluate(form => form.requestSubmit());
    await waitForMock(() => state.releaseSubmission, 'Mock POST must arrive before checking its payload');
    assert.equal(state.submissions.length, 1, 'Exactly one mocked POST');
    assert.equal(state.submissions[0].email, 'booking-test@example.invalid');
    assert.equal(state.submissions[0].duration, '30');
    assert.equal(state.submissions[0].format, 'in-person');
    assert.equal(state.submissions[0].return_origin, new URL(base).origin);
    state.releaseSubmission(); state.holdSubmission = false;
    await page.locator('[data-booking-success]').waitFor({ state: 'visible' });
    assert.match(await page.locator('[data-booking-success-copy]').textContent(), /booking-test@example.invalid/);
    await screenshot(page, 'booking-confirmed');

    // Changing duration directly after confirmation must restore the week nav.
    await selectDuration(page, 60);
    assert.equal(await page.locator('.booking-week-nav').isVisible(), true);
    await page.locator('[data-slot]').first().click();
    state.response = { ok: false, message: 'Mock slot conflict. Choose another time.' };
    await page.locator('[data-booking-submit]').click();
    await page.locator('[data-booking-form-error]').waitFor({ state: 'visible' });
    assert.match(await page.locator('[data-booking-form-error]').textContent(), /Mock slot conflict/);
    assert.equal(await page.locator('[data-booking-submit]').isEnabled(), true);
    state.response = { ok: true };
    await page.locator('[data-booking-submit]').click();
    await page.locator('[data-booking-success]').waitFor({ state: 'visible' });
    await page.locator('[data-book-another]').click();
    await page.locator('[data-slot]').first().waitFor();
    assert.equal(await page.locator('#booking-name').inputValue(), '');
    assert.equal(await page.locator('[name="duration-choice"][value="15"]').isChecked(), true);
    assert.equal(await page.locator('[name="format-choice"][value="online"]').isChecked(), true);
    assert.equal(await page.locator('.booking-week-nav').isVisible(), true);

    // Responsive layout and keyboard scrolling remain inside the calendar.
    for (const width of [1440, 768, 390, 320]) {
      await page.setViewportSize({ width, height: 900 });
      await overflowCheck(page);
      await page.locator('[data-v2-booking-scroll-hint]').waitFor({ state: width <= 720 ? 'visible' : 'hidden' });
      await page.locator('[data-booking-days]').focus();
      await page.keyboard.press('ArrowRight');
      assert.equal(await page.locator('[data-booking-days]').evaluate(node => node === document.activeElement), true);
      await screenshot(page, `booking-${width}`);
    }
    await page.locator('[data-v2-menu]').focus(); await page.keyboard.press('Enter');
    assert.equal(await page.locator('[data-v2-menu]').getAttribute('aria-expanded'), 'true');
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('[data-v2-menu]').getAttribute('aria-expanded'), 'false');
    await page.locator('.v2-skip').focus(); await page.keyboard.press('Enter');
    assert.equal(new URL(page.url()).hash, '#main');

    state.mode = 'error';
    await page.reload();
    await page.waitForFunction(() => document.querySelector('[data-booking-status]').textContent.includes('could not be reached'));
    assert.equal(await page.getByRole('link', { name: 'Email Andrew' }).isVisible(), true);
    assert.equal(await page.locator('[data-booking-days]').isVisible(), false);
    assert.equal(await page.locator('[data-v2-booking-scroll-hint]').isVisible(), false);
    await screenshot(page, 'booking-error-mobile');
    state.mode = 'empty';
    await page.locator('[data-week-next]').click();
    await page.locator('.booking-day-empty').first().waitFor();
    assert.equal(await page.locator('.booking-day-empty').count(), 5);
    await overflowCheck(page);
    await context.close();

    // A non-Sydney visitor uses their own timezone, including the form value.
    const reduced = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce', timezoneId: 'America/Los_Angeles' });
    await mockNetwork(reduced, base);
    const reducedPage = await reduced.newPage(); observe(reducedPage);
    await reducedPage.goto(`${base}/v2/book/`);
    await reducedPage.locator('[data-slot]').first().waitFor();
    assert.match(await reducedPage.locator('[data-visitor-time-zone]').textContent(), /America \/ Los Angeles/);
    await reducedPage.locator('[data-slot]').first().click();
    assert.equal(await reducedPage.locator('[data-form-time-zone]').inputValue(), 'America/Los_Angeles');
    const motion = await reducedPage.locator('.booking-slot').first().evaluate(node => ({ animation: getComputedStyle(node).animationName, transition: getComputedStyle(node).transitionDuration, scroll: getComputedStyle(document.documentElement).scrollBehavior }));
    assert.deepEqual(motion, { animation: 'none', transition: '0s', scroll: 'auto' });
    await overflowCheck(reducedPage);
    await screenshot(reducedPage, 'booking-reduced-motion');
    await reduced.close();

    const nojs = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 320, height: 844 } });
    const nojsState = await mockNetwork(nojs, base);
    const staticPage = await nojs.newPage(); observe(staticPage);
    await staticPage.goto(`${base}/v2/book/`);
    assert.equal(await staticPage.locator('.booking-no-script').isVisible(), true);
    assert.equal(await staticPage.locator('.booking-card').isVisible(), false);
    assert.equal(await staticPage.getByRole('link', { name: 'Email Andrew' }).isVisible(), true);
    assert.equal(await staticPage.locator('.v2-nav').isVisible(), true);
    assert.equal(nojsState.requests.length, 0);
    await overflowCheck(staticPage);
    await screenshot(staticPage, 'booking-no-js');
    await nojs.close();
    assert.deepEqual(errors, [], 'No page errors');
    if (output) fs.writeFileSync(path.join(output, `${engine}-report.json`), JSON.stringify({ ok: true, engine, route: '/v2/book/', viewports: [1440, 768, 390, 320], liveBookings: 0, mockedSubmissions: state.submissions.length, screenshotPositions, errors }, null, 2));
    console.log('PASS: mocked booking, stale requests, repeated/error flows, keyboard, responsive, no-JS and reduced-motion checks. No live bookings sent.');
  } catch (error) {
    if (output) fs.writeFileSync(path.join(output, `${engine}-report.json`), JSON.stringify({ ok: false, engine, message: error.message, screenshotPositions, errors }, null, 2));
    throw error;
  } finally {
    await browser.close();
  }
}

staticChecks();
if (!process.argv.includes('--static-only')) browserChecks().catch(error => { console.error(error); process.exitCode = 1; });
