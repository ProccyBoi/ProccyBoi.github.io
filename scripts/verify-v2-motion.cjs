/* Responsive and motion acceptance checks for the actual assembly hero.
 * Requires Playwright. Optional: V2_BASE_URL, CHROMIUM_EXECUTABLE,
 * V2_SCREENSHOTS directory for review images. --lifecycle-only skips the
 * breakpoint/keyboard sweep for focused preference/context-loss diagnosis. */
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {chromium}=require('playwright');
const base=process.env.V2_BASE_URL||'http://127.0.0.1:8080';
const shots=process.env.V2_SCREENSHOTS;
const lifecycleOnly=process.argv.includes('--lifecycle-only');
if(shots)fs.mkdirSync(shots,{recursive:true});
const phases=[
  {progress:.265,name:'tramtrace',title:'TramTrace',href:'/v2/projects/tramtrace/'},
  {progress:.565,name:'esp32',title:'ESP32',href:'/v2/projects/framework-expansion-card/'},
  {progress:.88,name:'pi',title:'Raspberry Pi',href:'/v2/projects/framework-raspberry-pi/'}
];
async function scrollPhase(page,progress){
  await page.evaluate(value=>{
    const root=document.querySelector('[data-assembly]');
    const stage=root.querySelector('.v2-assembly-sticky');
    scrollTo({top:scrollY+root.getBoundingClientRect().top+value*(root.offsetHeight-stage.clientHeight),behavior:'instant'});
  },progress);
  await page.waitForFunction(value=>Math.abs(Number(document.querySelector('[data-assembly]').dataset.assemblyProgress)-value)<.001,progress,{timeout:30000}).catch(async error=>{
    console.error('Scroll diagnostic',await page.locator('[data-assembly]').evaluate(node=>({state:{...node.dataset},bounds:node.getBoundingClientRect().toJSON(),scrollY,hidden:document.hidden,viewport:[innerWidth,innerHeight]})));
    throw error;
  });
  await page.waitForTimeout(500);
}
async function framesStop(page,label){
  await page.evaluate(()=>{window.__v2FrameCheck=null;});
  await page.waitForFunction(()=>{
    const frames=document.querySelector('[data-assembly]').dataset.assemblyFrames;
    if(!window.__v2FrameCheck||window.__v2FrameCheck.frames!==frames)window.__v2FrameCheck={frames,time:performance.now()};
    return performance.now()-window.__v2FrameCheck.time>1000;
  },null,{polling:100,timeout:30000});
  const before=await page.locator('[data-assembly]').getAttribute('data-assembly-frames');
  await page.waitForTimeout(500);
  assert.equal(await page.locator('[data-assembly]').getAttribute('data-assembly-frames'),before,label);
}
async function inViewport(locator,width,height,label){
  const bounds=await locator.boundingBox();
  assert.ok(bounds&&bounds.x>=-1&&bounds.y>=-1&&bounds.x+bounds.width<=width+1&&bounds.y+bounds.height<=height+1,label+': '+JSON.stringify(bounds));
}
(async()=>{
  const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE||undefined,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  try{
    const page=await browser.newPage({viewport:{width:1440,height:1000},reducedMotion:'no-preference'});
    const errors=[];page.on('pageerror',error=>errors.push(error.message));
    await page.goto(base+'/v2/',{waitUntil:'domcontentloaded'});
    const hero=page.locator('[data-assembly]');
    await page.locator('[data-assembly-state="ready"]').waitFor({timeout:60000});
    await page.waitForTimeout(1800);
    await framesStop(page,'Entrance must finish and stop rendering');
    for(const viewport of lifecycleOnly?[]:[{width:1440,height:1000},{width:1366,height:768},{width:768,height:1024},{width:390,height:844},{width:320,height:740}]){
      await page.setViewportSize(viewport);
      await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
      await scrollPhase(page,0);
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'Hero overflow at '+JSON.stringify(viewport));
      await inViewport(page.locator('[data-assembly-intro] h1'),viewport.width,viewport.height,'Intro fits '+JSON.stringify(viewport));
      await inViewport(page.locator('.v2-assembly-choices'),viewport.width,viewport.height,'Project choices fit '+JSON.stringify(viewport));
      if(shots)await page.screenshot({path:path.join(shots,'assembly-'+viewport.width+'x'+viewport.height+'-overview.png')});
      for(const phase of phases){
        await scrollPhase(page,phase.progress);
        assert.equal(await hero.getAttribute('data-assembly-active'),phase.name);
        assert.equal(await page.locator('[data-assembly-title]').textContent(),phase.title);
        assert.equal(await page.locator('[data-assembly-link]').getAttribute('href'),phase.href);
        assert.equal(await page.locator('[data-assembly-caption]').getAttribute('aria-hidden'),'false');
        assert.equal(await page.locator('[data-assembly-link]').getAttribute('tabindex'),'0');
        await inViewport(page.locator('[data-assembly-caption]'),viewport.width,viewport.height,'Caption fits '+phase.name+' '+JSON.stringify(viewport));
        const caption=await page.locator('[data-assembly-caption]').boundingBox();
        const choices=await page.locator('.v2-assembly-choices').boundingBox();
        assert.ok(caption.y+caption.height<=choices.y,'Caption must not overlap project choices: '+phase.name+' '+JSON.stringify(viewport));
        assert.equal(await page.locator('[data-assembly-link]').evaluate(link=>{
          const r=link.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);
          return hit===link||link.contains(hit);
        }),true,'Project caption link must be clickable');
        const draws=Number(await hero.getAttribute('data-assembly-draws'));
        assert.ok(draws>0&&draws<350,'Focused model must render with bounded draw calls: '+draws);
        assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
        if(shots)await page.screenshot({path:path.join(shots,'assembly-'+viewport.width+'x'+viewport.height+'-'+phase.name+'.png')});
      }
      console.log('PASS hero viewport '+viewport.width+'x'+viewport.height+': all three chapters, caption links and controls');
    }
    if(!lifecycleOnly)console.log('PASS three scroll chapters at desktop, 768px-high laptop, tablet, 390px and 320px; captions/controls fit and draw calls stay bounded');
    await page.setViewportSize({width:1440,height:1000});
    for(let index=0;index<(lifecycleOnly?0:phases.length);index++){
      await page.locator('[data-assembly-select="'+index+'"]').focus();
      await page.keyboard.press('Enter');
      await page.waitForFunction(value=>Math.abs(Number(document.querySelector('[data-assembly]').dataset.assemblyProgress)-value)<.001,phases[index].progress);
      assert.equal(await page.locator('[data-assembly-select="'+index+'"]').getAttribute('aria-current'),'true');
      assert.equal(await page.locator('[data-assembly-link]').getAttribute('href'),phases[index].href);
    }
    await framesStop(page,'Scroll selection must stop rendering when settled');
    await page.evaluate(()=>scrollTo({top:document.documentElement.scrollHeight,behavior:'instant'}));
    await framesStop(page,'Offscreen hero must not render');
    await scrollPhase(page,.265);
    assert.equal(await hero.getAttribute('data-assembly-active'),'tramtrace','Hero resumes after returning onscreen');
    console.log('PASS '+(lifecycleOnly?'':'keyboard project selection, ')+'finite motion, idle/offscreen suspension and resume');
    await page.emulateMedia({reducedMotion:'reduce'});
    // Check what visitors experience, not only an internal mode class. During
    // active software rendering Chromium can update the media query and CSS
    // before the matching MediaQueryList callback is observed.
    await page.waitForFunction(()=>matchMedia('(prefers-reduced-motion: reduce)').matches&&getComputedStyle(document.querySelector('.v2-assembly-sticky')).position!=='sticky',null,{polling:100,timeout:30000});
    assert.equal(await hero.evaluate(node=>node.offsetHeight<=innerHeight+1),true,'Reduced motion must remove the long pinned scroll section');
    assert.equal(await page.locator('[data-assembly-caption]').isVisible(),false,'Reduced motion hides scroll-only captions');
    assert.equal(await page.evaluate(()=>getComputedStyle(document.documentElement).scrollBehavior),'auto');
    await framesStop(page,'Live reduced-motion preference must stop animation');
    const reducedState=await hero.evaluate(node=>({className:node.className,state:node.dataset.assemblyState,frames:node.dataset.assemblyFrames,progress:node.dataset.assemblyProgress}));
    console.log('PASS live reduced motion: unpinned, compact, idle; diagnostic '+JSON.stringify(reducedState));
    await page.emulateMedia({reducedMotion:'no-preference'});
    await page.waitForFunction(()=>!matchMedia('(prefers-reduced-motion: reduce)').matches&&getComputedStyle(document.querySelector('.v2-assembly-sticky')).position==='sticky',null,{polling:100,timeout:30000});
    await scrollPhase(page,.565);
    assert.equal(await hero.getAttribute('data-assembly-active'),'esp32');
    console.log('PASS live reduced-motion preference and restoration');
    const extension=await page.locator('[data-assembly-canvas]').evaluate(canvas=>{
      const gl=canvas.getContext('webgl2')||canvas.getContext('webgl');
      const loss=gl.getExtension('WEBGL_lose_context');
      if(!loss)return false;
      loss.loseContext();return true;
    });
    assert.equal(extension,true,'Test browser must support simulated context loss');
    await page.locator('[data-assembly-state="unavailable"]').waitFor();
    assert.equal(await hero.evaluate(node=>node.classList.contains('is-static')&&!node.classList.contains('is-enhanced')),true);
    assert.equal(await page.locator('[data-assembly-posters]').isVisible(),true);
    await framesStop(page,'Lost WebGL context must not keep scheduling renders');
    assert.deepEqual(errors,[],'Browser JavaScript errors');
    console.log('PASS context loss returns to static project images and stops rendering');
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
