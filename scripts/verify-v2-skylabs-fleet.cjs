/* Actual browser, asset provenance, reversible native scroll and fallback checks. */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),crypto=require('node:crypto'),zlib=require('node:zlib');
const {chromium}=require('playwright');
const base=process.env.V2_BASE_URL||'http://127.0.0.1:8080',route='/v2/projects/skylabs/?fleet-capture';
for(const [slug,count] of [['skylabs-competition',134],['skylabs-mechanism',11]]){
 const dir='assets/models/aircraft/'+slug,manifest=JSON.parse(fs.readFileSync(dir+'/manifest.json')),bytes=fs.readFileSync(dir+'/assembly.glb');
 assert.equal(manifest.parts.length,count);assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),manifest.assetSha256);assert.deepEqual(zlib.gunzipSync(fs.readFileSync(dir+'/assembly.glb.gz')),bytes);
 const gltf=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)));assert.equal(gltf.nodes.length,count);assert.ok(gltf.nodes.every(n=>n.extras.sourceOccurrenceId));assert.ok(manifest.gzipBytes<4.3e6);
}
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_EXECUTABLE||'/usr/bin/chromium',headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const errors=[];fs.mkdirSync('.codex-temp/fleet',{recursive:true});
 async function open(options={},setup){const page=await browser.newPage(options);page.on('pageerror',e=>errors.push(e.message));if(setup)await setup(page);await page.goto(base+route);return page;}
 try{
  for(const [label,viewport] of [['desktop',{width:1440,height:1000}],['mobile',{width:390,height:844}]]){
   const page=await open({viewport});await page.locator('#aircraft').scrollIntoViewIfNeeded();await page.waitForFunction(()=>window.__skylabsFleet?.ready,null,{timeout:90000});
   for(const p of [.1,.3,.48,.62,1]){await page.evaluate(p=>window.__skylabsFleet.seek(p),p);await page.locator('.fleet-stage').screenshot({path:'.codex-temp/fleet/'+label+'-'+p+'.png'});}
   assert.ok(await page.evaluate(()=>{const f=window.__skylabsFleet;f.seek(.3);return ['fleet-trainer','fleet-competition'].every(name=>f.scene.getObjectByName(name)?.visible);}), 'Both real aircraft visible in one frame');
   const restored=await page.evaluate(()=>{const f=window.__skylabsFleet;f.seek(.62);const before=f.sensor.position.toArray(),image=f.renderer.domElement.toDataURL();f.seek(1);const deployed=f.sensor.position.toArray();f.seek(.62);return {before,after:f.sensor.position.toArray(),deployed,sameImage:image===f.renderer.domElement.toDataURL()};});assert.deepEqual(restored.before,restored.after);assert.notDeepEqual(restored.before,restored.deployed);assert.ok(restored.sameImage,'Exactly reversible canvas');
   // Ordinary native scroll must update in both directions without capture seeks.
   for(const p of [.15,.82,.15]){await page.evaluate(p=>{const t=document.querySelector('.fleet-track'),s=document.querySelector('.fleet-stage');scrollTo(0,scrollY+t.getBoundingClientRect().top-110+p*(t.offsetHeight-s.offsetHeight));},p);await page.waitForFunction(p=>Math.abs(Number(document.querySelector('[data-skylabs-fleet]').dataset.fleetProgress)-p)<.02,p);}
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'No horizontal overflow');
   await page.evaluate(()=>scrollTo(0,document.body.scrollHeight));await page.waitForTimeout(250);const old=await page.evaluate(()=>window.__skylabsFleet.renderer.info.render.frame);await page.waitForTimeout(250);assert.equal(await page.evaluate(()=>window.__skylabsFleet.renderer.info.render.frame),old,'Offscreen rendering stops');
   await page.emulateMedia({reducedMotion:'reduce'});await page.waitForFunction(()=>document.querySelector('[data-skylabs-fleet]').dataset.fleetState==='static');assert.equal(await page.locator('[data-skylabs-fleet]').getAttribute('data-fleet-state'),'static');assert.ok(await page.locator('.fleet-poster').evaluate(n=>getComputedStyle(n).visibility==='visible'));
   await page.close();
  }
  for(const kind of ['reduced','save-data','short','failed','context-loss','no-js']){
   const requests=[];const options={viewport:{width:390,height:kind==='short'?500:844},reducedMotion:kind==='reduced'?'reduce':'no-preference',javaScriptEnabled:kind!=='no-js'};
   const page=await open(options,async p=>{p.on('request',r=>{if(/skylabs-(competition|mechanism|trainer)\/(assembly|airframe)/.test(r.url()))requests.push(r.url());});if(kind==='save-data')await p.addInitScript(()=>Object.defineProperty(navigator,'connection',{value:Object.assign(new EventTarget(),{saveData:true})}));if(kind==='failed')await p.route('**/skylabs-competition/assembly.glb.gz',r=>r.abort());});
   await page.locator('#aircraft').scrollIntoViewIfNeeded();
   if(kind==='failed')await page.waitForFunction(()=>document.querySelector('[data-skylabs-fleet]').dataset.fleetState==='failed');
   else if(kind==='context-loss'){await page.waitForFunction(()=>window.__skylabsFleet?.ready,null,{timeout:90000});await page.evaluate(()=>window.__skylabsFleet.renderer.getContext().getExtension('WEBGL_lose_context').loseContext());await page.waitForFunction(()=>document.querySelector('[data-skylabs-fleet]').dataset.fleetState==='failed');}
   else {await page.waitForTimeout(400);assert.equal(requests.length,0,kind+' skips model delivery');}
   assert.ok(await page.locator('.fleet-poster').evaluate(n=>n.complete&&n.naturalWidth>0&&getComputedStyle(n).visibility==='visible'),kind+' preserves poster');
   await page.screenshot({path:'.codex-temp/fleet/'+kind+'.png'});await page.close();
  }
  assert.deepEqual(errors,[]);console.log('PASS: 145 new source nodes, gzip/hash parity, simultaneous trainer/competition, desktop/mobile visual captures, exact reversible poses, native scroll, idle pause, reduced motion, Save Data, short viewport, failed download, context loss, no JS.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
