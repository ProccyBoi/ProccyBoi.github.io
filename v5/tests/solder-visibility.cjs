/* Rendered evidence for paste application and solder wetting. Pair with visual review. */
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.V5_BASE_URL || 'http://127.0.0.1:8765';
const out = path.resolve(process.env.V5_QA_OUTPUT || 'work/v5-solder-qa');
const baseline = process.env.V5_CAPTURE_BASELINE === '1';
const stops = (process.env.V5_CAPTURE_STOPS || (baseline ? '0,.1,.16,.35,.55,.68' : '0,.18,.36,.5,.62,.71,.85,1')).split(',').map(Number);
const widths = (process.env.V5_CAPTURE_WIDTHS || (baseline ? '1440' : '1440,390')).split(',').map(Number);
const report = {base, baseline, frames:[], checks:[], limitation:'Screenshots must be visually reviewed for clarity. Different image hashes establish changed rendering, not manufacturing accuracy or legibility.'};
let browser;
fs.mkdirSync(out,{recursive:true});
const pose = async (page,p) => {
  await page.locator('[data-v5-assembly]').evaluate((root,p)=>{
    const stage=root.querySelector('.assembly-stage');
    const sticky=parseFloat(getComputedStyle(stage).top)||0;
    scrollTo({top:root.getBoundingClientRect().top+scrollY-sticky+p*(root.offsetHeight-stage.clientHeight),behavior:'instant'});
  },p);
  await page.waitForFunction(p=>Math.abs(document.querySelector('[data-v5-assembly]').assemblySnapshot().progress-p)<.002,p);
  // Wait on two actual frames so screenshots include the compositor result.
  await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
};
(async()=>{
  browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE?{executablePath:process.env.CHROMIUM_EXECUTABLE}:{}),args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  for(const width of widths){
    const page=await browser.newPage({viewport:{width,height:width>700?1000:844},deviceScaleFactor:1});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(base+'/v5/',{waitUntil:'domcontentloaded'});
    await page.locator('[data-v5-assembly]').scrollIntoViewIfNeeded();
    await page.waitForFunction(()=>document.querySelector('[data-v5-assembly]').dataset.state==='ready',null,{timeout:90000});
    const hashes=[];
    let detailCamera;
    let detailFrames=0;
    for(const p of stops){
      await pose(page,p);
      const file=path.join(out,`${width}-p${Math.round(p*1000).toString().padStart(3,'0')}.png`);
      const bytes=await page.screenshot({path:file});
      const hash=crypto.createHash('sha256').update(bytes).digest('hex');hashes.push(hash);
      const snapshot=await page.locator('[data-v5-assembly]').evaluate(r=>r.assemblySnapshot());
      if(!baseline && [.36,.5,.62,.71].includes(p)){
        assert(snapshot.camera,'Detailed camera diagnostics are required');
        if(detailCamera) assert.deepEqual(snapshot.camera,detailCamera,'Paste, seated, coalescing and cooled frames must use identical framing');
        else detailCamera=snapshot.camera;
        detailFrames++;
      }
      report.frames.push({width,progress:snapshot.progress,file:path.basename(file),hash,diagnostics:{...snapshot,parts:undefined}});
    }
    assert.equal(new Set(hashes).size,hashes.length,'Separate scroll frames must visibly differ');
    assert.deepEqual(errors,[],'No browser errors');
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'No horizontal overflow');
    report.checks.push({name:`${width}px rendered sequence, no browser errors or horizontal overflow`,passed:true});
    if(detailFrames>=2)report.checks.push({name:`${width}px matched camera across ${detailFrames} paste-to-joint evidence frames`,passed:true});
    if(!baseline){
      await pose(page,1);
      const end=await page.locator('[data-v5-assembly]').evaluate(r=>r.assemblySnapshot());
      for(const part of end.parts){assert(part.visible);assert.deepEqual(part.position,part.base);assert.deepEqual(part.quaternion,part.sourceQuaternion);}
      report.checks.push({name:`${width}px final source poses preserved`,passed:true});
      await pose(page,stops[Math.floor(stops.length/2)]);
      const reverseFile=path.join(out,`${width}-reverse.png`);
      await page.screenshot({path:reverseFile});
      await page.emulateMedia({reducedMotion:'reduce'});
      await page.waitForFunction(()=>document.querySelector('[data-v5-assembly]').dataset.state==='static');
      assert(await page.locator('.assembly-poster').isVisible());
      assert.equal(await page.locator('[data-v5-assembly]').evaluate(r=>r.classList.contains('is-active')),false);
      report.checks.push({name:`${width}px reduced-motion static fallback`,passed:true});
    }
    await page.close();
  }
  report.passed=true;
})().catch(e=>{report.passed=false;report.error=String(e.stack||e);process.exitCode=1;console.error(e);}).finally(async()=>{
  fs.writeFileSync(path.join(out,'solder-visibility-report.json'),JSON.stringify(report,null,2));
  await browser?.close();
  console.log(JSON.stringify({passed:report.passed,frames:report.frames.length,checks:report.checks,error:report.error},null,2));
});
