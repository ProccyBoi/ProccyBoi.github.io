/* V2 visual identity, responsive navigation and unchanged case routes.
 * Screenshots are ordinary rendered pages. Does not submit booking forms. */
'use strict';
const { chromium, webkit } = require('playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const origin=process.env.V2_BASE_URL||'http://127.0.0.1:8080';
const out=process.env.V2_POLISH_OUT||'/tmp/v2-polish-evidence';
const isWebkit=process.argv.includes('--webkit');
const cases=[],errors=[];
(async()=>{
 fs.mkdirSync(out,{recursive:true});
 const browser=await (isWebkit?webkit:chromium).launch(isWebkit?{headless:true}:{headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 try{
  for(const width of (isWebkit?[390,320]:[1440,768,600,390,320])){
   const context=await browser.newContext({viewport:{width,height:width>700?1000:844},reducedMotion:'reduce',isMobile:width<700,hasTouch:width<700});
   const page=await context.newPage(); page.on('pageerror',e=>errors.push(e.message));
   for(const route of ['/v2/','/v2/projects/','/v2/about/','/v2/projects/skylabs/']){
    await page.goto(origin+route,{waitUntil:'networkidle'});
    assert.ok(await page.locator('h1').isVisible(),route+' heading visible');
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,route+' no overflow at '+width);
    const menu=page.locator('[data-v2-menu]');
    if(await menu.isVisible()){
     assert.ok((await menu.boundingBox()).height>=44);
     await menu.click(); assert.equal(await menu.getAttribute('aria-expanded'),'true');
     const book=page.locator('[data-v2-nav] a[href="/v2/book/"]');assert.ok(await book.isVisible());assert.ok((await book.boundingBox()).height>=44);
     await page.keyboard.press('Escape');assert.equal(await menu.getAttribute('aria-expanded'),'false');assert.ok(await menu.evaluate(n=>n===document.activeElement));
     await menu.click();await page.locator('.v2-footer a').first().focus();assert.equal(await menu.getAttribute('aria-expanded'),'false','Tab outside closes open menu');
    }else assert.ok(await page.locator('[data-v2-nav] a[href="/v2/book/"]').isVisible());
    await page.evaluate(()=>scrollTo({top:0,behavior:'instant'}));
    await page.screenshot({path:path.join(out,`final-${width}-${route.replaceAll('/','_')}.png`)});
    cases.push({width,route,engine:isWebkit?'webkit':'chromium'});
   }
   await context.close();
  }
  for(const width of [320,390]){
   const context=await browser.newContext({viewport:{width,height:844},javaScriptEnabled:false});const page=await context.newPage();
   await page.goto(origin+'/v2/',{waitUntil:'networkidle'});
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
   for(const a of await page.locator('[data-v2-nav] a').all())assert.ok(await a.isVisible());
   await page.screenshot({path:path.join(out,`final-nojs-${width}.png`)});await context.close();
  }
  if(!isWebkit){
   for(const [name,url] of [['baseline',process.env.V2_POLISH_BASELINE_URL],['final',origin]]){
    if(!url)continue;
    for(const width of [1440,390]){
     const context=await browser.newContext({viewport:{width,height:width>700?1000:844},reducedMotion:'no-preference'});const page=await context.newPage();
     await page.goto(url+'/v2/',{waitUntil:'domcontentloaded'});
     await page.waitForFunction(()=>document.querySelector('[data-assembly]')?.dataset.assemblyModelsReady==='3',null,{timeout:180000});await page.waitForTimeout(1600);
     await page.screenshot({path:path.join(out,`${name}-hero-${width}.png`)});
     if(await page.locator('[data-selected-work]').count()) {
      await page.waitForFunction(()=>document.querySelector('[data-selected-work]')?.dataset.selectedReady==='true');
      await page.locator('#work-framework').evaluate(node=>node.scrollIntoView({block:'start',behavior:'instant'}));
      await page.waitForFunction(()=>{const root=document.querySelector('[data-selected-work]');return root.dataset.selectedBackgroundReady==='true'&&root.dataset.selectedWarmMask==='false'&&Number(root.dataset.selectedFrames)>0;},null,{timeout:180000});
      await page.locator('.v2-selected-stage').screenshot({path:path.join(out,`${name}-gallery-${width}.png`)});
     } else {
      await page.locator('#work').scrollIntoViewIfNeeded();await page.waitForTimeout(700);
      await page.waitForFunction(()=>{const image=document.querySelector('[data-gallery-media] [data-gallery-photo]:not([hidden]) img[data-gallery-original]');return image?.complete&&image.naturalWidth>0;});
      await page.locator('[data-gallery-media] [data-gallery-photo]:not([hidden]) img[data-gallery-original]').evaluate(image=>image.decode());
      await page.screenshot({path:path.join(out,`${name}-gallery-${width}.png`)});
     }
     await context.close();
    }
   }
  }
  assert.deepEqual(errors,[]);
 }finally{await browser.close();fs.writeFileSync(path.join(out,'polish.json'),JSON.stringify({cases,errors,engine:isWebkit?'WebKit emulation':'Chromium software WebGL'},null,2));}
})().catch(e=>{console.error(e);process.exitCode=1;});
