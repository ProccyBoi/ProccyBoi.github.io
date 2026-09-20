/* Motion acceptance checks against the actual local or deployed site.
 * Requires Playwright. Environment: V2_BASE_URL, CHROMIUM_EXECUTABLE,
 * optional V2_SCREENSHOTS directory for visual review frames. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {chromium} = require('playwright');
const base = process.env.V2_BASE_URL || 'http://127.0.0.1:8080';
const shots = process.env.V2_SCREENSHOTS;
if (shots) fs.mkdirSync(shots,{recursive:true});

(async()=>{
  const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE||undefined});
  try {
    const context=await browser.newContext({viewport:{width:1440,height:1000}});
    const page=await context.newPage();const errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    await page.goto(base+'/v2/',{waitUntil:'domcontentloaded'});
    const initial=await page.evaluate(()=>document.getAnimations().filter(animation=>animation.playState==='running').length);
    assert.ok(initial>0,'Hero should have a finite entrance sequence');
    await page.waitForTimeout(1900);
    assert.equal(await page.locator('.v2-hero').evaluate(hero=>hero.getAnimations({subtree:true}).filter(animation=>animation.playState==='running').length),0,'Hero entrance must finish');
    if(shots) await page.screenshot({path:path.join(shots,'hero-settled.png')});
    const story=page.locator('[data-v2-process]');
    assert.equal(await story.locator('.v2-process-visual').evaluate(node=>getComputedStyle(node).position),'sticky');
    for(let index=0;index<3;index++){
      await page.locator(`[data-process-chapter="${index}"]`).evaluate(chapter=>{
        const bounds=chapter.getBoundingClientRect();
        scrollTo({top:scrollY+bounds.top+bounds.height*.38-innerHeight*.52,behavior:'instant'});
      });
      await page.waitForFunction(expected=>document.querySelector('[data-v2-process]').dataset.processStage===String(expected),index);
      await story.locator('img').evaluateAll(images=>Promise.all(images.map(image=>image.decode().catch(()=>{}))));
      if(shots) await page.screenshot({path:path.join(shots,`process-${index}.png`)});
    }
    await page.locator('[data-process-select="0"]').click();
    await page.waitForFunction(()=>document.querySelector('[data-v2-process]').dataset.processStage==='0');
    await page.waitForTimeout(750);
    assert.match(await page.locator('[data-process-stack]').getAttribute('style'),/rotateX\(48/);
    await page.locator('[data-process-select="0"]').press('ArrowRight');
    await page.waitForFunction(()=>document.querySelector('[data-v2-process]').dataset.processStage==='1');
    await page.waitForTimeout(750);
    assert.equal(await page.locator('[data-process-select="1"]').evaluate(node=>node===document.activeElement),true);
    assert.equal(await page.locator('[data-process-assembled]').evaluate(node=>Number(getComputedStyle(node).opacity)),1);
    const before=await page.locator('[data-process-stack]').getAttribute('style');
    await page.waitForTimeout(500);
    assert.equal(await page.locator('[data-process-stack]').getAttribute('style'),before,'Story should stay idle after a selection');
    console.log('PASS finite hero entrance, scroll-controlled fabrication sequence, stage buttons, keyboard and idle state');
    for(const viewport of [{width:1440,height:800},{width:1366,height:768}]){
      await page.setViewportSize(viewport);
      await page.locator('[data-process-chapter="1"]').evaluate(chapter=>{
        const bounds=chapter.getBoundingClientRect();
        scrollTo({top:scrollY+bounds.top+bounds.height*.38-innerHeight*.52,behavior:'instant'});
      });
      await page.waitForFunction(()=>document.querySelector('[data-v2-process]').dataset.processStage==='1');
      const bounds=await story.locator('figcaption').boundingBox();
      assert.ok(bounds.y+bounds.height<viewport.height,`Story caption must fit at ${viewport.width}x${viewport.height}`);
      if(shots) await page.screenshot({path:path.join(shots,`process-laptop-${viewport.height}.png`)});
    }
    await page.setViewportSize({width:1366,height:600});
    await page.waitForFunction(()=>!document.querySelector('[data-v2-process]').classList.contains('is-motion'));
    assert.equal(await story.locator('.v2-process-visual').evaluate(node=>getComputedStyle(node).position),'relative','Short windows should disable pinning');
    console.log('PASS laptop controls and captions fit; short windows disable pinning');
    for(const width of [768,390,320]){
      await page.setViewportSize({width,height:900});
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`Motion layout overflows at${width}`);
    }
    assert.notEqual(await story.locator('.v2-process-visual').evaluate(node=>getComputedStyle(node).position),'sticky','Mobile story should not pin the page');
    await page.locator('[data-process-select="2"]').click();
    await page.waitForFunction(()=>document.querySelector('[data-v2-process]').dataset.processStage==='2');
    if(shots){await page.waitForTimeout(750);await page.screenshot({path:path.join(shots,'process-mobile.png')});}
    await page.emulateMedia({reducedMotion:'reduce'});
    assert.equal(await page.evaluate(()=>document.getAnimations().filter(animation=>animation.playState==='running').length),0);
    await page.locator('[data-process-select="0"]').click();
    assert.equal(await story.getAttribute('data-process-stage'),'0');
    assert.equal(await page.locator('[data-process-stack]').evaluate(node=>node.getAnimations().length),0);
    console.log('PASS mobile reflow, unpinned story and live reduced-motion preference');
    assert.deepEqual(errors,[]);
    await context.close();
    const noJS=await browser.newContext({javaScriptEnabled:false,viewport:{width:390,height:844}});
    const staticPage=await noJS.newPage();await staticPage.goto(base+'/v2/',{waitUntil:'networkidle'});
    assert.equal(await staticPage.locator('[data-process-photo]').isVisible(),true);
    assert.equal(await staticPage.locator('[data-process-controls]').isVisible(),false);
    assert.equal(await staticPage.locator('[data-process-chapter]:visible').count(),3);
    await noJS.close();
    console.log('PASS no-JavaScript: actual build photograph and all three engineering chapters remain available');
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
