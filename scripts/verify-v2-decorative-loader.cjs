/* Source-only decorative loader acceptance. A deterministic canvas/RAF
 * double proves the loading flourish has a finite lifetime and no pointer
 * handlers. Real browser pixel validation is a separate acceptance step.
 * Run: node scripts/verify-v2-decorative-loader.cjs
 */
'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const repo=path.resolve(__dirname,'..');
let now=100,id=0;const raf=new Map(),listeners=[];
const node=()=>({dataset:{},style:{},classList:{toggle(){}},append(){},setAttribute(){},addEventListener(name){listeners.push(name);},removeEventListener(){},remove(){}});
const context2d={setTransform(){},clearRect(){},save(){},restore(){},translate(){},rotate(){}};
const document={hidden:false,createElement(type){return type==='canvas'?{...node(),getContext:()=>context2d}:node();},addEventListener(){},removeEventListener(){}};
const root=node();root.dataset.assemblyBackground='';const stage={...node(),clientWidth:1440,clientHeight:1000};
const posters=Array.from({length:3},()=>({...node(),naturalWidth:0,complete:false}));
const window={};const context=vm.createContext({window,document,performance:{now:()=>now},navigator:{},devicePixelRatio:1,matchMedia:()=>({matches:false,addEventListener(){},removeEventListener(){}}),ResizeObserver:class{observe(){}disconnect(){}},requestAnimationFrame(fn){raf.set(++id,fn);return id;},cancelAnimationFrame(key){raf.delete(key);},setTimeout(){throw new Error('Unexpected timer');},clearTimeout(){},Element:class{}});
vm.runInContext(fs.readFileSync(path.join(repo,'assets/v2-hero-loading.js'),'utf8'),context);
const loader=window.V2HeroLoading.create(root,stage,posters);
loader.setPose(0,{x:300,y:500,width:800,height:600,rotation:0,visible:true});
assert.equal(root.dataset.heroLoadingInteractive,'false');assert.equal(root.dataset.heroLoadingLensActive,'false');
assert.equal(listeners.filter(name=>name.startsWith('pointer')).length,0);
for(let i=0;i<130;i++){now+=1000/60;const pending=[...raf.values()];raf.clear();pending.forEach(fn=>fn(now));}
assert.equal(raf.size,0,'Stalled model transport cannot cause perpetual decorative RAF');
const frames=root.dataset.heroLoadingFrames;
loader.setPose(0,{x:320,y:490,width:800,height:600,rotation:0,visible:true});loader.modelReady(0);
assert.equal(raf.size,0,'Expired field does not restart invisible work on late CAD readiness');assert.equal(root.dataset.heroLoadingFrames,frames);
assert.ok(Number(frames)>0&&Number(frames)<50);loader.destroy();
console.log(`PASS finite decorative loader: ${frames} paints, no pointer listeners or late hidden redraw`);
