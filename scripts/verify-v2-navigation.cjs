/* Navigation stays usable when the shared controller arrives after the browser's
 * former cross-document transition timeout. Requires Playwright and a static server. */
'use strict';
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const base=process.env.V2_BASE_URL||'http://127.0.0.1:8080';
const destination='/v2/projects/framework-raspberry-pi/';

(async()=>{
  const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE||undefined,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  try{
    for(const test of [
      {name:'desktop',viewport:{width:1280,height:900},delay:0},
      {name:'desktop, controller delayed 6.5 s',viewport:{width:1280,height:900},delay:6500},
      {name:'mobile reduced motion, controller delayed 6.5 s',viewport:{width:390,height:844},delay:6500,reducedMotion:'reduce'}
    ]){
      const context=await browser.newContext({viewport:test.viewport,reducedMotion:test.reducedMotion||'no-preference'});
      try{
        const errors=[],transitions=[];
        let delayedRequests=0;
        await context.route('**/*.glb',route=>route.abort());
        await context.route('**/assets/v2.js',async route=>{
          if(test.delay&&(route.request().headers().referer||'').includes(destination)){
            delayedRequests++;
            await new Promise(resolve=>setTimeout(resolve,test.delay));
          }
          await route.continue();
        });
        const page=await context.newPage();
        page.on('pageerror',error=>errors.push({message:error.message,url:page.url()}));
        await page.exposeFunction('recordNavigation',event=>transitions.push(event));
        await page.addInitScript(()=>{
          for(const type of ['pagereveal','pageswap'])addEventListener(type,event=>{
            window.recordNavigation({type,hasTransition:!!event.viewTransition,url:location.href});
          });
        });
        await page.goto(base+'/v2/',{waitUntil:'networkidle'});
        await page.locator('[data-assembly-state="'+(test.reducedMotion?'static':'unavailable')+'"]').waitFor({timeout:30000});
        let navigation;
        if(test.reducedMotion) navigation=page.locator('[data-assembly-select="2"]').click();
        else {
          await page.locator('[data-assembly-select="2"]').click();
          await page.waitForFunction(()=>Math.abs(Number(document.querySelector('[data-assembly]').dataset.assemblyProgress)-.88)<.001);
          navigation=page.locator('[data-assembly-link]').click();
        }
        await page.waitForURL('**'+destination,{waitUntil:'commit'});
        await page.locator('h1').waitFor({state:'visible',timeout:3000});
        if(test.delay){
          assert.equal(await page.evaluate(()=>document.body.classList.contains('v2-ready')),false,'Destination must paint before its delayed controller');
        }
        await navigation;
        await page.waitForLoadState('networkidle');
        assert.equal(delayedRequests,test.delay?1:0,'Expected destination controller delay');
        assert.equal(await page.evaluate(()=>document.body.classList.contains('v2-ready')),true);
        assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'Destination must fit the viewport');
        assert.ok(transitions.some(event=>event.type==='pagereveal'&&event.url.endsWith(destination)),'Native destination reveal must occur');
        assert.equal(transitions.some(event=>event.hasTransition),false,'Page navigation must not start an optional cross-document transition');
        assert.deepEqual(errors,[],'Navigation must not emit JavaScript errors');
        console.log('PASS '+test.name+': visible destination, normal navigation, no transition rejection');
      }finally{await context.close();}
    }
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
