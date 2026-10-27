/* Local-only acceptance: source registration, reversal, accessibility and render lifecycle. */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright');
const base=process.env.V2_BASE_URL||'http://127.0.0.1:8080',route='/v2/projects/skylabs/reflow/';
const shots=path.resolve(__dirname,'../docs/reflow-review');
const snapshot=p=>p.locator('[data-reflow]').evaluate(e=>e.reflowSnapshot());
const scrub=async(p,v)=>{await p.locator('#rf-progress').fill(String(v));await p.waitForFunction(v=>Math.abs(Number(document.querySelector('[data-reflow]').dataset.progress)-v/1000)<.00001,v);};
(async()=>{
 fs.mkdirSync(shots,{recursive:true});
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_EXECUTABLE||'/usr/bin/chromium',args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const errors=[],bad=[],report={};
 const watch=p=>{p.on('pageerror',e=>errors.push(e.message));p.on('response',r=>{if(r.status()>=400)bad.push(r.status()+' '+r.url());});};
 try{
  const p=await browser.newPage({viewport:{width:1440,height:1100}});watch(p);p.setDefaultTimeout(20000);
  const start=Date.now();await p.goto(base+route);await p.locator('[data-state=ready]').waitFor({timeout:60000});await p.waitForFunction(()=>document.querySelector('[data-reflow]').dataset.frames>0);
  report.softwareWebGLReadyMs=Date.now()-start;
  assert.equal(await p.locator('[data-reflow]').getAttribute('data-lands'),'492');
  assert.ok((await snapshot(p)).parts.every(x=>!x.visible));
  await p.locator('[data-reflow]').screenshot({path:path.join(shots,'desktop-bare.png')});
  const states=new Map();
  for(const [name,phase] of [['paste',180],['placement',310],['placed',430],['heat',590],['reflow',770],['finished',1000]]){
   await scrub(p,phase);states.set(phase,(await snapshot(p)).parts);
   await p.locator('input').blur();
   await p.locator('[data-reflow]').screenshot({path:path.join(shots,'desktop-'+name+'.png')});
  }
  const finished=await snapshot(p);assert.ok(finished.parts.every(x=>x.visible&&JSON.stringify(x.position)===JSON.stringify(x.base)),'Final assembly must equal authored base positions');
  report.render={drawCalls:finished.drawCalls,triangles:finished.triangles,groups:finished.parts.length};
  for(const phase of [770,430,180,310,1000,180,770,0,1000]){
   await scrub(p,phase);
   const s=await snapshot(p);
   if(states.has(phase))assert.deepEqual(s.parts,states.get(phase),'Reverse and repeat must reconstruct identical poses');
   for(const part of s.parts){assert.equal(part.position[0],part.base[0]);assert.equal(part.position[2],part.base[2]);assert.deepEqual(part.quaternion,[0,0,0,1]);}
  }
  await scrub(p,770);assert.ok((await snapshot(p)).parts.filter(x=>x.late).every(x=>!x.visible),'Back and through-hole components are separate final operations');
  console.log('PASS source geometry, reverse and repeat');
  const before=(await snapshot(p)).frames;await p.waitForTimeout(650);assert.equal((await snapshot(p)).frames,before,'No idle rendering');
  await p.locator('[data-play]').click();await p.waitForFunction(()=>document.querySelector('[data-reflow]').reflowSnapshot().progress>.77);assert.ok((await snapshot(p)).progress>.77);await p.locator('[data-play]').click();const paused=(await snapshot(p)).progress;await p.waitForTimeout(250);assert.equal((await snapshot(p)).progress,paused);
  console.log('PASS idle, play and pause');
  await p.locator('[data-stage="0"]').click();await p.waitForTimeout(200);await p.locator('[data-stage="5"]').click();await p.waitForTimeout(150);await p.locator('[data-stage="1"]').click();await p.waitForFunction(()=>Math.abs(document.querySelector('[data-reflow]').reflowSnapshot().progress-.18)<.00001);assert.deepEqual((await snapshot(p)).parts,states.get(180));
  await p.locator('[data-view=top]').click();await p.locator('[data-zoom]').click();await p.locator('[data-reflow]').screenshot({path:path.join(shots,'desktop-detail.png')});await p.locator('[data-zoom]').click();await p.locator('[data-view=angle]').click();
  await p.locator('#rf-progress').focus();await p.keyboard.press('End');await p.waitForTimeout(100);assert.equal((await snapshot(p)).progress,1);await p.keyboard.press('Home');await p.waitForTimeout(100);assert.equal((await snapshot(p)).progress,0);
  await p.locator('[data-play]').click();await p.emulateMedia({reducedMotion:'reduce'});await p.waitForFunction(()=>!document.querySelector('[data-reflow]').reflowSnapshot().playing);assert.equal((await snapshot(p)).playing,false);assert.equal(await p.locator('[data-play]').isVisible(),false);await p.locator('[data-stage="5"]').click();await p.waitForTimeout(80);assert.equal((await snapshot(p)).progress,1);
  console.log('PASS live reduced motion, interrupted transitions and keyboard');
  await p.emulateMedia({reducedMotion:'no-preference'});await p.locator('[data-play]').waitFor({state:'visible'});await p.locator('[data-play]').click();await p.setViewportSize({width:1440,height:200});await p.evaluate(()=>scrollTo(0,document.body.scrollHeight));await p.waitForFunction(()=>!document.querySelector('[data-reflow]').reflowSnapshot().playing);assert.equal((await snapshot(p)).playing,false);const off=(await snapshot(p)).frames;await p.waitForTimeout(250);assert.equal((await snapshot(p)).frames,off);
  await p.setViewportSize({width:390,height:844});await p.locator('[data-reflow]').scrollIntoViewIfNeeded();await scrub(p,770);
  assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await p.evaluate(()=>{document.activeElement.blur();scrollTo({top:0,behavior:'instant'});});await p.waitForTimeout(200);await p.screenshot({path:path.join(shots,'mobile-reflow.png'),fullPage:true});
  await p.locator('[data-v2-menu]').click();assert.equal(await p.locator('[data-v2-menu]').getAttribute('aria-expanded'),'true');await p.keyboard.press('Escape');assert.equal(await p.locator('[data-v2-menu]').getAttribute('aria-expanded'),'false');
  await p.setViewportSize({width:320,height:568});assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await p.locator('canvas').evaluate(c=>{const gl=c.getContext('webgl2')||c.getContext('webgl');gl.getExtension('WEBGL_lose_context').loseContext();});await p.locator('[data-state=unavailable]').waitFor();assert.ok(await p.locator('.rf-poster').isVisible());assert.equal(await p.locator('.rf-controls').isVisible(),false);
  const noJS=await browser.newPage({javaScriptEnabled:false,viewport:{width:390,height:844}});watch(noJS);await noJS.goto(base+route);assert.ok(await noJS.locator('.rf-poster').isVisible());assert.ok(await noJS.locator('noscript').isVisible());assert.equal(await noJS.locator('.rf-controls').isVisible(),false);await noJS.close();
  const fail=await browser.newPage();watch(fail);await fail.route('**/telemetry.idx.bin.gz',r=>r.abort());await fail.goto(base+route);await fail.locator('[data-state=unavailable]').waitFor();assert.ok(await fail.locator('.rf-poster').isVisible());await fail.close();
  const save=await browser.newPage();watch(save);await save.addInitScript(()=>Object.defineProperty(navigator,'connection',{value:{saveData:true}}));const models=[];save.on('request',r=>{if(r.url().includes('telemetry.idx'))models.push(r.url());});await save.goto(base+route);await save.waitForTimeout(250);assert.equal(models.length,0);await save.getByRole('button',{name:'Load assembly'}).click();await save.locator('[data-state=ready]').waitFor({timeout:60000});await save.close();
  assert.deepEqual(errors,[]);assert.deepEqual(bad,[]);
  report.passed=['492 source-derived, undrilled front lands','exact final positions; unchanged rotations and X/Z throughout','six stages + repeated/reversed scrub + interrupted stage transitions','through-hole/back-side deferred until finish','play/pause/replay; keyboard Home/End','idle and offscreen rendering stops','live reduced-motion preference','desktop, 390 px and 320 px layouts; mobile navigation','context loss, failed CAD, no JavaScript and Save Data fallback'];
  fs.writeFileSync(path.join(shots,'results.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
