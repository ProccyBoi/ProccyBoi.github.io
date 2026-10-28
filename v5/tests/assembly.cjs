/* Integration checks against a served repository. Does not claim device FPS. */
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const playwright = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.V5_BASE_URL || 'http://127.0.0.1:8765';
const output = path.resolve(process.env.V5_QA_OUTPUT || 'work/v5-qa');
fs.mkdirSync(output, {recursive:true});
const report = {base, checks: [], screenshots: [], limitation: 'Chromium software-renderer checks, not physical-device frame-rate measurements.'};
let browser;
const check = async (name, fn) => {
  const start=Date.now();
  await fn();
  report.checks.push({name, status:'passed', milliseconds:Date.now()-start});
  console.log('PASS '+name);
};
const snapshot = page => page.locator('[data-v5-assembly]').evaluate(root => root.assemblySnapshot());
const state = page => page.locator('[data-v5-assembly]').getAttribute('data-state');
const position = async (page, progress) => {
  await page.locator('[data-v5-assembly]').evaluate((root, p) => {
    const stage=root.querySelector('.assembly-stage');
    const sticky=parseFloat(getComputedStyle(stage).top)||0;
    const start=root.getBoundingClientRect().top+scrollY-sticky;
    scrollTo({top:start+p*(root.offsetHeight-stage.clientHeight),behavior:'instant'});
  },progress);
  await page.waitForFunction(p => {
    const root=document.querySelector('[data-v5-assembly]');
    return root.assemblySnapshot && Math.abs(root.assemblySnapshot().progress-p)<.002;
  },progress);
};
const prepare = async (page) => {
  await page.goto(base+'/v5/', {waitUntil:'domcontentloaded'});
  await page.locator('[data-v5-assembly]').scrollIntoViewIfNeeded();
  await page.waitForFunction(()=>document.querySelector('[data-v5-assembly]').dataset.state==='ready',{},{timeout:90000});
  await position(page,0);
};
const shot=async(page,name)=>{
  const file=path.join(output,name+'.png');
  await page.screenshot({path:file});
  report.screenshots.push(file);
};
const makePage = async options => {
  const page=await browser.newPage(options);
  page.setDefaultTimeout(30000);
  return page;
};
(async()=>{
  browser=await playwright.chromium.launch({headless:true, ...(process.env.CHROMIUM_EXECUTABLE?{executablePath:process.env.CHROMIUM_EXECUTABLE}:{}), args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  const desktop=await makePage({viewport:{width:1440,height:1000}});
  const errors=[];desktop.on('pageerror',error=>errors.push(error.message));
  await check('desktop native scroll, exact final source positions and reversible poses',async()=>{
    await prepare(desktop);
    const start=await snapshot(desktop);
    assert(start.parts.every(part=>!part.visible));
    await shot(desktop,'desktop-bare');
    await position(desktop,.45);const middle=await snapshot(desktop);
    assert(middle.parts.some(part=>part.visible));
    assert(middle.parts.some(part=>!part.visible));
    await shot(desktop,'desktop-placement');
    await position(desktop,.66);await shot(desktop,'desktop-solder');
    await position(desktop,.85);await shot(desktop,'desktop-underside');
    await position(desktop,1);const end=await snapshot(desktop);
    assert(end.parts.length>10);
    for(const part of end.parts){assert(part.visible);assert.deepEqual(part.position,part.base);assert.deepEqual(part.quaternion,part.sourceQuaternion);}
    await shot(desktop,'desktop-finished');
    await position(desktop,.45);const repeated=await snapshot(desktop);
    for(let i=0;i<middle.parts.length;i++){
      assert.equal(middle.parts[i].visible,repeated.parts[i].visible);
      for(let axis=0;axis<3;axis++)assert(Math.abs(middle.parts[i].position[axis]-repeated.parts[i].position[axis])<.003);
    }
    assert.deepEqual(errors,[]);
    report.geometry={parts:end.parts.length,drawCalls:end.drawCalls,triangles:end.triangles};
  });
  await check('idle and offscreen render lifecycle',async()=>{
    await position(desktop,.5);await desktop.waitForTimeout(400);
    const a=await snapshot(desktop);await desktop.waitForTimeout(700);const b=await snapshot(desktop);assert.equal(a.frames,b.frames);
    await desktop.evaluate(()=>document.getElementById('work').scrollIntoView({behavior:'instant'}));
    await desktop.waitForTimeout(400);const c=await snapshot(desktop);await desktop.waitForTimeout(700);const d=await snapshot(desktop);assert.equal(c.frames,d.frames);
  });
  await check('reduced-motion live toggle restores static image and stops rendering',async()=>{
    await position(desktop,.45);
    await desktop.emulateMedia({reducedMotion:'reduce'});
    await desktop.waitForFunction(()=>document.querySelector('[data-v5-assembly]').dataset.state==='static');
    assert(await desktop.locator('.assembly-poster').isVisible());
    assert.equal(await desktop.locator('[data-v5-assembly]').evaluate(el=>el.classList.contains('is-active')),false);
    const before=await snapshot(desktop);await desktop.waitForTimeout(500);assert.equal((await snapshot(desktop)).frames,before.frames);
    await desktop.emulateMedia({reducedMotion:'no-preference'});
    await desktop.locator('[data-v5-assembly]').scrollIntoViewIfNeeded();
    await desktop.waitForFunction(()=>document.querySelector('[data-v5-assembly]').dataset.state==='ready');
  });
  await desktop.close();
  for(const width of [390,320])await check('mobile '+width+'px viewport and source fit',async()=>{
    const page=await makePage({viewport:{width,height:844},isMobile:true,deviceScaleFactor:1,hasTouch:true});
    await prepare(page);await position(page,1);await shot(page,'mobile-'+width+'-finished');
    const bounds=await page.evaluate(()=>({scroll:document.documentElement.scrollWidth,width:innerWidth,canvas:document.querySelector('.assembly-stage canvas').getBoundingClientRect().toJSON(),header:document.querySelector('.site-header').getBoundingClientRect().toJSON()}));
    assert(bounds.scroll<=bounds.width+1);
    assert(bounds.canvas.width<=bounds.width+1);
    assert(bounds.canvas.top>=bounds.header.bottom-2);
    const end=await snapshot(page);for(const part of end.parts)assert.deepEqual(part.position,part.base);
    await page.close();
  });
  await check('initial reduced motion requests no CAD or Three.js',async()=>{
    const page=await makePage({viewport:{width:390,height:844},reducedMotion:'reduce'});const resources=[];
    page.on('request',req=>resources.push(req.url()));
    await page.goto(base+'/v5/');await page.locator('[data-v5-assembly]').scrollIntoViewIfNeeded();await page.waitForTimeout(500);
    assert.equal(await state(page),'static');assert(await page.locator('.assembly-poster').isVisible());
    assert(!resources.some(url=>/telemetry\.(bin|idx)|three\.min\.js|skylabs-reflow-lands/.test(url)));
    await shot(page,'reduced-motion');await page.close();
  });
  await check('Save Data is static until explicit load',async()=>{
    const page=await makePage({viewport:{width:390,height:844}});const resources=[];
    await page.addInitScript(()=>Object.defineProperty(navigator,'connection',{value:{saveData:true},configurable:true}));
    page.on('request',req=>resources.push(req.url()));
    await page.goto(base+'/v5/');await page.locator('[data-v5-assembly]').scrollIntoViewIfNeeded();await page.waitForTimeout(300);
    assert.equal(await state(page),'static');assert(await page.locator('.assembly-load').isVisible());
    assert(!resources.some(url=>/telemetry\.(bin|idx)|three\.min\.js/.test(url)));
    await page.locator('.assembly-load').click();await page.waitForFunction(()=>document.querySelector('[data-v5-assembly]').dataset.state==='ready',{},{timeout:90000});
    assert(resources.some(url=>/telemetry\.(bin|idx)/.test(url)));await page.close();
  });
  await check('failed CAD request returns static fallback without long empty scroll',async()=>{
    const page=await makePage({viewport:{width:1200,height:900}});
    await page.route('**/assets/models/hero/telemetry*',route=>route.abort());
    await page.goto(base+'/v5/');await page.locator('[data-v5-assembly]').scrollIntoViewIfNeeded();
    await page.waitForFunction(()=>document.querySelector('[data-v5-assembly]').dataset.state==='unavailable');
    assert(await page.locator('.assembly-poster').isVisible());
    assert.equal(await page.locator('[data-v5-assembly]').evaluate(el=>el.classList.contains('is-active')),false);
    await shot(page,'failed-model');await page.close();
  });
  await check('lost WebGL context returns static fallback',async()=>{
    const page=await makePage({viewport:{width:1200,height:900}});await prepare(page);
    const lost=await page.locator('canvas').evaluate(canvas=>{const gl=canvas.getContext('webgl2')||canvas.getContext('webgl');const ext=gl?.getExtension('WEBGL_lose_context');ext?.loseContext();return Boolean(ext);});
    assert(lost);await page.waitForFunction(()=>document.querySelector('[data-v5-assembly]').dataset.state==='unavailable');
    assert(await page.locator('.assembly-poster').isVisible());await page.close();
  });
  await check('skip during delayed model load does not expand above reader',async()=>{
    const page=await makePage({viewport:{width:1200,height:900}});
    let release;const gate=new Promise(resolve=>release=resolve);let requestedResolve;const requested=new Promise(resolve=>requestedResolve=resolve);
    await page.route('**/assets/models/hero/telemetry*',async route=>{requestedResolve();await gate;await route.continue();});
    await page.goto(base+'/v5/');await page.locator('[data-v5-assembly]').scrollIntoViewIfNeeded();await requested;
    await page.evaluate(()=>document.getElementById('work').scrollIntoView({behavior:'instant'}));
    await page.waitForTimeout(200);const before=await page.evaluate(()=>scrollY);release();
    await page.waitForFunction(()=>Boolean(document.querySelector('[data-v5-assembly]').assemblySnapshot),{},{timeout:90000});
    assert.equal(await page.locator('[data-v5-assembly]').evaluate(el=>el.classList.contains('is-active')),false);
    const after=await page.evaluate(()=>scrollY);assert(Math.abs(after-before)<5);
    await page.close();
  });
  report.status='passed';
})().catch(error=>{report.status='failed';report.error=String(error.stack||error);process.exitCode=1;console.error(error);}).finally(async()=>{
  fs.writeFileSync(path.join(output,'assembly-report.json'),JSON.stringify(report,null,2));
  await browser?.close();
});
