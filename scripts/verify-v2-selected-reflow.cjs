#!/usr/bin/env node
/* Source-only regression for Selected content reflow without window resize.
 * Executes the production controller with a minimal DOM/ResizeObserver fixture,
 * including the reproduced 834 -> 1729 scroll-distance change. No browser,
 * graphics, CSS-layout or GPU-timing validation is claimed by this test. */
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../assets/v2-selected-work.js'),'utf8');
const tick=()=>new Promise(resolve=>setTimeout(resolve,20));
function fixture({reduced=false,visible=false,settled=false,heroVisible=true,signal=true}={}){
  const listeners=new Map(),mediaListeners=new Map(),created=[],loads=[],transfers=[],focusMoves=[];
  let rootTop=visible?500:1000,stageTop=visible?660:1160,contentOrigin=1038.5,rafs=0;const observers=[];
  const hero={dataset:{assemblyModelsSettled:'3',assemblyState:'ready',...(signal?{assemblyReadableVisible:String(heroVisible),assemblyForegroundSettled:String(settled)}:{})},querySelector:()=>null,getBoundingClientRect:()=>({top:0,bottom:900})};
  class Element{
    constructor(tag){this.tagName=tag.toUpperCase();this.attributes=new Map();this.dataset={};this.style={};this.children=[];this.id='';this.offsetHeight=1600;this.clientWidth=1200;this.clientHeight=824;this.className='';this.inert=false;this.classList={add:(...xs)=>{const v=new Set(this.className.split(' '));xs.forEach(x=>v.add(x));this.className=[...v].join(' ');},remove:(...xs)=>{this.className=this.className.split(' ').filter(x=>!xs.includes(x)).join(' ');},contains:x=>this.className.split(' ').includes(x),toggle:(x,force)=>{force?this.classList.add(x):this.classList.remove(x);}};}
    setAttribute(k,v){this.attributes.set(k,String(v));} getAttribute(k){return this.attributes.get(k)??null;} hasAttribute(k){return this.attributes.has(k);}removeAttribute(k){this.attributes.delete(k);}
    append(...nodes){nodes.forEach(node=>{node.remove();node.parent=this;this.children.push(node);if(node.tagName==='SCRIPT')queueMicrotask(()=>node.onload());});}
    insertBefore(node,before){node.remove();node.parent=this;const index=this.children.indexOf(before);this.children.splice(index<0?this.children.length:index,0,node);}
    remove(){if(this.parent)this.parent.children=this.parent.children.filter(x=>x!==this);this.parent=null;}
    contains(node){return this===node||this.children.some(x=>x.contains(node));}
    addEventListener(){} focus(){focusMoves.push(this);} scrollIntoView(){focusMoves.push('scroll');}
    getBoundingClientRect(){if(this.className==='v2-selected-content')return{top:contentOrigin-context.scrollY,bottom:contentOrigin-context.scrollY+this.offsetHeight};return{top:this===root?rootTop:stageTop,bottom:(this===root?rootTop:stageTop)+(this===root?2000:824)};}
    querySelectorAll(selector){if(selector==='[data-selected-chapter]')return articles;if(selector==='img')return images;return[];}
  }
  const root=new Element('section');root.setAttribute('data-selected-background-scene','');
  const articles=['work-framework','work-transit'].map(id=>{const e=new Element('section');e.id=id;return e;});
  const images=Array.from({length:6},()=>({naturalWidth:1200,complete:true,dataset:{},decode:async()=>{}}));root.append(...articles);
  const media={matches:reduced,addEventListener:(_,fn)=>mediaListeners.set('reduced',fn)};
  const short={matches:false,addEventListener(){}};
  const document={hidden:false,documentElement:{},activeElement:null,head:new Element('head'),querySelector(selector){return selector==='[data-selected-work]'?root:selector==='[data-assembly]'?hero:selector==='.v2-header'?{getBoundingClientRect:()=>({bottom:76})}:null;},createElement(tag){created.push(tag);return new Element(tag);},addEventListener:(name,fn)=>listeners.set(name,fn)};
  const window={ResizeObserver:class{constructor(callback){this.callback=callback;this.nodes=new Set();observers.push(this);}observe(node){this.nodes.add(node);}disconnect(){this.nodes.clear();}},DecompressionStream,THREE:{},V2HeroAssets:{whenTransferSettled:async()=>{}},V2HeroEnvironment:{prefetch:async()=>{}},V2SelectedAssets:{prefetchTextures:async()=>{},prefetch:async name=>{transfers.push(name);},loadStatic:name=>{loads.push(name);return new Promise(()=>{});}}};
  const context={window,document,navigator:{connection:{}},matchMedia:q=>q.includes('reduced')?media:short,getComputedStyle:()=>({top:'76px',scrollPaddingTop:'76px'}),requestAnimationFrame:fn=>(rafs++,setTimeout(()=>fn(performance.now()),0)),cancelAnimationFrame:clearTimeout,setTimeout,clearTimeout,queueMicrotask,performance,innerHeight:900,scrollY:0,devicePixelRatio:1,location:{hash:'',search:''},addEventListener:(name,fn)=>listeners.set(name,fn),dispatchEvent:event=>listeners.get(event.type)?.(event),CustomEvent:class{constructor(type,{detail}){this.type=type;this.detail=detail;}},AbortController,URLSearchParams,console};
  vm.runInNewContext(source,context,{filename:'v2-selected-work.js'});
  return{root,articles,created,loads,transfers,focusMoves,hero,window,document,context,observers,rafs:()=>rafs,fire:name=>listeners.get(name)?.(),enter(){rootTop=400;stageTop=560;listeners.get('scroll')();},exitHero(){hero.dataset.assemblyReadableVisible='false';listeners.get('v2:hero-foreground')();},settle(){hero.dataset.assemblyForegroundSettled='true';listeners.get('v2:hero-foreground')();},reduce(){media.matches=true;mediaListeners.get('reduced')();}};
}
(async()=>{
 const f=fixture();await tick();await tick();assert.equal(f.observers.length,1);
 const observer=f.observers[0],track=f.articles[0].parent,stage=f.root.children.find(e=>e.className==='v2-selected-stage');
 assert.ok(observer.nodes.has(track)&&observer.nodes.has(stage)&&observer.nodes.has(f.root));
 track.offsetHeight=1668;stage.clientHeight=834;f.context.scrollY=1689;observer.callback();
 assert.equal(f.root.dataset.selectedProgress,(726.5/834).toFixed(6));
 const before=f.root.dataset.selectedPoseRevision,rafs=f.rafs();
 track.offsetHeight=2563;observer.callback();
 assert.equal(f.root.dataset.selectedProgress,(726.5/1729).toFixed(6),'Text-only extent change updates the actual mapping');
 assert.notEqual(f.root.dataset.selectedPoseRevision,before);
 const revision=f.root.dataset.selectedPoseRevision;
 for(let i=0;i<20;i++)observer.callback();
 assert.equal(f.root.dataset.selectedPoseRevision,revision,'Unchanged observations do not invalidate again');assert.equal(f.rafs(),rafs,'No observer RAF or offscreen rendering');
 f.document.hidden=true;track.offsetHeight=2700;observer.callback();
 assert.equal(f.root.dataset.selectedPoseRevision,revision,'Hidden reflow performs no scene work');
 f.document.hidden=false;f.fire('visibilitychange');
 assert.equal(f.root.dataset.selectedProgress,(726.5/1866).toFixed(6),'Foreground wake reconciles the missed hidden reflow');
 assert.deepEqual(f.focusMoves,[]);f.reduce();assert.equal(observer.nodes.size,0,'Static fallback disconnects observation');
 console.log('PASS Selected text reflow: exact old/new distance reproduction, batched no-op stability, no observer RAF, hidden wake reconciliation, no focus moves and fallback disconnection');
})().catch(error=>{console.error(error);process.exitCode=1;});
