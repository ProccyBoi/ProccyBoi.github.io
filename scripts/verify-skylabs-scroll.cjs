/* Scroll-only Skylabs acceptance. Run against a local server or V2_BASE_URL.
 * Captures actual viewport frames; never creates a multi-screen section image.
 */
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {chromium}=require('playwright');
const base=process.env.V2_BASE_URL||'http://127.0.0.1:8080';
const route='/v2/projects/skylabs/reflow/';
const shots=process.env.REFLOW_SCREENSHOTS||path.resolve(__dirname,'../docs/reflow-review');
const snap=p=>p.locator('[data-reflow]').evaluate(e=>e.reflowSnapshot());
const controls='button,input,select,[data-stage],[data-view],[data-play],.rf-story,.rf-heat,.rf-joint,.rf-view-label,.rf-part';
async function ready(p){
 await p.locator('[data-reflow][data-state="ready"]').waitFor({timeout:60000});
 await p.waitForFunction(()=>typeof document.querySelector('[data-reflow]').reflowSnapshot==='function');
}
async function settled(p){
 await p.waitForFunction(()=>{
  const s=document.querySelector('[data-reflow]').reflowSnapshot();
  return s.settled===true||(Number.isFinite(s.target)&&s.progress===s.target);
 },null,{timeout:20000});
}
async function scroll(p,phase){
 // A viewport update can land before the resize callback updates diagnostics.
 await p.waitForFunction(()=>{
  const e=document.querySelector('[data-reflow]'),s=e.reflowSnapshot(),stage=e.querySelector('canvas').parentElement;
  const header=parseFloat(getComputedStyle(e).getPropertyValue('--rf-header'))||76;
  return Math.abs(s.scrollSpan-(e.offsetHeight-stage.clientHeight))<1&&Math.abs(s.scrollStart-(e.getBoundingClientRect().top+scrollY-header))<1;
 },null,{timeout:20000});
 const y=await p.locator('[data-reflow]').evaluate((e,phase)=>{
  const s=e.reflowSnapshot();
  const start=s.scrollStart??e.getBoundingClientRect().top+scrollY;
  const span=s.scrollSpan??e.offsetHeight-innerHeight;
  const y=Math.round(start+span*phase+(phase===1?2:phase===0?-2:0));
  window.scrollTo({top:y,behavior:'instant'});return y;
 },phase);
 await p.waitForFunction(({y,phase})=>{
  const s=document.querySelector('[data-reflow]').reflowSnapshot();
  const expected=Math.max(0,Math.min(1,(scrollY-s.scrollStart)/s.scrollSpan));
  return Math.abs(scrollY-y)<=2&&Math.abs(s.progress-expected)<.001;
 },{y,phase},{timeout:20000});
 await settled(p);return snap(p);
}
(async()=>{
 fs.mkdirSync(shots,{recursive:true});
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_EXECUTABLE||'/usr/bin/chromium',args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const errors=[],bad=[];const report={base,route,passed:[]};
 const watch=p=>{p.on('pageerror',e=>errors.push(e.message));p.on('response',r=>{if(r.status()>=400)bad.push(r.status()+' '+r.url());});};
 try{
  const p=await browser.newPage({viewport:{width:1440,height:1000}});watch(p);p.setDefaultTimeout(20000);
  const start=Date.now();await p.goto(base+route);await ready(p);report.softwareWebGLReadyMs=Date.now()-start;
  assert.equal(await p.locator('[data-reflow]').locator(controls).count(),0,'Ready scene must contain no controls or stage labels');
  const text=await p.locator('[data-reflow]').innerText();
  assert.ok(!/AMBIENT|REFLOW|SOLIDIFIED|JOINT DETAIL|SOURCE CAD|FRONT ASSEMBLY/.test(text),'No former engineering overlays in the scene');
  assert.ok(await p.locator('[data-reflow]').evaluate(e=>e.offsetHeight>innerHeight*2),'Full-motion scene has a meaningful scroll runway');
  const states=new Map();
  for(const [name,phase] of [['bare',0],['paste',.16],['placement',.34],['heat',.56],['wetting',.74],['finished',1]]){
   const s=await scroll(p,phase);states.set(phase,s.parts);
   assert.ok(s.parts.every(part=>part.position.every(Number.isFinite)&&part.quaternion.every(Number.isFinite)),'All transforms finite');
   await p.screenshot({path:path.join(shots,'desktop-'+name+'.png')});
  }
  assert.ok(states.get(0).some(part=>!part.visible),'Bare-board opening hides unplaced components');
  assert.ok([.16,.34,.56,.74].some(phase=>JSON.stringify(states.get(phase))!==JSON.stringify(states.get(0))&&JSON.stringify(states.get(phase))!==JSON.stringify(states.get(1))),'At least one intermediate scroll frame must show an assembly in progress');
  const final=await snap(p);
  assert.ok(final.parts.length>0&&final.parts.every(x=>x.visible),'Full physical assembly is visible at the end');
  for(const part of final.parts){assert.deepEqual(part.position,part.base,'Each final component returns to original local base');assert.deepEqual(part.quaternion,part.baseQuaternion||[0,0,0,1]);}
  report.render={drawCalls:final.drawCalls,triangles:final.triangles,groups:final.parts.length};
  for(const phase of [.74,.34,.16,.56,1,0,.34,1]){
   const s=await scroll(p,phase);assert.deepEqual(s.parts,states.get(phase),'Reversing/repeating reconstructs the same local poses');
  }
  report.passed.push('scroll-only scene; six rendered stages; exact final component poses; repeated and reversed scroll');
  const resting=(await snap(p)).frames;await p.waitForTimeout(650);assert.equal((await snap(p)).frames,resting,'Rendering stops when scroll settles');
  await scroll(p,.34);const earlier=(await snap(p)).progress;await p.keyboard.press('PageDown');await p.waitForFunction(v=>document.querySelector('[data-reflow]').reflowSnapshot().progress>v,earlier);await settled(p);
  report.passed.push('native keyboard scroll; no idle render loop');
  await p.setViewportSize({width:390,height:844});await scroll(p,.74);assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await p.screenshot({path:path.join(shots,'mobile-wetting.png')});
  await scroll(p,1);await p.screenshot({path:path.join(shots,'mobile-finished.png')});
  await p.locator('[data-v2-menu]').click();assert.equal(await p.locator('[data-v2-menu]').getAttribute('aria-expanded'),'true');await p.keyboard.press('Escape');assert.equal(await p.locator('[data-v2-menu]').getAttribute('aria-expanded'),'false');
  await p.setViewportSize({width:320,height:568});await scroll(p,.34);assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await p.screenshot({path:path.join(shots,'small-mobile-placement.png')});
  report.passed.push('390 px and 320 px responsive scenes; primary mobile navigation');
  await p.emulateMedia({reducedMotion:'reduce'});await p.waitForFunction(()=>{const s=document.querySelector('[data-reflow]').reflowSnapshot();return s.progress===1&&s.parts.every(part=>part.visible&&part.position.every((v,i)=>v===part.base[i]));},null,{timeout:20000});await settled(p);
  assert.ok(await p.locator('[data-reflow]').evaluate(e=>e.offsetHeight<=innerHeight*1.6),'Reduced-motion scene removes long scrolling runway');
  const reducedParts=(await snap(p)).parts;await p.evaluate(()=>scrollTo({top:0,behavior:'instant'}));await p.waitForTimeout(250);assert.deepEqual((await snap(p)).parts,reducedParts,'Reduced motion does not animate from scroll');
  await p.evaluate(()=>scrollTo({top:document.querySelector('[data-reflow]').reflowSnapshot().scrollStart,behavior:'instant'}));await p.waitForTimeout(250);
  await p.screenshot({path:path.join(shots,'reduced-motion.png')});
  await p.emulateMedia({reducedMotion:'no-preference'});await scroll(p,.56);
  await p.setViewportSize({width:1440,height:200});await p.evaluate(()=>scrollTo({top:document.body.scrollHeight,behavior:'instant'}));
  await p.locator('[data-reflow] canvas').evaluate(canvas=>new Promise(resolve=>{
   // Observe the same physical viewport surface, then let queued lifecycle work
   // finish. This tests sustained inactivity without mistaking a final frame for a loop.
   const observer=new IntersectionObserver(entries=>{
    if(!entries[0].isIntersecting){observer.disconnect();requestAnimationFrame(()=>requestAnimationFrame(resolve));}
   });observer.observe(canvas.parentElement);
  }));
  const off=(await snap(p)).frames;await p.waitForTimeout(500);assert.equal((await snap(p)).frames,off,'Offscreen scene does not render');
  report.passed.push('live reduced-motion change gives a static assembled pose; offscreen rendering stops');
  await p.setViewportSize({width:390,height:844});await scroll(p,.74);
  await p.locator('[data-reflow] canvas').evaluate(c=>{const gl=c.getContext('webgl2')||c.getContext('webgl');gl.getExtension('WEBGL_lose_context').loseContext();});
  await p.locator('[data-reflow][data-state="unavailable"]').waitFor();assert.ok(await p.locator('.rf-poster').isVisible());
  await p.keyboard.press('Escape');await p.locator('.rf-poster').scrollIntoViewIfNeeded();
  await p.screenshot({path:path.join(shots,'context-loss.png')});
  const noJS=await browser.newPage({javaScriptEnabled:false,viewport:{width:390,height:844}});watch(noJS);await noJS.goto(base+route);assert.ok(await noJS.locator('.rf-poster').isVisible());assert.equal(await noJS.locator('[data-reflow] button,[data-reflow] input').count(),0);assert.ok(await noJS.locator('[data-reflow]').evaluate(e=>e.offsetHeight<=innerHeight*1.6));await noJS.close();
  const fail=await browser.newPage();watch(fail);let blockedCAD=0;
  // Match the resource path independently of its content-revision query.
  await fail.route(/\/telemetry\.idx\.bin\.gz(?:\?|$)/,r=>{blockedCAD++;return r.abort();});
  await fail.goto(base+route);await fail.locator('[data-state="unavailable"]').waitFor({timeout:60000});
  assert.ok(blockedCAD>0,'Failed-CAD scenario actually blocks the revisioned model request');
  assert.ok(await fail.locator('.rf-poster').isVisible());await fail.close();
  const save=await browser.newPage({viewport:{width:390,height:844}});watch(save);
  await save.addInitScript(()=>Object.defineProperty(navigator,'connection',{value:{saveData:true}}));const modelRequests=[];
  save.on('request',request=>{if(request.url().includes('telemetry.idx'))modelRequests.push(request.url());});
  await save.goto(base+route);await save.waitForTimeout(250);assert.equal(modelRequests.length,0,'Save Data does not fetch the CAD before consent');
  assert.ok(await save.locator('.rf-poster').isVisible());
  await save.locator('[data-reflow] button').click();await ready(save);await scroll(save,1);
  assert.ok((await snap(save)).parts.every(part=>part.visible));assert.equal(await save.locator('[data-reflow] button').count(),0);await save.close();
  report.passed.push('context loss, failed CAD and JavaScript-disabled static fallback; Save Data opt-in');
  assert.deepEqual(errors,[]);assert.deepEqual(bad,[]);
  fs.writeFileSync(path.join(shots,'results.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
