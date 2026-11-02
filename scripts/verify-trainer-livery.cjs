/* Browser regression for trainer markings on the Projects hero covering. */
'use strict';
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const base=process.env.V2_BASE_URL||'http://127.0.0.1:8080';
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_EXECUTABLE||'/usr/bin/chromium',headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 try{
  await page.goto(base+'/v2/projects/?capture',{waitUntil:'domcontentloaded'});
  await page.locator('[data-aircraft-hero]').scrollIntoViewIfNeeded();
  await page.waitForFunction(()=>!!window.__v3Aircraft?.flight,null,{timeout:180000});
  async function seek(value){
   await page.evaluate(n=>window.__v3Aircraft.seekProgress(n),value);
   await page.waitForFunction(n=>{const r=document.querySelector('[data-aircraft-hero]');return Number(r.dataset.aircraftRenderedProgress)===n&&r.dataset.aircraftGPUPending==='false'&&r.dataset.aircraftWarmMask==='false';},value,{timeout:180000});
  }
  await seek(0);
  const names=await page.evaluate(()=>{const found=[];__v3Aircraft.flight.carrier.traverse(o=>{if(o.isMesh&&o.userData.trainerLivery)found.push({name:o.name,key:o.userData.trainerLivery,loaded:!!o.material.map?.image?.complete});});window.__trainerLiverySnapshot=Object.fromEntries(found.map(o=>{const m=__v3Aircraft.flight.carrier.getObjectByName(o.name);return [o.name,{positions:Array.from(m.geometry.attributes.position.array),uv:Array.from(m.geometry.attributes.uv.array)}];}));return found.sort((a,b)=>a.key.localeCompare(b.key));});
  assert.deepEqual(names.map(x=>x.key),['left-outer','right-inner','right-outer']);
  assert.ok(names.every(x=>x.loaded&&x.name.endsWith('-sheet-0')),'Only upper film sheets carry loaded trainer artwork');
  await seek(.2);
  const peeling=await page.evaluate(()=>Object.entries(window.__trainerLiverySnapshot).some(([name,s])=>{const p=__v3Aircraft.flight.carrier.getObjectByName(name).geometry.attributes.position.array;return s.positions.some((v,i)=>v!==p[i]);}));
  assert.ok(peeling,'A marked sheet deforms during the peel');
  await seek(0);
  const restored=await page.evaluate(()=>Object.entries(window.__trainerLiverySnapshot).every(([name,s])=>{const g=__v3Aircraft.flight.carrier.getObjectByName(name).geometry;return s.positions.every((v,i)=>v===g.attributes.position.array[i])&&s.uv.every((v,i)=>v===g.attributes.uv.array[i]);}));
  assert.ok(restored,'Marked geometry and UVs restore exactly');assert.deepEqual(errors,[]);
  console.log('PASS: trainer upper-wing livery loads, follows the peel and restores on reversal.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
