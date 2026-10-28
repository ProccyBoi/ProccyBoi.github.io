/* Deterministic lifecycle checks for the sleeping OLED texture helper.
   Run with node; no browser, renderer, character controller or GPU required. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../assets/dash-idle-blink.js'), 'utf8');
const tests = [], test = (name, run) => tests.push({name, run});
function harness({sourceSurface=false, decode=async()=>{}}={}) {
  let now=0, sequence=0, invalidations=0, permitted=true;
  const timers=new Map(), paints=[], images=[], diagnostics={dataset:{}};
  const image={width:128,height:64,decode};
  class Texture { constructor(canvas){this.image=canvas;} dispose(){this.disposed=true;} }
  class Material { constructor(values){Object.assign(this,values);} dispose(){this.disposed=true;} }
  const original=new Material(sourceSurface?{side:2}:{side:2,map:{image}});
  const screen={material:original,position:{z:4}},model={group:{getObjectByName:name=>name==='Inactive OLED viewing area'?screen:null}};
  const window={THREE:{CanvasTexture:Texture,MeshBasicMaterial:Material,sRGBEncoding:3001,NearestFilter:1003}};
  const context=vm.createContext({window,Image:class {constructor(){Object.assign(this,image);images.push(this);}set src(value){this.url=value;queueMicrotask(()=>this.onload());}},
    document:{createElement(name){assert.equal(name,'canvas');return {getContext:()=>({fillRect(){},drawImage(...args){paints.push(args);}})};}},
    setTimeout(callback,delay){const id=++sequence;timers.set(id,{at:now+delay,callback});return id;},clearTimeout(id){timers.delete(id);},
    requestAnimationFrame(){throw new Error('The blink helper must never own a rendering loop');}
  });
  vm.runInContext(source,context,{filename:'dash-idle-blink.js'});
  const mount=()=>window.DashIdleBlink.mount(model,{diagnostics,allowed:()=>permitted,invalidate:()=>invalidations++});
  const advance=duration=>{const end=now+duration;let count=0;while(true){const next=[...timers].filter(([,t])=>t.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];if(!next)break;assert.ok(++count<20,'No interval/animation loop');const[id,timer]=next;timers.delete(id);now=timer.at;timer.callback();}now=end;};
  return {mount,advance,timers,paints,images,screen,original,diagnostics,setAllowed:value=>{permitted=value;},invalidations:()=>invalidations};
}
test('reuses the decoded idle image and stays asleep before activation',async()=>{
  const h=harness(),blink=await h.mount();
  assert.equal(h.images.length,0);assert.equal(h.paints.length,1);assert.equal(h.timers.size,0);assert.equal(h.invalidations(),0);
  assert.equal(h.screen.material.map.image.width,128);assert.equal(h.screen.material.map.image.height,64);assert.equal(h.screen.position.z,4);
  blink.setActive(true);assert.equal(h.timers.size,1);h.advance(5199);assert.equal(h.invalidations(),0);assert.equal(h.diagnostics.dataset.dashBlinkState,'idle');
});
test('four transitions wait for displayed versions and then sleep',async()=>{
  const h=harness(),blink=await h.mount();blink.setActive(true);h.advance(5200);
  assert.equal(h.diagnostics.dataset.dashBlinkState,'closing');assert.equal(h.invalidations(),1);assert.equal(h.timers.size,0);
  const version=blink.version;blink.didRender(version-1);h.advance(10000);assert.equal(h.invalidations(),1,'No queued frames behind an unacknowledged draw');
  blink.didRender(version);h.advance(35);assert.equal(h.diagnostics.dataset.dashBlinkState,'closed');
  blink.didRender(blink.version);h.advance(90);assert.equal(h.diagnostics.dataset.dashBlinkState,'opening');
  blink.didRender(blink.version);h.advance(45);assert.equal(h.diagnostics.dataset.dashBlinkState,'open');
  blink.didRender(blink.version);assert.equal(h.diagnostics.dataset.dashBlinkCycles,'1');assert.equal(h.diagnostics.dataset.dashBlinkState,'idle');
  assert.equal(h.invalidations(),4);assert.equal(h.paints.length,5);assert.equal(h.timers.size,1);
  h.advance(6799);assert.equal(h.invalidations(),4);h.advance(1);assert.equal(h.invalidations(),5);
});
test('repeated rendered frames do not restart the idle delay',async()=>{
  const h=harness(),blink=await h.mount();blink.setActive(true);h.advance(5000);
  for(let i=0;i<30;i++){blink.setActive(true);blink.didRender(blink.version);}
  h.advance(200);assert.equal(h.invalidations(),1);assert.equal(h.diagnostics.dataset.dashBlinkState,'closing');
});
test('suspending during a blink restores open without requesting hidden work',async()=>{
  const h=harness(),blink=await h.mount();blink.setActive(true);h.advance(5200);const closing=blink.version;
  blink.setActive(false);assert.equal(h.timers.size,0);assert.equal(h.invalidations(),1);assert.ok(blink.version>closing);
  assert.equal(h.paints.at(-1)[2],0);assert.equal(h.paints.at(-1)[4],64);assert.equal(h.diagnostics.dataset.dashBlinkState,'paused');
  blink.didRender(closing);h.advance(60000);assert.equal(h.invalidations(),1);assert.equal(h.timers.size,0);
  blink.setActive(true);h.advance(5199);assert.equal(h.invalidations(),1);h.advance(1);assert.equal(h.invalidations(),2);
});
test('eligibility changing before a timer fires cannot produce a blink',async()=>{
  const h=harness(),blink=await h.mount();h.setAllowed(false);blink.setActive(true);assert.equal(h.timers.size,0);
  h.setAllowed(true);blink.setActive(true);h.setAllowed(false);h.advance(5200);
  assert.equal(h.invalidations(),0);assert.equal(h.timers.size,0);assert.equal(h.diagnostics.dataset.dashBlinkState,'paused');
});
test('image decoding precedes material changes and any close step',async()=>{
  let resolveDecode;const h=harness({decode:()=>new Promise(resolve=>{resolveDecode=resolve;})});const pending=h.mount();
  assert.equal(h.screen.material,h.original);assert.equal(h.timers.size,0);assert.equal(h.paints.length,0);
  resolveDecode();const blink=await pending;assert.notEqual(h.screen.material,h.original);assert.equal(h.paints.length,1);blink.dispose();
});
test('source CAD receives the same small image and restores resources on disposal',async()=>{
  const h=harness({sourceSurface:true}),blink=await h.mount();const material=h.screen.material,texture=material.map;
  assert.equal(h.images[0].url,'/assets/images/v2/dash-idle-display.png');assert.equal(h.screen.position.z,4.055);
  blink.setActive(true);blink.dispose();assert.equal(h.screen.material,h.original);assert.equal(h.screen.position.z,4);
  assert.equal(texture.disposed,true);assert.equal(material.disposed,true);assert.equal(h.original.disposed,undefined);assert.equal(h.timers.size,0);
  blink.setActive(true);blink.dispose();h.advance(60000);assert.equal(h.invalidations(),0);assert.equal(h.timers.size,0);
});
(async()=>{for(const {name,run} of tests){await run();console.log('PASS '+name);}console.log(`${tests.length} Dash idle-blink checks passed.`);})().catch(error=>{console.error(error);process.exitCode=1;});
