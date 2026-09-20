/* Optional browser acceptance checks. Requires Playwright and a running static
 * server at V2_BASE_URL (default http://127.0.0.1:8080). Run from the repo root.
 * CHROMIUM_EXECUTABLE can point at an existing browser. No dependencies are
 * needed to serve or use the website itself. */
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const base = process.env.V2_BASE_URL || 'http://127.0.0.1:8080';
const executablePath = process.env.CHROMIUM_EXECUTABLE || undefined;

(async () => {
  const browser = await chromium.launch({headless:true, executablePath, args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  const errors = [];
  try {
    const context = await browser.newContext({viewport:{width:1440,height:1000}});
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    const requests = [];
    page.on('request', request => requests.push(request.url()));
    await page.goto(base + '/v2/', {waitUntil:'networkidle'});
    assert.equal(requests.some(url => /\.glb(?:\?|$)|three\.min\.js/.test(url)), false, 'CAD must stay off the initial network path');
    assert.equal(await page.locator('[data-cad-poster]').evaluate(img => img.complete && img.naturalWidth > 0), true, 'CAD poster must load');
    for (const width of [1440,768,390,320]) {
      await page.setViewportSize({width,height:900});
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `Homepage overflows at ${width}px`);
    }
    await page.setViewportSize({width:390,height:844});
    await page.locator('[data-v2-menu]').click();
    assert.equal(await page.locator('[data-v2-menu]').getAttribute('aria-expanded'),'true');
    assert.equal(await page.locator('[data-v2-nav]').isVisible(),true);
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('[data-v2-menu]').getAttribute('aria-expanded'),'false');
    assert.equal(await page.locator('[data-v2-menu]').evaluate(node => node === document.activeElement),true);
    await page.locator('[data-system="tramtrace"]').click();
    await page.locator('[data-system-step="2"]').click();
    assert.match(await page.locator('[data-system-detail-text]').textContent(), /116 WS2812C/);
    await page.locator('[data-system="framework"]').click();
    assert.equal(await page.locator('[data-system-link]').getAttribute('href'),'/v2/projects/framework-expansion-card/');
    assert.match(await page.locator('[data-system-detail-text]').textContent(), /0.6 mm/);
    await page.setViewportSize({width:1440,height:1000});
    await page.locator('[data-cad-start]').click();
    await page.locator('[data-cad-state="ready"]').waitFor({timeout:30000});
    assert.equal(await page.locator('[data-cad-canvas]').isVisible(),true);
    assert.equal(await page.locator('[data-cad-poster]').isVisible(),false);
    await page.locator('[data-cad-view="top"]').click();
    assert.equal(await page.locator('[data-cad-view="top"]').getAttribute('aria-pressed'),'true');
    await page.locator('[data-cad-canvas]').focus();
    await page.keyboard.press('ArrowRight');
    assert.equal(await page.locator('[data-cad-hero]').getAttribute('data-cad-angle'),'custom');
    await page.keyboard.press('Home');
    assert.equal(await page.locator('[data-cad-hero]').getAttribute('data-cad-angle'),'iso');
    await page.waitForTimeout(1500);
    const frames = await page.locator('[data-cad-hero]').getAttribute('data-cad-frames');
    await page.waitForTimeout(800);
    assert.equal(await page.locator('[data-cad-hero]').getAttribute('data-cad-frames'), frames, 'CAD should not render continually when idle');
    console.log('PASS homepage: four widths, delayed CAD loading, menu, signal paths, 3D controls and idle rendering');

    await page.goto(base + '/v2/projects/', {waitUntil:'networkidle'});
    const search = page.locator('[data-v2-search]');
    await search.fill('Framework');
    assert.equal(await page.locator('[data-v2-project]:visible').count(),2);
    assert.match(await page.locator('[data-v2-search-status]').textContent(),/2 projects/);
    await page.reload({waitUntil:'networkidle'});
    assert.equal(await search.inputValue(),'Framework');
    assert.equal(await page.locator('[data-v2-project]:visible').count(),2);
    await search.fill('NoSuchBoard7654321');
    assert.equal(await page.locator('[data-v2-project]:visible').count(),0);
    assert.match(await page.locator('[data-v2-search-status]').textContent(),/No projects match/);
    await search.press('Escape');
    await page.locator('[data-v2-category="interactive"]').click();
    assert.match(await page.locator('[data-v2-search-status]').textContent(),/3 projects/);
    await page.setViewportSize({width:320,height:900});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'Project index overflows at320px');
    console.log('PASS collection: search, empty state, URL persistence, keyboard clear, categories and 320px reflow');
    await page.setViewportSize({width:1280,height:900});
    for (const [route,prefix] of [['framework-expansion-card','framework'],['framework-dual-usb','dual-usb']]) {
      await page.goto(base + `/v2/projects/${route}/`,{waitUntil:'networkidle'});
      await page.locator(`[data-${prefix}-view="top"]`).click();
      assert.equal(await page.locator(`[data-${prefix}-view="top"]`).getAttribute('aria-pressed'),'true');
      await page.locator(`[data-${prefix}-shell]`).click();
      assert.equal(await page.locator(`[data-${prefix}-shell]`).getAttribute('aria-pressed'),'false');
      await page.locator(`[data-${prefix}-explode]`).click();
      assert.equal(await page.locator(`[data-${prefix}-explode]`).getAttribute('aria-pressed'),'true');
    }
    await page.goto(base+'/v2/projects/skylabs/',{waitUntil:'networkidle'});
    await page.locator('[data-object-board="ground"]').click();
    assert.equal(await page.locator('[data-object-board="ground"]').getAttribute('aria-pressed'),'true');
    assert.match(await page.locator('[data-object-project-link]').getAttribute('href'),/^\/v2\/projects\/skylabs\/boards\/ground-station\//);
    await page.locator('[data-object-view="inspect"]').click();
    assert.equal(await page.locator('[data-object-view="inspect"]').getAttribute('aria-pressed'),'true');
    await page.goto(base+'/v2/projects/tramtrace/',{waitUntil:'networkidle'});
    await page.locator('[data-inspector-mode="copper"]').click();
    assert.equal(await page.locator('[data-inspector-mode="copper"]').getAttribute('aria-pressed'),'true');
    await page.locator('[data-inspector-mode="data"]').click();
    assert.equal(await page.locator('[data-inspector-mode="data"]').getAttribute('aria-pressed'),'true');
    console.log('PASS case integrations: both Framework 3D inspectors, Skylabs board switching and v2 links, TramTrace copper/data views');
    await context.close();

    const fallback = await browser.newContext({viewport:{width:1280,height:900}});
    await fallback.route('**/*.glb', route=>route.abort());
    const fallbackPage=await fallback.newPage();
    await fallbackPage.goto(base+'/v2/',{waitUntil:'networkidle'});
    await fallbackPage.locator('[data-cad-start]').click();
    await fallbackPage.locator('[data-cad-state="unavailable"]').waitFor();
    assert.equal(await fallbackPage.locator('[data-cad-poster]').isVisible(),true);
    assert.equal(await fallbackPage.locator('[data-cad-canvas]').isVisible(),false);
    assert.equal(await fallbackPage.getByRole('link',{name:'Framework ESP32 Card'}).isVisible(),true);
    await fallback.close();
    console.log('PASS CAD failure: still image and project link remain available');

    const noJS = await browser.newContext({javaScriptEnabled:false,viewport:{width:390,height:844}});
    const staticPage=await noJS.newPage();
    await staticPage.goto(base+'/v2/',{waitUntil:'networkidle'});
    assert.equal(await staticPage.locator('h1').isVisible(),true);
    assert.equal(await staticPage.locator('[data-v2-nav]').isVisible(),true);
    assert.equal(await staticPage.locator('[data-cad-poster]').isVisible(),true);
    assert.equal(await staticPage.locator('[data-cad-start]').isVisible(),false);
    await staticPage.goto(base+'/v2/projects/',{waitUntil:'networkidle'});
    assert.ok(await staticPage.locator('[data-v2-project]:visible').count()>=14);
    await noJS.close();
    const reduced=await browser.newContext({reducedMotion:'reduce'});
    const reducedPage=await reduced.newPage();
    await reducedPage.goto(base+'/v2/');
    assert.equal(await reducedPage.evaluate(()=>getComputedStyle(document.documentElement).scrollBehavior),'auto');
    await reduced.close();
    assert.deepEqual(errors,[],'Browser JavaScript errors');
    console.log('PASS no-JavaScript navigation/content and reduced-motion scrolling');
  } finally { await browser.close(); }
})().catch(error=>{console.error(error);process.exitCode=1;});
